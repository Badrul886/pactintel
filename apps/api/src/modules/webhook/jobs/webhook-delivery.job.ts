import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import * as crypto from 'crypto';
import { WebhookRepository } from '../webhook.repository';
import { WebhookService } from '../webhook.service';
import { WEBHOOK_PORT, WebhookPort } from '../ports/webhook.port';
import { NotificationService } from '../../notification/notification.service';

export interface WebhookDeliveryPayload {
  webhookId: string;
  organizationId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  attemptNumber?: number;
}

@Injectable()
export class WebhookDeliveryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly repo: WebhookRepository,
    private readonly service: WebhookService,
    @Inject(WEBHOOK_PORT) private readonly webhookAdapter: WebhookPort,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('webhook-delivery', { connection });

      this.worker = new Worker(
        'webhook-delivery',
        async (job: Job<WebhookDeliveryPayload>) => {
          await this.processDelivery(job.data, job.attemptsMade + 1);
        },
        {
          connection,
          concurrency: 10,
        },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`[WebhookDeliveryJob] Worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `[WebhookDeliveryJob] Could not start Redis queue: ${err.message}. Running in simulated mode.`,
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

  async enqueueDelivery(data: WebhookDeliveryPayload) {
    if (this.queue) {
      // RULE WH-001: 6 attempts with exponential backoff starting at 1000ms
      await this.queue.add('deliver-webhook', data, {
        attempts: 6,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      });
    }
  }

  /**
   * Processes a webhook delivery attempt with idempotency enforcement (RULE WH-001).
   * Can be invoked directly in unit/integration tests or triggered by BullMQ worker.
   */
  async processDelivery(
    data: WebhookDeliveryPayload,
    attemptNumber = 1,
  ): Promise<{ status: 'delivered' | 'skipped' | 'failed'; httpStatus?: number; error?: string }> {
    const { webhookId, organizationId, eventId, eventType, payload } = data;

    // 1. RULE WH-001: Idempotency check before HTTP dispatch
    const alreadyDelivered = await this.repo.findSuccessfulDelivery(webhookId, eventId);
    if (alreadyDelivered) {
      this.logger.log(
        `[WebhookDeliveryJob] Event '${eventId}' already successfully delivered to webhook ${webhookId}. Skipping (Idempotent).`,
      );
      return { status: 'skipped' };
    }

    // 2. Load latest webhook configuration
    const webhook = await this.repo.findById(webhookId, organizationId);
    if (!webhook || !webhook.isActive) {
      this.logger.log(
        `[WebhookDeliveryJob] Webhook ${webhookId} is deleted or inactive. Skipping delivery.`,
      );
      return { status: 'skipped' };
    }

    // 3. Compute payload hash and HMAC signature
    const payloadString = JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');
    const secret = await this.service.getWebhookSecret(webhookId, webhook.secret);

    // 4. Dispatch HTTP POST via WebhookPort adapter
    const result = await this.webhookAdapter.sendWebhook({
      url: webhook.url,
      payload,
      secret,
      eventType,
      eventId,
    });

    const now = new Date();

    if (result.success) {
      // 5. Success path: Record delivery log and reset failureCount
      await this.repo.recordDeliveryLog({
        organizationId: webhook.organizationId,
        webhookId,
        eventId,
        eventType,
        payloadHash,
        attemptNumber,
        httpStatus: result.httpStatus ?? 200,
        responseBody: result.responseBody ?? null,
        deliveredAt: now,
      });

      await this.repo.update(webhookId, {
        lastTriggeredAt: now,
        failureCount: 0,
      });

      return { status: 'delivered', httpStatus: result.httpStatus };
    } else {
      // 6. Failure path: Record attempt log and handle circuit breaker
      await this.repo.recordDeliveryLog({
        organizationId: webhook.organizationId,
        webhookId,
        eventId,
        eventType,
        payloadHash,
        attemptNumber,
        httpStatus: result.httpStatus ?? null,
        responseBody: result.error ?? result.responseBody ?? null,
        deliveredAt: null,
      });

      // Increment failure count
      const newFailureCount = await this.repo.incrementFailureCount(webhookId);

      // Auto-disable circuit breaker if failure count >= 10 (RULE EC-WH-06)
      if (newFailureCount >= 10 && webhook.isActive) {
        await this.repo.disable(webhookId);
        this.logger.warn(
          `[WebhookDeliveryJob] Webhook ${webhookId} reached 10 failures. Auto-disabled.`,
        );

        if (this.notificationService) {
          try {
            await this.notificationService.notifyUser(
              webhook.organizationId, // notify org admin
              webhook.organizationId,
              {
                eventType: 'webhook_auto_disabled',
                title: 'Webhook Auto-Disabled',
                body: `Webhook endpoint '${webhook.url}' was auto-disabled after 10 consecutive delivery failures.`,
                resourceType: 'webhook',
                resourceId: webhook.id,
              },
            );
          } catch {
            // non-critical notification failure
          }
        }
      }

      return { status: 'failed', httpStatus: result.httpStatus, error: result.error };
    }
  }
}
