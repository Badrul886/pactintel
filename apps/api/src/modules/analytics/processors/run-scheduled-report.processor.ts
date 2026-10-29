import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  CustomReportSchedulerService,
  ANALYTICS_REPORTS_QUEUE,
  ScheduledReportJobData,
} from '../custom-report-scheduler.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class RunScheduledReportProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunScheduledReportProcessor.name);
  private worker: Worker<ScheduledReportJobData> | null = null;

  constructor(
    private readonly schedulerService: CustomReportSchedulerService,
    @Optional() private readonly cls?: ClsService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.worker = new Worker<ScheduledReportJobData>(
        ANALYTICS_REPORTS_QUEUE,
        async (job) => {
          const { reportId, organizationId, recipients } = job.data;
          this.logger.log(
            `[RunScheduledReportProcessor] Running scheduled report ${reportId} for org ${organizationId}`,
          );

          if (this.cls) {
            this.cls.set('organizationId', organizationId);
          }

          try {
            await this.schedulerService.processScheduledReport(
              reportId,
              organizationId,
              recipients,
            );
          } finally {
            if (this.cls) {
              this.cls.set('organizationId', null);
            }
          }
        },
        { connection, concurrency: 5 },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`[RunScheduledReportProcessor] Worker error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start RunScheduledReportProcessor: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
    } catch {
      // ignore
    }
  }
}
