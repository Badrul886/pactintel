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
  | 'document.created_from_template'
  | 'comment.created'
  | 'comment.resolved'
  | 'comment.reopened'
  | 'content_lock.acquired'
  | 'content_lock.released'
  | 'approval.chain.created'
  | 'approval.chain.triggered'
  | 'approval.step.decided'
  | 'approval.chain.approved'
  | 'approval.chain.rejected'
  | 'approval.step.auto_reassigned'
  | 'automation.rule.created'
  | 'automation.rule.executed'
  | 'automation.rule.failed'
  | 'document.expiry_approaching'
  | 'follow_up.sent'
  | 'webhook.delivered'
  | 'webhook.failed'
  | 'webhook.auto_disabled'
  | 'clickwrap.version.created'
  | 'clickwrap.version.published'
  | 'clickwrap.acceptance.recorded'
  | 'payment_credential.added'
  | 'payment_credential.revoked';

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
