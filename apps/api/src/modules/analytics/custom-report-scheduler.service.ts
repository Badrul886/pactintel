import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CustomReportService } from './custom-report.service';
import { NotificationService } from '../notification/notification.service';
import { Queue } from 'bullmq';

export const ANALYTICS_REPORTS_QUEUE = 'analytics-reports';

export interface ScheduledReportJobData {
  reportId: string;
  organizationId: string;
  recipients: string[];
}

@Injectable()
export class CustomReportSchedulerService {
  private readonly logger = new Logger(CustomReportSchedulerService.name);
  private prisma: PrismaClient;
  private queue: Queue<ScheduledReportJobData> | null = null;

  constructor(
    private readonly reportService: CustomReportService,
    @Optional() private readonly notificationService?: NotificationService,
    prisma?: any,
  ) {
    this.prisma = prisma || new PrismaClient();
    this.initQueue();
  }

  private initQueue() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }
    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      this.queue = new Queue<ScheduledReportJobData>(ANALYTICS_REPORTS_QUEUE, {
        connection: { host, port },
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not initialize BullMQ queue ${ANALYTICS_REPORTS_QUEUE}: ${err.message}`,
      );
    }
  }

  /**
   * Enqueues execution of a scheduled report (Invariant I-07: triggered via Cloud Scheduler, never @Cron in code).
   */
  async enqueueScheduledReport(
    reportId: string,
    organizationId: string,
    recipients: string[],
  ): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'run-scheduled-report',
        { reportId, organizationId, recipients },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log(`Enqueued scheduled report ${reportId} for org ${organizationId}`);
    } else {
      // In-process fallback for tests / local dev without Redis queue
      await this.processScheduledReport(reportId, organizationId, recipients);
    }
  }

  /**
   * Triggers scheduled execution for all reports matching a specific frequency.
   * Invoked via Cloud Scheduler HTTP trigger.
   */
  async triggerFrequency(frequency: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    const reports = await this.prisma.customReport.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        organization: {
          include: {
            subscription: true,
          },
        },
      },
    });

    let enqueuedCount = 0;
    for (const report of reports) {
      const schedule = report.schedule as any;
      if (!schedule || schedule.frequency !== frequency) continue;

      // EC-REPORT-01: Plan gating check
      const tier = (report.organization.subscription?.planTier || 'free').toLowerCase();
      if (!['business', 'enterprise'].includes(tier)) {
        this.logger.warn(
          `Skipping scheduled report ${report.id}: org ${report.organizationId} plan tier '${tier}' not eligible`,
        );
        continue;
      }

      const recipients = schedule.recipients || [];
      if (recipients.length === 0) continue;

      await this.enqueueScheduledReport(report.id, report.organizationId, recipients);
      enqueuedCount++;
    }

    return enqueuedCount;
  }

  /**
   * Processes a single scheduled report execution, generates CSV, and sends notification.
   */
  async processScheduledReport(
    reportId: string,
    organizationId: string,
    recipients: string[],
  ): Promise<{ success: boolean; csvLength: number }> {
    try {
      this.logger.log(`Executing scheduled report ${reportId} for org ${organizationId}`);
      const csv = await this.reportService.exportCsv(organizationId, reportId);
      const report = await this.reportService.getReportById(organizationId, reportId);

      // Send to recipients
      for (const recipient of recipients) {
        this.logger.log(
          `[ScheduledReport] Dispatched report '${report.name}' to ${recipient} (CSV bytes: ${csv.length})`,
        );
        if (this.notificationService && report.createdBy) {
          await this.notificationService.notifyUser(report.createdBy, organizationId, {
            eventType: 'custom_report.run',
            title: `Scheduled Report: ${report.name}`,
            body: `Report completed with ${csv.length} bytes for ${recipient}`,
            resourceType: 'custom_report',
            resourceId: reportId,
            recipientEmail: recipient,
          });
        }
      }

      return { success: true, csvLength: csv.length };
    } catch (err: any) {
      this.logger.error(
        `[ScheduledReport] Failed executing report ${reportId}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}
