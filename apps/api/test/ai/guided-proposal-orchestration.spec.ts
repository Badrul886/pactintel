import { GuidedProposalService } from '../../src/modules/ai/guided-proposal.service';
import { UrlToDraftService } from '../../src/modules/ai/url-to-draft.service';
import { AiGateway } from '../../src/modules/ai/gateway/ai.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { IntegrationService } from '../../src/modules/integration/integration.service';
import { AiRepository } from '../../src/modules/ai/ai.repository';
import {
  VertexAiAdapter,
  VERTEX_AI_EU_ENDPOINT,
} from '../../src/modules/ai/adapters/vertex-ai/vertex-ai.adapter';
import { ForbiddenException, HttpException } from '@nestjs/common';
import * as ssrfModule from '../../src/modules/ai/utils/ssrf-guard.util';

describe('Guided Proposal & URL-to-Draft End-to-End Orchestration', () => {
  let proposalService: GuidedProposalService;
  let urlToDraftService: UrlToDraftService;
  let gateway: AiGateway;
  let adapter: VertexAiAdapter;

  const orgUs = '0192a000-0000-7000-8000-000000000001';
  const orgEu = '0192a000-0000-7000-8000-000000000002';
  const userId = '0192a000-0000-7000-8000-000000000003';
  const templateId = '0192a000-0000-7000-8000-000000000004';

  const store = {
    templates: new Map<string, any>(),
    generationLogs: [] as any[],
  };

  beforeEach(async () => {
    store.templates.clear();
    store.generationLogs = [];

    store.templates.set(templateId, {
      id: templateId,
      organizationId: orgUs,
      title: 'Enterprise Cloud Services Proposal',
      content: { type: 'doc', content: [] },
      variableFields: [
        { key: 'client_name', label: 'Client Name', type: 'text', required: true },
        { key: 'target_value', label: 'Deal Value', type: 'number', required: false },
      ],
      deletedAt: null,
    });

    const mockPrisma: any = {
      template: {
        findFirst: jest.fn().mockImplementation(async ({ where }) => {
          const tpl = store.templates.get(where.id);
          if (
            tpl &&
            (tpl.organizationId === where.organizationId || where.organizationId === orgEu)
          ) {
            return tpl;
          }
          return null;
        }),
      },
    };

    const mockAiRepo: Partial<AiRepository> = {
      async logGeneration(params: any) {
        store.generationLogs.push(params);
        return params;
      },
    };

    const mockOrgService: Partial<OrganizationService> = {
      async getAiGuardrails(orgId: string) {
        if (orgId === 'restricted-org') {
          return { disabled: true, excludedDocumentIds: [] };
        }
        return { disabled: false, excludedDocumentIds: [] };
      },
      async getCellRegion(orgId: string) {
        return orgId === orgEu ? 'eu' : 'us';
      },
    };

    const mockIntegrationService: Partial<IntegrationService> = {
      async fetchCrmEntityData(_orgId: string, entityId: string) {
        if (entityId === 'crm-offline') {
          throw new Error('CRM network timeout');
        }
        return {
          company_name: 'Stripe, Inc.',
          deal_amount: 150000,
          contact_name: 'Patrick Collison',
        };
      },
    };

    adapter = new VertexAiAdapter();
    gateway = new AiGateway(
      adapter,
      mockAiRepo as AiRepository,
      mockOrgService as OrganizationService,
    );
    proposalService = new GuidedProposalService(
      mockPrisma as PrismaService,
      gateway,
      mockOrgService as OrganizationService,
      mockIntegrationService as IntegrationService,
    );
    urlToDraftService = new UrlToDraftService(gateway);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. Full proposal assembly with live CRM data
  it('1. Assembles full proposal end-to-end with live CRM context and AI-tagged blocks', async () => {
    const result = await proposalService.assembleProposal(orgUs, userId, {
      templateId,
      answers: { client_name: 'Stripe, Inc.', target_value: 150000 },
      crmEntityId: 'crm-stripe-deal',
    });

    expect(result).toBeDefined();
    expect(result.crmWarning).toBeNull();
    expect(result.crmDataUsed).toEqual(expect.objectContaining({ company_name: 'Stripe, Inc.' }));

    // Verify RULE AI-002: createdBy = 'ai' on all blocks
    const doc = result.content as any;
    expect(doc.type).toBe('doc');
    for (const block of doc.content) {
      expect(block.attrs?.createdBy).toBe('ai');
      expect(block.metadata?.createdBy).toBe('ai');
    }

    // Verify audit log recorded with hashed prompt
    expect(store.generationLogs.length).toBe(1);
    expect(store.generationLogs[0].promptHash).toBeDefined();
    expect(store.generationLogs[0].taskId).toBe('guided-proposal-assembly');
  });

  // 2. Invariant I-12 Graceful CRM Degradation
  it('2. Invariant I-12: Continues with placeholders and warning banner when CRM is offline', async () => {
    const result = await proposalService.assembleProposal(orgUs, userId, {
      templateId,
      answers: { client_name: 'Acme Corp' },
      crmEntityId: 'crm-offline',
    });

    expect(result).toBeDefined();
    expect(result.crmWarning).toBe(
      'CRM data could not be retrieved. Placeholders were used instead.',
    );
    expect(result.crmDataUsed.company_name).toBe('{{company_name}}');
  });

  // 3. RULE AI-003: Guardrail Rejection
  it('3. RULE AI-003: Returns 403 AI_GUARDRAIL_VIOLATION when organization disabled AI', async () => {
    await expect(
      proposalService.assembleProposal('restricted-org', userId, {
        templateId,
        answers: { client_name: 'Acme' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // 4. Data Residency (GDPR-002 & Invariant I-14)
  it('4. RULE GDPR-002: Routes EU-resident organization to Vertex AI EU regional endpoint', async () => {
    const generateSpy = jest.spyOn(adapter, 'generate');

    await proposalService.assembleProposal(orgEu, userId, {
      templateId,
      answers: { client_name: 'European Logistics BV' },
    });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: VERTEX_AI_EU_ENDPOINT,
      }),
    );
  });

  // 5. Public URL-to-Draft: Rate Limiting & Zero DB Writes
  it('5. Public URL-to-Draft tool enforces 3 req/hr rate limit and makes ZERO database writes', async () => {
    jest.spyOn(ssrfModule, 'fetchSafeUrl').mockResolvedValue({
      text: '<html><head><title>Acme Web</title></head><body>Enterprise Cloud</body></html>',
      status: 200,
      contentType: 'text/html',
    });

    const ip = '198.51.100.77';

    // 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await urlToDraftService.generateFromUrl(ip, { url: 'https://acme.com' });
      expect(res.title).toBeDefined();
    }

    // Verify ZERO database logs or writes for public tool
    expect(store.generationLogs.length).toBe(0);

    // 4th request returns 429
    await expect(
      urlToDraftService.generateFromUrl(ip, { url: 'https://acme.com' }),
    ).rejects.toThrow(HttpException);
  });
});
