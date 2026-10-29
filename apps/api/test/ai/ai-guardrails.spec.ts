import { AiGateway } from '../../src/modules/ai/gateway/ai.gateway';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { AiRepository } from '../../src/modules/ai/ai.repository';
import { LlmPort } from '@pactintel/ai';
import { ForbiddenException } from '@nestjs/common';

describe('AI Guardrails Server-Side Enforcement (RULE AI-003)', () => {
  let aiGateway: AiGateway;
  let orgService: OrganizationService;
  let llmPort: jest.Mocked<LlmPort>;
  let aiRepository: jest.Mocked<AiRepository>;

  const orgId = '01948df9-8123-7020-9bc1-df837261a9bc';
  const userId = '01948df9-8123-7020-9bc1-df837261a9bd';

  beforeEach(() => {
    llmPort = {
      generate: jest.fn().mockResolvedValue({
        content: 'Generated legal clause text.',
        usage: { inputTokens: 50, outputTokens: 25 },
      }),
    } as any;

    aiRepository = {
      logGeneration: jest.fn().mockResolvedValue({} as any),
      recordGenerationLog: jest.fn().mockResolvedValue({} as any),
    } as any;

    orgService = new OrganizationService({} as any, {} as any);
    jest.spyOn(orgService, 'getCellRegion').mockResolvedValue('us');

    aiGateway = new AiGateway(llmPort, aiRepository, orgService);
  });

  it('allows generation when all guardrails pass', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: false,
      disabled: false,
      excludedWorkspaceIds: [],
      allowedCrmFields: ['deal_value', 'account_name'],
      disallowedCrmFields: [],
      allowedContentVariationTypes: ['tone', 'formality'],
      excludedDocumentIds: [],
    });

    const result = await aiGateway.generate(
      'draft-section',
      { task: 'Generate standard warranty clause' },
      {
        userId,
        organizationId: orgId,
        workspaceId: 'ws_valid',
        crmFieldsAccessed: ['deal_value'],
        contentVariationType: 'tone',
      },
    );

    expect(result.content).toBe('Generated legal clause text.');
    expect(result.tokensUsed).toBe(75);
  });

  it('blocks generation with 403 when kill switch is active', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: true,
    });

    await expect(
      aiGateway.generate('draft-section', { task: 'test' }, { userId, organizationId: orgId }),
    ).rejects.toThrow(ForbiddenException);

    try {
      await aiGateway.generate(
        'draft-section',
        { task: 'test' },
        { userId, organizationId: orgId },
      );
    } catch (err: any) {
      expect(err.getResponse()).toEqual({
        code: 'AI_GUARDRAIL_VIOLATION',
        violated_rule: 'kill_switch',
        message: 'AI features are disabled for your organization',
      });
    }
  });

  it('blocks generation when workspace is restricted by policy', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: false,
      excludedWorkspaceIds: ['ws_confidential_legal'],
    });

    await expect(
      aiGateway.generate(
        'draft-section',
        { task: 'test' },
        { userId, organizationId: orgId, workspaceId: 'ws_confidential_legal' },
      ),
    ).rejects.toThrow(ForbiddenException);

    try {
      await aiGateway.generate(
        'draft-section',
        { task: 'test' },
        { userId, organizationId: orgId, workspaceId: 'ws_confidential_legal' },
      );
    } catch (err: any) {
      expect(err.getResponse()).toEqual({
        code: 'AI_GUARDRAIL_VIOLATION',
        violated_rule: 'workspace_restriction',
        message: "AI features are restricted in workspace 'ws_confidential_legal'",
      });
    }
  });

  it('blocks generation when unauthorized CRM fields are accessed', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: false,
      disallowedCrmFields: ['ssn', 'bank_account_number'],
      allowedCrmFields: ['customer_name'],
    });

    await expect(
      aiGateway.generate(
        'draft-section',
        { task: 'test' },
        {
          userId,
          organizationId: orgId,
          crmFieldsAccessed: ['customer_name', 'ssn'],
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    try {
      await aiGateway.generate(
        'draft-section',
        { task: 'test' },
        {
          userId,
          organizationId: orgId,
          crmFieldsAccessed: ['customer_name', 'ssn'],
        },
      );
    } catch (err: any) {
      expect(err.getResponse().code).toBe('AI_GUARDRAIL_VIOLATION');
      expect(err.getResponse().violated_rule).toBe('data_source_restriction');
    }
  });

  it('blocks generation when content variation type is restricted', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: false,
      allowedContentVariationTypes: ['tone'],
    });

    await expect(
      aiGateway.generate(
        'draft-section',
        { task: 'test' },
        {
          userId,
          organizationId: orgId,
          contentVariationType: 'binding_liability_cap',
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    try {
      await aiGateway.generate(
        'draft-section',
        { task: 'test' },
        {
          userId,
          organizationId: orgId,
          contentVariationType: 'binding_liability_cap',
        },
      );
    } catch (err: any) {
      expect(err.getResponse().code).toBe('AI_GUARDRAIL_VIOLATION');
      expect(err.getResponse().violated_rule).toBe('content_variation_restriction');
    }
  });

  it('blocks generation when document is specifically excluded', async () => {
    orgService.setAiGuardrails(orgId, {
      killSwitch: false,
      excludedDocumentIds: ['doc_classified_nda'],
    });

    await expect(
      aiGateway.generate(
        'draft-section',
        { task: 'test' },
        { userId, organizationId: orgId, documentId: 'doc_classified_nda' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
