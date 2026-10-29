import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';

describe('Analytics Rollups & Funnel Integration (Sprint 3.10)', () => {
  let service: AnalyticsService;
  let repository: AnalyticsRepository;

  const mockPrisma: any = {
    document: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    teamMembership: {
      findMany: jest.fn(),
    },
    template: {
      findMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    repository = new AnalyticsRepository(mockPrisma);
    service = new AnalyticsService(repository);
    repository.clearBuffer();
    jest.clearAllMocks();
  });

  describe('Role-Based Scoping (EC-ROLLUP-01, EC-ROLLUP-02)', () => {
    it('Admin/Owner receives company-wide view without user filtering', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          status: 'signed',
          totalValue: 5000,
          sourceTemplateId: 'tmpl-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastViewedAt: new Date(),
        },
        {
          id: 'doc-2',
          status: 'sent',
          totalValue: 2500,
          sourceTemplateId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastViewedAt: null,
        },
      ]);

      const res = await service.getRollupOverview('org-1', 'admin', 'admin-user');

      expect(res.scope).toBe('company');
      expect(res.documentsSent).toBe(2);
      expect(res.documentsSigned).toBe(1);
      expect(res.conversionRatePct).toBe(50);
      expect(res.revenueClosedCents).toBe(500000);
      expect(mockPrisma.teamMembership.findMany).not.toHaveBeenCalled();
    });

    it('Manager receives team-scoped view filtering by team members', async () => {
      mockPrisma.teamMembership.findMany
        .mockResolvedValueOnce([{ teamId: 'team-sales' }]) // Manager's supervised teams
        .mockResolvedValueOnce([{ userId: 'rep-alice' }, { userId: 'rep-bob' }]); // Team members

      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-alice',
          status: 'signed',
          totalValue: 10000,
          sourceTemplateId: 'tmpl-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastViewedAt: new Date(),
        },
      ]);

      const res = await service.getRollupOverview('org-1', 'manager', 'mgr-user');

      expect(res.scope).toBe('team');
      expect(res.documentsSigned).toBe(1);
      expect(res.revenueClosedCents).toBe(1000000);
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: { in: ['rep-alice', 'rep-bob'] },
          }),
        }),
      );
    });

    it('Member receives personal view restricted to their own documents', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-member',
          status: 'viewed',
          totalValue: 3000,
          sourceTemplateId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastViewedAt: new Date(),
        },
      ]);

      const res = await service.getRollupOverview('org-1', 'member', 'member-123');

      expect(res.scope).toBe('personal');
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: 'member-123',
          }),
        }),
      );
    });
  });

  describe('Conversion Funnel & Deal Velocity', () => {
    it('computes created -> sent -> viewed -> signed funnel with deal velocity days', async () => {
      const now = Date.now();
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          status: 'signed',
          createdAt: new Date(now - 10 * 86400000), // created 10 days ago
          updatedAt: new Date(now - 2 * 86400000), // signed 2 days ago (8 days to sign)
          lastViewedAt: new Date(now - 7 * 86400000),
        },
        {
          id: 'doc-2',
          status: 'viewed',
          createdAt: new Date(now - 5 * 86400000),
          updatedAt: new Date(now - 4 * 86400000),
          lastViewedAt: new Date(now - 3 * 86400000),
        },
        {
          id: 'doc-3',
          status: 'draft',
          createdAt: new Date(now - 1 * 86400000),
          updatedAt: new Date(now - 1 * 86400000),
          lastViewedAt: null,
        },
      ]);

      const funnel = await service.getConversionFunnel('org-1', 'admin', 'admin-user');

      expect(funnel.createdCount).toBe(3);
      expect(funnel.sentCount).toBe(2);
      expect(funnel.viewedCount).toBe(2);
      expect(funnel.signedCount).toBe(1);
      expect(funnel.stages[0].stage).toBe('created');
      expect(funnel.stages[3].stage).toBe('signed');
      expect(funnel.dealVelocityDays.avgCreatedToSignedDays).toBeGreaterThan(0);
    });
  });

  describe('Template Performance Report', () => {
    it('aggregates conversion rate and revenue closed per template', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-t1',
          sourceTemplateId: 'tmpl-msa',
          status: 'signed',
          totalValue: 15000,
          createdAt: new Date(Date.now() - 5 * 86400000),
          updatedAt: new Date(),
        },
        {
          id: 'doc-t2',
          sourceTemplateId: 'tmpl-msa',
          status: 'sent',
          totalValue: 12000,
          createdAt: new Date(Date.now() - 3 * 86400000),
          updatedAt: new Date(),
        },
      ]);

      mockPrisma.template.findMany.mockResolvedValue([
        { id: 'tmpl-msa', title: 'Master Services Agreement' },
      ]);

      const items = await service.getTemplatePerformance('org-1', 'admin', 'admin-user');

      expect(items).toHaveLength(1);
      expect(items[0].templateId).toBe('tmpl-msa');
      expect(items[0].templateName).toBe('Master Services Agreement');
      expect(items[0].documentsSent).toBe(2);
      expect(items[0].documentsSigned).toBe(1);
      expect(items[0].conversionRatePct).toBe(50);
      expect(items[0].totalRevenueClosedCents).toBe(1500000);
    });
  });
});
