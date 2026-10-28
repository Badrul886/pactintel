import { GuidedProposalService } from '../guided-proposal.service';
import { AiGateway } from '../gateway/ai.gateway';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrganizationService } from '../../organization/organization.service';
import { IntegrationService } from '../../integration/integration.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AssembleProposalDto } from '@pactintel/shared-types';

describe('GuidedProposalService Unit Tests (Sprint 3.4)', () => {
  let service: GuidedProposalService;
  let mockPrisma: any;
  let mockAiGateway: any;
  let mockOrgService: any;
  let mockIntegrationService: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const templateId = '33333333-3333-7333-8333-333333333333';

  const sampleTemplate = {
    id: templateId,
    organizationId: orgId,
    title: 'Enterprise Software & Cloud Services Proposal',
    content: { type: 'doc', content: [] },
    variableFields: [
      {
        id: 'q1',
        key: 'client_name',
        label: 'Client Name',
        type: 'text',
        required: true,
        crmFieldMapping: 'company_name',
      },
      {
        id: 'q2',
        key: 'include_sla',
        label: 'Include SLA?',
        type: 'single_select',
        required: true,
        options: ['Yes', 'No'],
      },
      {
        id: 'q3',
        key: 'sla_tier',
        label: 'SLA Support Tier',
        type: 'single_select',
        required: true,
        options: ['Platinum', 'Gold'],
        dependsOn: {
          questionId: 'include_sla',
          operator: 'equals',
          value: 'Yes',
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      template: {
        findFirst: jest.fn().mockResolvedValue(sampleTemplate),
      },
    };

    mockAiGateway = {
      generate: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Enterprise Proposal' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Executive Summary text' }],
            },
          ],
        }),
        taskId: 'guided-proposal-assembly',
        tokensUsed: 250,
      }),
    };

    mockOrgService = {
      getAiGuardrails: jest.fn().mockResolvedValue({ disabled: false, excludedDocumentIds: [] }),
      getCellRegion: jest.fn().mockResolvedValue('us'),
    };

    mockIntegrationService = {
      fetchCrmEntityData: jest.fn().mockResolvedValue({
        company_name: 'Acme Corp',
        deal_amount: 100000,
        contact_name: 'John Smith',
        contact_email: 'john@acme.com',
      }),
    };

    service = new GuidedProposalService(
      mockPrisma as unknown as PrismaService,
      mockAiGateway as unknown as AiGateway,
      mockOrgService as unknown as OrganizationService,
      mockIntegrationService as unknown as IntegrationService,
    );
  });

  // Test 1: assembleProposal calls AiGateway with guided-proposal-assembly task ID (not model name)
  it('calls AiGateway with guided-proposal-assembly task ID (never provider or model name)', async () => {
    const dto: AssembleProposalDto = {
      templateId,
      answers: {
        client_name: 'Acme Corp',
        include_sla: 'No',
      },
      crmEntityId: 'deal-123',
    };

    const result = await service.assembleProposal(orgId, userId, dto);

    expect(mockAiGateway.generate).toHaveBeenCalledWith(
      'guided-proposal-assembly',
      expect.objectContaining({
        templateTitle: sampleTemplate.title,
        answers: dto.answers,
        crmData: expect.objectContaining({ company_name: 'Acme Corp' }),
      }),
      { userId, organizationId: orgId },
    );
    expect(result.tokensUsed).toBe(250);
  });

  // Test 2: assembleProposal checks AI guardrails BEFORE calling LLM
  it('checks AI guardrails before calling LLM and aborts if guardrail fails', async () => {
    mockOrgService.getAiGuardrails.mockResolvedValueOnce({
      disabled: true,
      excludedDocumentIds: [],
    });

    const dto: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'No' },
    };

    await expect(service.assembleProposal(orgId, userId, dto)).rejects.toThrow(ForbiddenException);

    // Verify LLM was NEVER called
    expect(mockAiGateway.generate).not.toHaveBeenCalled();
  });

  // Test 3: assembleProposal returns 403 when guardrail violated
  it('returns 403 with code AI_GUARDRAIL_VIOLATION when guardrail violated', async () => {
    mockOrgService.getAiGuardrails.mockResolvedValueOnce({
      disabled: true,
      excludedDocumentIds: [],
    });

    const dto: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'No' },
    };

    try {
      await service.assembleProposal(orgId, userId, dto);
      fail('Expected 403 ForbiddenException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toEqual({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI features are disabled for your organization',
      });
    }
  });

  // Test 4: CRM data pull with graceful degradation (Invariant I-12)
  it('Invariant I-12: never blocks proposal creation if CRM is unavailable (uses placeholders and returns warning)', async () => {
    mockIntegrationService.fetchCrmEntityData.mockRejectedValueOnce(
      new Error('CRM connection timeout or credentials expired'),
    );

    const dto: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'No' },
      crmEntityId: 'deal-broken-999',
    };

    const result = await service.assembleProposal(orgId, userId, dto);

    // Verify document was assembled successfully without throwing
    expect(result).toBeDefined();
    expect(result.crmWarning).toBe(
      'CRM data could not be retrieved. Placeholders were used instead.',
    );
    expect(result.crmDataUsed).toEqual(
      expect.objectContaining({
        deal_name: '{{deal_name}}',
        company_name: '{{company_name}}',
        entity_id: 'deal-broken-999',
      }),
    );
    expect(mockAiGateway.generate).toHaveBeenCalledTimes(1);
  });

  // Test 5: AI blocks in output have metadata.createdBy = ai and attrs.createdBy = ai
  it('RULE AI-002: tags all generated Tiptap blocks with createdBy: ai', async () => {
    const dto: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'No' },
    };

    const result = await service.assembleProposal(orgId, userId, dto);

    const content = result.content as any;
    expect(content.type).toBe('doc');
    expect(content.content).toBeDefined();

    // Verify each child block node is tagged
    for (const node of content.content) {
      expect(node.attrs).toBeDefined();
      expect(node.attrs.createdBy).toBe('ai');
      expect(node.metadata?.createdBy).toBe('ai');
    }
  });

  // Test 6: Validates required intake answers
  it('throws BadRequestException if a required intake question answer is missing', async () => {
    const dto: AssembleProposalDto = {
      templateId,
      answers: {
        // client_name is missing!
        include_sla: 'No',
      },
    };

    await expect(service.assembleProposal(orgId, userId, dto)).rejects.toThrow(BadRequestException);
    expect(mockAiGateway.generate).not.toHaveBeenCalled();
  });

  // Test 7: Conditional dependsOn logic
  it('enforces required field only when its dependsOn condition is met', async () => {
    // When include_sla is 'No', sla_tier is NOT required
    const dtoNoSla: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'No' },
    };
    await expect(service.assembleProposal(orgId, userId, dtoNoSla)).resolves.toBeDefined();

    // When include_sla is 'Yes', sla_tier IS required!
    const dtoWithSlaMissingTier: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'Yes' },
    };
    await expect(service.assembleProposal(orgId, userId, dtoWithSlaMissingTier)).rejects.toThrow(
      BadRequestException,
    );

    // When include_sla is 'Yes' and sla_tier is provided, it succeeds
    const dtoWithSlaAndTier: AssembleProposalDto = {
      templateId,
      answers: { client_name: 'Acme Corp', include_sla: 'Yes', sla_tier: 'Platinum' },
    };
    await expect(service.assembleProposal(orgId, userId, dtoWithSlaAndTier)).resolves.toBeDefined();
  });

  // Test 8: Template not found throws 404
  it('throws NotFoundException when template does not exist or was deleted', async () => {
    mockPrisma.template.findFirst.mockResolvedValueOnce(null);

    const dto: AssembleProposalDto = {
      templateId: 'non-existent-template',
      answers: { client_name: 'Acme Corp' },
    };

    await expect(service.assembleProposal(orgId, userId, dto)).rejects.toThrow(NotFoundException);
  });
});
