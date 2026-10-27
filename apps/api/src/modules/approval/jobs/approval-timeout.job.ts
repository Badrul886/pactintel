import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ApprovalService } from '../approval.service';
import { Queue, Worker } from 'bullmq';

@Injectable()
export class ApprovalTimeoutJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalTimeoutJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly approvalService: ApprovalService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('approval-timeout', { connection });

      // Upsert recurring job scheduler (RULE I-07: BullMQ job scheduler, never @Cron)
      await this.queue.upsertJobScheduler(
        'approval-timeout-check-hourly',
        { pattern: '0 * * * *' }, // Hourly cron pattern
        { name: 'check-approval-timeouts', data: {} },
      );

      this.worker = new Worker(
        'approval-timeout',
        async (_job) => {
          this.logger.log(
            '[ApprovalTimeoutJob] Executing hourly check for stalled approval steps...',
          );
          const count = await this.approvalService.checkApprovalTimeouts();
          this.logger.log(`[ApprovalTimeoutJob] Hourly check completed. Escalated ${count} steps.`);
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Approval timeout worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start approval timeout queue: ${err.message}. Running in simulated mode.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      // ignore teardown errors
    }
  }

  /**
   * Directly execute the timeout check for testing or on-demand invocation.
   */
  async runManualCheck(): Promise<number> {
    return this.approvalService.checkApprovalTimeouts();
  }
}
