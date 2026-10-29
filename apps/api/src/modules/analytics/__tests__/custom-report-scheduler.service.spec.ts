import { CustomReportSchedulerService } from '../custom-report-scheduler.service';
import { CustomReportService } from '../custom-report.service';

describe('CustomReportSchedulerService (Sprint 3.10)', () => {
  let scheduler: CustomReportSchedulerService;
  let reportService: CustomReportService;

  const mockPrisma: any = {
    customReport: {
      findMany: jest.fn(),
    },
  };

  const mockNotificationService: any = {
    notifyUser: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    reportService = {
      exportCsv: jest.fn().mockResolvedValue('"rep","count"\r\n"Alice",10'),
      getReportById: jest.fn().mockResolvedValue({
        id: 'rep-1',
        name: 'Weekly Pipeline',
        createdBy: 'user-admin',
      }),
    } as any;

    scheduler = new CustomReportSchedulerService(
      reportService,
      mockNotificationService,
      mockPrisma,
    );
    jest.clearAllMocks();
  });

  describe('triggerFrequency', () => {
    it('enqueues eligible business/enterprise reports matching frequency and skips free/starter tiers', async () => {
      mockPrisma.customReport.findMany.mockResolvedValue([
        {
          id: 'rep-biz',
          organizationId: 'org-biz',
          schedule: { frequency: 'daily', recipients: ['exec@client.org'] },
          organization: { subscription: { planTier: 'business' } },
        },
        {
          id: 'rep-free',
          organizationId: 'org-free',
          schedule: { frequency: 'daily', recipients: ['owner@starter.org'] },
          organization: { subscription: { planTier: 'free' } }, // Ineligible tier
        },
        {
          id: 'rep-monthly',
          organizationId: 'org-biz',
          schedule: { frequency: 'monthly', recipients: ['cfo@client.org'] }, // Different frequency
          organization: { subscription: { planTier: 'business' } },
        },
      ]);

      const spy = jest.spyOn(scheduler, 'enqueueScheduledReport').mockResolvedValue(undefined);

      const count = await scheduler.triggerFrequency('daily');

      expect(count).toBe(1);
      expect(spy).toHaveBeenCalledWith('rep-biz', 'org-biz', ['exec@client.org']);
      expect(spy).not.toHaveBeenCalledWith('rep-free', expect.anything(), expect.anything());
    });
  });

  describe('processScheduledReport', () => {
    it('executes report, exports CSV, and dispatches notification to recipients and creator', async () => {
      const res = await scheduler.processScheduledReport('rep-1', 'org-1', [
        'lead1@client.org',
        'lead2@client.org',
      ]);

      expect(res.success).toBe(true);
      expect(res.csvLength).toBeGreaterThan(0);
      expect(reportService.exportCsv).toHaveBeenCalledWith('org-1', 'rep-1');
      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(2);
    });
  });
});
