import { CustomReportService } from '../../src/modules/analytics/custom-report.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { NotFoundException } from '@nestjs/common';

describe('Custom Reports Lifecycle & Tenant Isolation (Sprint 3.10)', () => {
  let service: CustomReportService;
  let repository: AnalyticsRepository;

  // In-memory mock database preserving multi-tenant records
  const dbCustomReports = new Map<string, any>();
  const dbSubscriptions = new Map<string, any>();

  const mockPrisma: any = {
    subscription: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(dbSubscriptions.get(where.organizationId) || null);
      }),
    },
    customReport: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: data.id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastRunAt: null,
          deletedAt: null,
        };
        dbCustomReports.set(record.id, record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const results = Array.from(dbCustomReports.values()).filter((r) => {
          if (r.organizationId !== where.organizationId) return false;
          if (where.deletedAt === null && r.deletedAt !== null) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const match = Array.from(dbCustomReports.values()).find((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.organizationId && r.organizationId !== where.organizationId) return false;
          if (where.deletedAt === null && r.deletedAt !== null) return false;
          return true;
        });
        return Promise.resolve(match || null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = dbCustomReports.get(where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data, updatedAt: new Date() };
        dbCustomReports.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      document: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  };

  beforeEach(() => {
    dbCustomReports.clear();
    dbSubscriptions.clear();

    // Org A and Org B both have Business tier
    dbSubscriptions.set('org-a', { organizationId: 'org-a', planTier: 'business' });
    dbSubscriptions.set('org-b', { organizationId: 'org-b', planTier: 'business' });

    repository = new AnalyticsRepository(mockPrisma);
    service = new CustomReportService(repository, mockPrisma);
    jest.clearAllMocks();
  });

  describe('End-to-End Report Lifecycle', () => {
    it('creates, runs, exports, updates, and soft-deletes a custom report', async () => {
      // 1. Create Report
      const created = await service.createReport('org-a', 'ws-a', 'user-a', {
        name: 'Executive ARR by Representative',
        workspaceId: 'ws-a',
        definition: {
          dimensions: ['rep', 'status'],
          metrics: ['count', 'sum_value'],
          chartType: 'bar_chart',
        },
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Executive ARR by Representative');
      expect(created.organizationId).toBe('org-a');

      // 2. List Reports
      const list = await service.listReports('org-a');
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);

      // 3. Run Report
      jest.spyOn(repository, 'executeCustomReport').mockResolvedValue({
        reportId: created.id,
        executedAt: new Date().toISOString(),
        rowCount: 1,
        columns: ['rep', 'status', 'count', 'sum_value'],
        rows: [{ rep: 'Alice', status: 'signed', count: 1, sum_value: 50000 }],
        chartData: { categories: ['Alice'], series: [{ name: 'sum_value', data: [50000] }] },
      });

      const execResult = await service.runReport('org-a', created.id);
      expect(execResult.rowCount).toBe(1);
      expect(execResult.rows[0].rep).toBe('Alice');

      // 4. Export CSV
      const csv = await service.exportCsv('org-a', created.id);
      expect(csv).toContain('"rep","status","count","sum_value"');
      expect(csv).toContain('"Alice","signed","1","50000"');

      // 5. Update Report
      const updated = await service.updateReport('org-a', created.id, {
        name: 'Updated Executive ARR',
      });
      expect(updated.name).toBe('Updated Executive ARR');

      // 6. Delete Report
      await service.deleteReport('org-a', created.id);

      // Verify soft deleted
      const postDeleteList = await service.listReports('org-a');
      expect(postDeleteList).toHaveLength(0);

      await expect(service.getReportById('org-a', created.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('Multi-Tenant RLS Isolation (EC-REPORT-05)', () => {
    it('prevents Org B from retrieving or running a report created by Org A', async () => {
      const reportOrgA = await service.createReport('org-a', 'ws-a', 'user-a', {
        name: 'Org A Confidential Report',
        workspaceId: 'ws-a',
        definition: {
          dimensions: ['status'],
          metrics: ['count'],
          chartType: 'table',
        },
      });

      // Org B attempts to access Org A report -> must throw 404 NotFound
      await expect(service.getReportById('org-b', reportOrgA.id)).rejects.toThrow(
        NotFoundException,
      );

      // Org B attempts to execute Org A report -> must throw 404 NotFound
      await expect(service.runReport('org-b', reportOrgA.id)).rejects.toThrow(NotFoundException);

      // Org B lists reports -> returns empty array
      const orgBList = await service.listReports('org-b');
      expect(orgBList).toHaveLength(0);
    });
  });
});
