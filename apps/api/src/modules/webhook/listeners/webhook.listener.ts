import { Injectable, Logger } from '@nestjs/common';
import { WebhookRepository } from '../webhook.repository';
import { WebhookDeliveryJob } from '../jobs/webhook-delivery.job';
import { generateId } from '@pactintel/shared-utils';
import { OutboxEventRecord } from '@pactintel/shared-types';

@Injectable()
export class WebhookListener {
  private readonly logger = new Logger(WebhookListener.name);

  constructor(
    private readonly repo: WebhookRepository,
    private readonly deliveryJob: WebhookDeliveryJob,
  ) {}

  /**
   * Dispatches outbox events to all active webhooks subscribed to the event type.
   * Assigns unique eventId per delivery (RULE WH-001).
   */
  async handleOutboxEvent(event: OutboxEventRecord) {
    const webhooks = await this.repo.findActiveByOrgAndEvent(event.organizationId, event.eventType);

    if (webhooks.length === 0) {
      return;
    }

    this.logger.log(
      `[WebhookListener] Event '${event.eventType}' matches ${webhooks.length} webhooks for org ${event.organizationId}`,
    );

    for (const webhook of webhooks) {
      const eventId = generateId(); // Unique per event delivery
      const payload = {
        event: event.eventType,
        eventId,
        organizationId: event.organizationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        timestamp: event.createdAt,
        data: event.payload,
      };

      await this.deliveryJob.enqueueDelivery({
        webhookId: webhook.id,
        organizationId: event.organizationId,
        eventId,
        eventType: event.eventType,
        payload,
        attemptNumber: 1,
      });
    }
  }
}
