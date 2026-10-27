import { AiGateway } from '../gateway/ai.gateway';
import { LlmPort, PROMPT_REGISTRY } from '@pactintel/ai';
import { AiRepository } from '../ai.repository';
import { OrganizationService } from '../../organization/organization.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  VERTEX_AI_EU_ENDPOINT,
  VERTEX_AI_US_ENDPOINT,
} from '../adapters/vertex-ai/vertex-ai.adapter';

describe('AiGateway Unit Tests (RULES AI-001..AI-004, Invariants I-14 & EC-AI-01..02)', () => {
  let gateway: AiGateway;
  let mockLlmPort: jest.Mocked<LlmPort>;
  let mockAiRepo: Partial<Record<keyof AiRepository, jest.Mock>>;
  let mockOrgService: Partial<Record<keyof OrganizationService, jest.Mock>>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const documentId = '33333333-3333-7333-8333-333333333333';

  beforeEach(() => {
    mockLlmPort = {
      endpoint: VERTEX_AI_US_ENDPOINT,
      generate: jest.fn(),
    } as unknown as jest.Mocked<LlmPort>;

    mockAiRepo = {
      logGeneration: jest.fn().mockResolvedValue({ id: 'log-123' }),
      listGenerationLogs: jest.fn(),
    };

    mockOrgService = {
      getAiGuardrails: jest.fn().mockResolvedValue({
        disabled: false,
        excludedDocumentIds: [],
      }),
      getCellRegion: jest.fn().mockResolvedValue('us'),
    };

    gateway = new AiGateway(
      mockLlmPort,
      mockAiRepo as unknown as AiRepository,
      mockOrgService as unknown as OrganizationService,
    );
  });

  // Test 1: Guardrail disabled for org -> 403 ForbiddenException
  it('Test 1: Guardrail disabled for org throws 403 ForbiddenException', async () => {
    mockOrgService.getAiGuardrails!.mockResolvedValueOnce({
      disabled: true,
      excludedDocumentIds: [],
    });

    await expect(
      gateway.generate(
        'draft-section',
        { sectionTitle: 'Scope', documentType: 'MSA' },
        { userId, organizationId: orgId },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockLlmPort.generate).not.toHaveBeenCalled();
    expect(mockAiRepo.logGeneration).not.toHaveBeenCalled();
  });

  // Test 2: Unknown taskId -> 400 BadRequestException
  it('Test 2: Unknown taskId throws 400 BadRequestException', async () => {
    await expect(
      gateway.generate('non-existent-task', { prompt: 'hack' }, { userId, organizationId: orgId }),
    ).rejects.toThrow(BadRequestException);

    expect(mockLlmPort.generate).not.toHaveBeenCalled();
  });

  // Test 3: Successful generation -> ai_generation_logs created with status='success'
  it('Test 3: Successful generation creates audit log with status=success and token counts', async () => {
    mockLlmPort.generate.mockResolvedValueOnce({
      content: 'Here is the drafted section content.',
      usage: { inputTokens: 50, outputTokens: 120 },
      finishReason: 'stop',
    });

    const result = await gateway.generate(
      'draft-section',
      {
        sectionTitle: 'Payment Terms',
        documentType: 'SOW',
        keyPoints: ['Net 30 days', 'Late penalty 1.5%'],
      },
      { userId, organizationId: orgId, documentId },
    );

    expect(result.content).toBe('Here is the drafted section content.');
    expect(result.tokensUsed).toBe(170);

    expect(mockAiRepo.logGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        userId,
        documentId,
        taskId: 'draft-section',
        status: 'success',
        tokensInput: 50,
        tokensOutput: 120,
      }),
    );
  });

  // Test 4: LLM throws error -> ai_generation_logs created with status='error'
  it('Test 4: LLM failure logs error status and rethrows error', async () => {
    const error = new Error('Upstream provider timeout');
    (error as any).code = 'ETIMEDOUT';
    mockLlmPort.generate.mockRejectedValueOnce(error);

    await expect(
      gateway.generate(
        'draft-section',
        { sectionTitle: 'IP Rights', documentType: 'SOW' },
        { userId, organizationId: orgId },
      ),
    ).rejects.toThrow('Upstream provider timeout');

    expect(mockAiRepo.logGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        userId,
        taskId: 'draft-section',
        status: 'error',
        errorCode: 'ETIMEDOUT',
      }),
    );
  });

  // Test 5: promptHash is SHA-256 of prompt (verify no plaintext stored)
  it('Test 5: promptHash is exact SHA-256 hash of constructed prompt and no plaintext prompt stored', async () => {
    mockLlmPort.generate.mockResolvedValueOnce({
      content: 'Refined paragraph text.',
      usage: { inputTokens: 30, outputTokens: 40 },
    });

    const input = {
      originalText: 'This is the original rough text.',
      tone: 'formal' as const,
    };

    const promptDef = PROMPT_REGISTRY['refine-text'];
    const expectedPrompt = promptDef.userTemplate(input);
    const expectedHash = crypto.createHash('sha256').update(expectedPrompt).digest('hex');

    await gateway.generate('refine-text', input, {
      userId,
      organizationId: orgId,
      documentId,
    });

    expect(mockAiRepo.logGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        promptHash: expectedHash,
      }),
    );

    const loggedObject = mockAiRepo.logGeneration!.mock.calls[0][0];
    expect(loggedObject.prompt).toBeUndefined();
    expect(loggedObject.promptHash).toHaveLength(64);
  });

  // Test 6: EU org -> EU Vertex AI endpoint used (VERTEX_AI_EU_ENDPOINT)
  it('Test 6: European org routes to VERTEX_AI_EU_ENDPOINT for regional residency (I-14)', async () => {
    mockOrgService.getCellRegion!.mockResolvedValueOnce('eu');

    mockLlmPort.generate.mockResolvedValueOnce({
      content: 'German translated paragraph.',
      usage: { inputTokens: 40, outputTokens: 60 },
    });

    await gateway.generate(
      'translate',
      { text: 'Agreement between parties', targetLanguage: 'German' },
      { userId, organizationId: orgId },
    );

    expect(mockLlmPort.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: VERTEX_AI_EU_ENDPOINT,
      }),
    );
  });
});
