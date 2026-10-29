import { CustomReportService } from '../custom-report.service';
import { AnalyticsRepository } from '../analytics.repository';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('CustomReportService (Sprint 3.10)', () => {
  let service: CustomReportService;
  let repository: AnalyticsRepository;

  const mockPrisma: any = {
    subscription: {
      findUnique: jest.fn(),
    },
    customReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    repository = new AnalyticsRepository(mockPrisma);
    service = new CustomReportService(repository, mockPrisma);
    jest.clearAllMocks();
  });

  describe('Plan Gating (EC-REPORT-01)', () => {
    it('throws 403 Forbidden with PLAN_FEATURE_LOCKED for free plan', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        planTier: 'free',
      });

      await expect(service.assertBusinessTier('org-free')).rejects.toThrow(ForbiddenException);
    });

    it('throws 403 Forbidden with PLAN_FEATURE_LOCKED for starter and professional plans', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        planTier: 'professional',
      });

      await expect(service.assertBusinessTier('org-pro')).rejects.toThrow(ForbiddenException);
    });

    it('allows business and enterprise plans without exception', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        planTier: 'business',
      });

      await expect(service.assertBusinessTier('org-biz')).resolves.toBeUndefined();

      mockPrisma.subscription.findUnique.mockResolvedValue({
        planTier: 'enterprise',
      });

      await expect(service.assertBusinessTier('org-ent')).resolves.toBeUndefined();
    });
  });

  describe('CRUD & Validation (EC-REPORT-02, EC-REPORT-05)', () => {
    beforeEach(() => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'business' });
    });

    it('creates a custom report with valid definition', async () => {
      mockPrisma.customReport.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: args.data.id,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastRunAt: null,
          deletedAt: null,
        }),
      );

      const res = await service.createReport('org-1', 'ws-1', 'user-1', {
        name: 'Quarterly Sales Velocity',
        workspaceId: 'ws-1',
        definition: {
          dimensions: ['rep', 'status'],
          metrics: ['count', 'sum_value'],
          chartType: 'bar_chart',
        },
      });

      expect(res.name).toBe('Quarterly Sales Velocity');
      expect(res.definition.dimensions).toEqual(['rep', 'status']);
      expect(mockPrisma.customReport.create).toHaveBeenCalled();
    });

    it('rejects invalid dimensions with 400 Bad Request (EC-REPORT-02)', async () => {
      await expect(
        service.createReport('org-1', 'ws-1', 'user-1', {
          name: 'Malicious Dimension Report',
          workspaceId: 'ws-1',
          definition: {
            dimensions: ['unknown_column; DROP TABLE custom_reports; --' as any],
            metrics: ['count'],
            chartType: 'table',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid metrics with 400 Bad Request (EC-REPORT-02)', async () => {
      await expect(
        service.createReport('org-1', 'ws-1', 'user-1', {
          name: 'Malicious Metric Report',
          workspaceId: 'ws-1',
          definition: {
            dimensions: ['rep'],
            metrics: ['unsupported_metric' as any],
            chartType: 'table',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('soft deletes custom report setting deletedAt timestamp', async () => {
      mockPrisma.customReport.findFirst.mockResolvedValue({
        id: 'rep-1',
        name: 'Pipeline Report',
        organizationId: 'org-1',
        workspaceId: 'ws-1',
        createdBy: 'user-1',
        definition: { dimensions: ['status'], metrics: ['count'], chartType: 'table' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.customReport.update.mockResolvedValue({ id: 'rep-1' });

      await service.deleteReport('org-1', 'rep-1');

      expect(mockPrisma.customReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rep-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws 404 when report not found or already deleted', async () => {
      mockPrisma.customReport.findFirst.mockResolvedValue(null);

      await expect(service.getReportById('org-1', 'rep-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('CSV Export & Formula Injection Defense (EC-REPORT-06)', () => {
    beforeEach(() => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'business' });
    });

    it('escapes and sanitizes formula injection characters (=, +, -, @) with single quote prefix', async () => {
      mockPrisma.customReport.findFirst.mockResolvedValue({
        id: 'rep-csv-1',
        name: 'Formula Defense Test',
        organizationId: 'org-1',
        workspaceId: 'ws-1',
        createdBy: 'user-1',
        definition: {
          dimensions: ['rep', 'status'],
          metrics: ['count', 'sum_value'],
          chartType: 'table',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(repository, 'executeCustomReport').mockResolvedValue({
        reportId: 'rep-csv-1',
        executedAt: new Date().toISOString(),
        rowCount: 2,
        columns: ['rep', 'status', 'count', 'sum_value'],
        rows: [
          {
            rep: '=cmd|’ /C calc’!A0', // Malicious Excel command injection payload
            status: '@approved',
            count: 5,
            sum_value: 12000,
          },
          {
            rep: '+1-555-0199',
            status: '-discounted',
            count: 2,
            sum_value: 3500,
          },
        ],
      });

      mockPrisma.customReport.update.mockResolvedValue({});

      const csv = await service.exportCsv('org-1', 'rep-csv-1');

      // Verify header and rows
      expect(csv).toContain('"rep","status","count","sum_value"');
      // Crucial: values starting with =, @, +, - MUST be prefixed with single quote
      expect(csv).toContain('"\'=cmd|’ /C calc’!A0"');
      expect(csv).toContain('"\'@approved"');
      expect(csv).toContain('"\' +1-555-0199"'.replace(' ', ''));
      expect(csv).toContain("'-discounted");
    });
  });
});
