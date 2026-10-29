import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import { EngagementScoringService } from '../engagement-scoring.service';
import { ClsService } from 'nestjs-cls';

export const ANALYTICS_ENGAGEMENT_QUEUE = 'analytics-engagement';

export interface ComputeEngagementScoreJobData {
  documentId: string;
  organizationId: string;
}

@Injectable()
export class ComputeEngagementScoreProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComputeEngagementScoreProcessor.name);
  private worker: Worker<ComputeEngagementScoreJobData> | null = null;

  constructor(
    private readonly scoringService: EngagementScoringService,
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

      this.worker = new Worker<ComputeEngagementScoreJobData>(
        ANALYTICS_ENGAGEMENT_QUEUE,
        async (job) => {
          const { documentId, organizationId } = job.data;
          this.logger.log(
            `[ComputeEngagementScoreProcessor] Processing score for doc ${documentId} (org ${organizationId})`,
          );

          if (this.cls) {
            this.cls.set('organizationId', organizationId);
          }

          try {
            await this.scoringService.evaluateDocumentEngagement(documentId, organizationId);
          } finally {
            if (this.cls) {
              this.cls.set('organizationId', null);
            }
          }
        },
        { connection, concurrency: 10 },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`[ComputeEngagementScoreProcessor] Worker error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start ComputeEngagementScoreProcessor: ${err.message}`);
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
