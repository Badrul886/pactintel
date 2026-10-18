/**
 * PactIntel Webhook & Outbox Event Types
 * Adheres to Blueprint §4, §13, and Invariant I-06 (transactional outbox)
 */

export type WebhookEventType =
  | 'document.created'
  | 'document.sent'
  | 'document.viewed'
  | 'document.signed'
  | 'document.declined'
  | 'document.expired'
  | 'document.voided'
  | 'signer.viewed'
  | 'signer.signed'
  | 'signer.declined'
  | 'signer.reassigned'
  | 'signature_request.created'
  | 'payment.initiated'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'template.created'
  | 'document.created_from_template';

export interface OutboxEventRecord {
  id: string;
  organizationId: string;
  eventType: WebhookEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
  processedAt?: Date | string | null;
}
