import { AiGateway } from '../gateway/ai.gateway';
import { LlmPort } from '@pactintel/ai';
import { AiRepository } from '../ai.repository';
import { OrganizationService } from '../../organization/organization.service';
import { ForbiddenException } from '@nestjs/common';
import { VERTEX_AI_US_ENDPOINT } from '../adapters/vertex-ai/vertex-ai.adapter';

describe('AI Guardrails Unit Tests (RULES AI-003, AI-008 & EC-AI-03)', () => {
  let gateway: AiGateway;
  let mockLlmPort: jest.Mocked<LlmPort>;
  let mockAiRepo: Partial<Record<keyof AiRepository, jest.Mock>>;
  let mockOrgService: Partial<Record<keyof OrganizationService, jest.Mock>>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const confidentialDocId = 'confidential-doc-777';
  const allowedDocId = 'standard-doc-888';

  beforeEach(() => {
    mockLlmPort = {
      endpoint: VERTEX_AI_US_ENDPOINT,
      generate: jest.fn(),
    } as unknown as jest.Mocked<LlmPort>;

    mockAiRepo = {
      logGeneration: jest.fn().mockResolvedValue({ id: 'log-1' }),
      listGenerationLogs: jest.fn(),
    };

    mockOrgService = {
      getAiGuardrails: jest.fn(),
      getCellRegion: jest.fn().mockResolvedValue('us'),
    };

    gateway = new AiGateway(
      mockLlmPort,
      mockAiRepo as unknown as AiRepository,
      mockOrgService as unknown as OrganizationService,
    );
  });

  // Test 1: Org with AI guardrail excluding specific document -> 403
  it('Test 1: Guardrail excluding specific document throws 403 ForbiddenException', async () => {
    mockOrgService.getAiGuardrails!.mockResolvedValue({
      disabled: false,
      excludedDocumentIds: [confidentialDocId],
    });

    try {
      await gateway.generate(
        'draft-section',
        { sectionTitle: 'IP Clause', documentType: 'NDA' },
        { userId, organizationId: orgId, documentId: confidentialDocId },
      );
      fail('Expected 403 ForbiddenException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI is not permitted for this document',
      });
    }

    // Verify LLM was never called
    expect(mockLlmPort.generate).not.toHaveBeenCalled();
    expect(mockAiRepo.logGeneration).not.toHaveBeenCalled();

    // Verify non-excluded document passes guardrail
    mockLlmPort.generate.mockResolvedValueOnce({
      content: 'Standard clause drafted successfully.',
      usage: { inputTokens: 20, outputTokens: 40 },
    });

    const allowedResult = await gateway.generate(
      'draft-section',
      { sectionTitle: 'Standard Terms', documentType: 'Contract' },
      { userId, organizationId: orgId, documentId: allowedDocId },
    );

    expect(allowedResult.content).toBe('Standard clause drafted successfully.');
    expect(mockLlmPort.generate).toHaveBeenCalledTimes(1);
  });

  // Test 2: Org with all AI disabled -> 403
  it('Test 2: Org with all AI globally disabled throws 403 ForbiddenException', async () => {
    mockOrgService.getAiGuardrails!.mockResolvedValue({
      disabled: true,
      excludedDocumentIds: [],
    });

    try {
      await gateway.generate(
        'refine-text',
        { originalText: 'Please rewrite this text cleanly.' },
        { userId, organizationId: orgId },
      );
      fail('Expected 403 ForbiddenException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI features are disabled for your organization',
      });
    }

    expect(mockLlmPort.generate).not.toHaveBeenCalled();
    expect(mockAiRepo.logGeneration).not.toHaveBeenCalled();
  });
});
