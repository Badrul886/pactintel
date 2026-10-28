import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import {
  WorkflowEngineService,
  WORKFLOW_QUEUE_NAME,
  WorkflowJobData,
} from '../workflow-engine.service';
import { Worker } from 'bullmq';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProcessWorkflowNodeProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessWorkflowNodeProcessor.name);
  private worker: Worker<WorkflowJobData> | null = null;

  constructor(
    private readonly engine: WorkflowEngineService,
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

      this.worker = new Worker<WorkflowJobData>(
        WORKFLOW_QUEUE_NAME,
        async (job) => {
          const { instanceId, nodeId, organizationId } = job.data;
          this.logger.log(
            `[ProcessWorkflowNodeProcessor] Running job ${job.id} for instance ${instanceId}, node ${nodeId}`,
          );

          if (this.cls) {
            this.cls.set('organizationId', organizationId);
          }

          try {
            await this.engine.processNode(instanceId, nodeId, organizationId);
          } finally {
            if (this.cls) {
              this.cls.set('organizationId', null);
            }
          }
        },
        { connection, concurrency: 10 },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`[ProcessWorkflowNodeProcessor] Worker error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start ProcessWorkflowNodeProcessor: ${err.message}`);
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
