import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AutomationExecutor, AutomationExecutionContext } from '../automation.executor';
import { AutomationRuleDto } from '@pactintel/shared-types';
import { Queue, Worker } from 'bullmq';

export interface AutomationJobData {
  rule: AutomationRuleDto;
  eventPayload: Record<string, unknown>;
  context: AutomationExecutionContext;
}

@Injectable()
export class AutomationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationJob.name);
  private queue: Queue<AutomationJobData> | null = null;
  private worker: Worker<AutomationJobData> | null = null;

  constructor(private readonly executor: AutomationExecutor) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue<AutomationJobData>('automation-actions', { connection });

      this.worker = new Worker<AutomationJobData>(
        'automation-actions',
        async (job) => {
          const { rule, eventPayload, context } = job.data;
          this.logger.log(
            `[AutomationJob] Processing automation rule ${rule.id} (${rule.name})...`,
          );
          await this.executor.execute(rule, eventPayload, context);
        },
        { connection, concurrency: 5 },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Automation worker error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start automation queue: ${err.message}. Running in inline mode.`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      // ignore
    }
  }

  /**
   * Enqueues an automation action execution.
   */
  async enqueue(
    rule: AutomationRuleDto,
    eventPayload: Record<string, unknown>,
    context: AutomationExecutionContext,
  ): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add('execute-rule', { rule, eventPayload, context });
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue automation job: ${err.message}. Executing inline.`);
      }
    }

    // Direct execution fallback if queue is not active
    await this.executor.execute(rule, eventPayload, context);
  }
}
