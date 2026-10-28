import { Test, TestingModule } from '@nestjs/testing';
import { ObligationService } from '../../src/modules/portfolio/obligation.service';
import { CounterpartyService } from '../../src/modules/portfolio/counterparty.service';
import { PortfolioService } from '../../src/modules/portfolio/portfolio.service';
import { PortfolioRepository } from '../../src/modules/portfolio/portfolio.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MeilisearchAdapter } from '../../src/modules/portfolio/adapters/search/meilisearch.adapter';
import { PostgresFtsAdapter } from '../../src/modules/portfolio/adapters/search/postgres-fts.adapter';
import { AiGateway } from '../../src/modules/ai/gateway/ai.gateway';
import { NotFoundException, BadRequestException } from '@nestjs/common';

/**
 * Portfolio End-to-End Orchestration & Multi-Tenant Boundary Verification (Sprint 3.5)
 * Validates:
 * 1. Initial document obligation extraction and counterparty linking
 * 2. RULE PORT-001 Invariant: Amended document versions never auto-apply modified values
 * 3. Human verification, confirmation, and dismissal lifecycles
 * 4. Multi-tenant isolation: Tenant B cannot view or confirm Tenant A's obligations
 */
describe('Portfolio Orchestration & Multi-Tenant Isolation Tests (Sprint 3.5)', () => {
  let obligationService: ObligationService;
  let counterpartyService: CounterpartyService;
  let portfolioService: PortfolioService;

  const orgA = '00000000-0000-7000-8000-000000000001';
  const orgB = '00000000-0000-7000-8000-000000000002';

  // In-memory tenant store
  const store = {
    obligations: new Map<string, any>(),
    counterparties: new Map<string, any>(),
    documents: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.obligations.clear();
    store.counterparties.clear();
    store.documents.clear();

    const mockRepo: Partial<PortfolioRepository> = {
      async createObligation(data: any) {
        const id = `ob-${Date.now()}-${Math.random()}`;
        const record = {
          id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.obligations.set(id, record);
        return record;
      },

      async findObligationById(id: string, organizationId: string) {
        const ob = store.obligations.get(id);
        if (!ob || ob.organizationId !== organizationId) return null;
        return ob;
      },

      async findObligationsByDocument(documentId: string, organizationId: string) {
        return Array.from(store.obligations.values()).filter(
          (o) => o.documentId === documentId && o.organizationId === organizationId,
        );
      },

      async updateObligation(id: string, organizationId: string, data: any) {
        const ob = store.obligations.get(id);
        if (!ob || ob.organizationId !== organizationId) {
          throw new NotFoundException('Obligation not found in organization');
        }
        const updated = {
          ...ob,
          ...data,
          pendingUpdate:
            data.pendingUpdate === null ||
            data.pendingUpdate === undefined ||
            data.pendingUpdate?.constructor?.name === 'DbNull'
              ? null
              : data.pendingUpdate,
          updatedAt: new Date(),
        };
        store.obligations.set(id, updated);
        return updated;
      },

      async createCounterparty(data: any) {
        const id = `cp-${Date.now()}-${Math.random()}`;
        const record = {
          id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.counterparties.set(id, record);
        return record;
      },

      async findCounterpartyByName(organizationId: string, name: string) {
        return (
          Array.from(store.counterparties.values()).find(
            (c) =>
              c.organizationId === organizationId &&
              c.canonicalName.toLowerCase() === name.toLowerCase(),
          ) || null
        );
      },

      async findCounterparties(organizationId: string) {
        const items = Array.from(store.counterparties.values()).filter(
          (c) => c.organizationId === organizationId,
        );
        return { items, total: items.length };
      },

      async updateCounterparty(id: string, organizationId: string, data: any) {
        const cp = store.counterparties.get(id);
        if (!cp || cp.organizationId !== organizationId) throw new NotFoundException();
        const updated = { ...cp, ...data };
        store.counterparties.set(id, updated);
        return updated;
      },
    };

    const mockPrisma = {
      document: {
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const doc = store.documents.get(where.id);
          if (doc) Object.assign(doc, data);
          return doc;
        }),
      },
    };

    const mockMeili = {
      search: jest.fn().mockResolvedValue({ items: [], total: 0, engine: 'meilisearch' }),
    };

    const mockPgFts = {
      search: jest.fn().mockResolvedValue({ items: [], total: 0, engine: 'postgres-fts' }),
    };

    const mockAi = {
      generate: jest.fn().mockResolvedValue({ content: 'AI Report', tokensUsed: 100 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObligationService,
        CounterpartyService,
        PortfolioService,
        { provide: PortfolioRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MeilisearchAdapter, useValue: mockMeili },
        { provide: PostgresFtsAdapter, useValue: mockPgFts },
        { provide: AiGateway, useValue: mockAi },
      ],
    }).compile();

    obligationService = module.get(ObligationService);
    counterpartyService = module.get(CounterpartyService);
    portfolioService = module.get(PortfolioService);
  });

  it('orchestrates complete portfolio lifecycle: entity link -> initial extraction -> amendment review diff -> confirmation', async () => {
    expect(portfolioService).toBeDefined();
    const docId = 'doc-contract-001';
    store.documents.set(docId, {
      id: docId,
      organizationId: orgA,
      title: 'Master Services Agreement',
    });

    // 1. Counterparty entity deduplication & linking
    const cp = await counterpartyService.findOrCreateByName(orgA, 'Acme, Inc.', 'acme.corp', [
      'Acme',
    ]);
    expect(cp.canonicalName).toBe('Acme, Inc.');

    // 2. Initial document v1 extraction creates active obligation
    const [initialOb] = await obligationService.recordExtractedObligations(
      docId,
      'v1',
      orgA,
      [
        {
          fieldName: 'payment_terms',
          fieldValue: 'Net 30 days',
          confidenceScore: 0.95,
        },
      ],
      1,
    );

    expect(initialOb.fieldValue).toBe('Net 30 days');
    expect(initialOb.pendingUpdate).toBeUndefined();

    // Human verifies the initial obligation
    const verifiedOb = await obligationService.verify(initialOb.id, orgA);
    expect(verifiedOb.isVerified).toBe(true);

    // 3. Document Amendment v2 created with modified payment terms
    // RULE PORT-001 INVARIANT: Never auto-applies modified values!
    const [amendedOb] = await obligationService.recordExtractedObligations(
      docId,
      'v2',
      orgA,
      [
        {
          fieldName: 'payment_terms',
          fieldValue: 'Net 60 days', // Modified by counterparty amendment!
          confidenceScore: 0.99,
          sourceSnippet: 'Payment shall now be Net 60.',
        },
      ],
      2,
    );

    // Crucial Assertions: Active value remains 'Net 30 days' and pendingUpdate holds 'Net 60 days'
    expect(amendedOb.fieldValue).toBe('Net 30 days');
    expect(amendedOb.pendingUpdate).toBeDefined();
    expect((amendedOb.pendingUpdate as any)?.proposedValue).toBe('Net 60 days');

    // 4. Verify cannot mark as verified while amendment review is pending
    await expect(obligationService.verify(amendedOb.id, orgA)).rejects.toThrow(BadRequestException);

    // 5. User explicitly confirms proposed amendment
    const confirmedOb = await obligationService.confirmPendingUpdate(amendedOb.id, orgA);
    expect(confirmedOb.fieldValue).toBe('Net 60 days');
    expect(confirmedOb.isVerified).toBe(true);
    expect(confirmedOb.pendingUpdate).toBeNull();
  });

  it('RULE PORT-001: User dismissal of proposed amendment preserves original active value', async () => {
    const docId = 'doc-contract-002';
    const [initialOb] = await obligationService.recordExtractedObligations(
      docId,
      'v1',
      orgA,
      [{ fieldName: 'sla_uptime', fieldValue: '99.9%' }],
      1,
    );

    // Amendment proposes 99.5%
    await obligationService.recordExtractedObligations(
      docId,
      'v2',
      orgA,
      [{ fieldName: 'sla_uptime', fieldValue: '99.5%' }],
      2,
    );

    // User dismisses amendment
    const dismissedOb = await obligationService.dismissPendingUpdate(initialOb.id, orgA);
    expect(dismissedOb.fieldValue).toBe('99.9%');
    expect(dismissedOb.pendingUpdate).toBeNull();
  });

  it('enforces multi-tenant isolation: Tenant B cannot access or confirm Tenant A obligations', async () => {
    const docId = 'doc-contract-003';
    const [obA] = await obligationService.recordExtractedObligations(
      docId,
      'v1',
      orgA,
      [{ fieldName: 'confidentiality_term', fieldValue: '5 years' }],
      1,
    );

    // Tenant B attempts to read Tenant A's obligation
    await expect(obligationService.getObligationById(obA.id, orgB)).rejects.toThrow(
      NotFoundException,
    );

    // Tenant B attempts to verify Tenant A's obligation
    await expect(obligationService.verify(obA.id, orgB)).rejects.toThrow(NotFoundException);
  });
});
