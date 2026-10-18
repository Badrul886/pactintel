import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import { WebhookEventType } from '@pactintel/shared-types';

/**
 * Transactional Outbox Service
 * Invariant I-06: Every side-effect goes through the transactional outbox.
 * Writes events to outbox_events within the caller's Prisma transaction.
 */
@Injectable()
export class DocumentOutboxService {
  async emit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventType: WebhookEventType,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) {
    return tx.outboxEvent.create({
      data: {
        id: generateId(),
        organizationId,
        eventType,
        aggregateType: 'Document',
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
