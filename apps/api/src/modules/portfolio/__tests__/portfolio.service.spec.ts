import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioService } from '../portfolio.service';
import { PortfolioRepository } from '../portfolio.repository';
import { MeilisearchAdapter } from '../adapters/search/meilisearch.adapter';
import { PostgresFtsAdapter } from '../adapters/search/postgres-fts.adapter';
import { AiGateway } from '../../ai/gateway/ai.gateway';

describe('PortfolioService (Sprint 3.5 — Search Degradation & Intelligence)', () => {
  let service: PortfolioService;
  let meilisearch: jest.Mocked<MeilisearchAdapter>;
  let postgresFts: jest.Mocked<PostgresFtsAdapter>;
  let repository: jest.Mocked<PortfolioRepository>;
  let aiGateway: jest.Mocked<AiGateway>;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';

  beforeEach(async () => {
    const mockMeili = {
      search: jest.fn(),
      indexDocument: jest.fn(),
      deleteDocument: jest.fn(),
      healthCheck: jest.fn(),
    };

    const mockPgFts = {
      search: jest.fn(),
      indexDocument: jest.fn(),
      deleteDocument: jest.fn(),
      healthCheck: jest.fn(),
    };

    const mockRepo = {
      getPortfolioDashboardMetrics: jest.fn(),
      findObligations: jest.fn(),
      findCounterparties: jest.fn(),
      findCustomFields: jest.fn(),
      createCustomField: jest.fn(),
      deleteCustomField: jest.fn(),
    };

    const mockAi = {
      generate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: MeilisearchAdapter, useValue: mockMeili },
        { provide: PostgresFtsAdapter, useValue: mockPgFts },
        { provide: PortfolioRepository, useValue: mockRepo },
        { provide: AiGateway, useValue: mockAi },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    meilisearch = module.get(MeilisearchAdapter);
    postgresFts = module.get(PostgresFtsAdapter);
    repository = module.get(PortfolioRepository);
    aiGateway = module.get(AiGateway);
  });

  describe('search (RULE I-12: Graceful Degradation)', () => {
    it('uses primary MeilisearchAdapter when healthy', async () => {
      const mockResult = {
        items: [{ id: 'doc-1', title: 'Master Services Agreement', status: 'executed' }],
        total: 1,
        engine: 'meilisearch' as const,
      };
      meilisearch.search.mockResolvedValue(mockResult);

      const result = await service.search({
        query: 'services',
        organizationId: mockOrgId,
      });

      expect(result.engine).toBe('meilisearch');
      expect(result.items).toHaveLength(1);
      expect(postgresFts.search).not.toHaveBeenCalled();
    });

    it('INVARIANT I-12: Gracefully falls back to PostgresFtsAdapter when Meilisearch is offline/erroring', async () => {
      meilisearch.search.mockRejectedValue(new Error('Meilisearch connection timeout'));

      const fallbackResult = {
        items: [{ id: 'doc-1', title: 'Master Services Agreement', status: 'executed' }],
        total: 1,
        engine: 'postgres-fts' as const,
      };
      postgresFts.search.mockResolvedValue(fallbackResult);

      const result = await service.search({
        query: 'services',
        organizationId: mockOrgId,
      });

      expect(result.engine).toBe('postgres-fts');
      expect(result.items).toHaveLength(1);
      expect(postgresFts.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'services', organizationId: mockOrgId }),
      );
    });
  });

  describe('generatePortfolioReport', () => {
    it('assembles portfolio metrics and dispatches AI Gateway with task portfolio-report', async () => {
      repository.getPortfolioDashboardMetrics.mockResolvedValue({
        totalAgreements: 10,
        activeAgreements: 8,
        counterpartiesCount: 5,
        obligationCounts: { total: 20, verified: 15, pendingAmendments: 2, unverified: 3 },
        upcomingExpirations30: 2,
        upcomingExpirations90: 5,
      });

      repository.findObligations.mockResolvedValue({ items: [], total: 0 });
      repository.findCounterparties.mockResolvedValue({ items: [], total: 0 });

      aiGateway.generate.mockResolvedValue({
        content: '# Executive Portfolio Report\nAll contracts analyzed.',
        taskId: 'portfolio-report',
        tokensUsed: 1500,
      });

      const result = await service.generatePortfolioReport(mockOrgId, 'user-1', {
        focusArea: 'Renewal Risks',
      });

      expect(result.report).toContain('Executive Portfolio Report');
      expect(aiGateway.generate).toHaveBeenCalledWith(
        'portfolio-report',
        expect.objectContaining({
          focusArea: 'Renewal Risks',
        }),
        expect.objectContaining({
          organizationId: mockOrgId,
          userId: 'user-1',
        }),
      );
    });
  });
});
