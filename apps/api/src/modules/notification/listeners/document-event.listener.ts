import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../notification.service';

export interface DocumentNotificationEventPayload {
  organizationId: string;
  documentId: string;
  ownerId: string;
  documentTitle: string;
  signerName?: string;
  reason?: string;
  recipientEmail?: string;
}

@Injectable()
export class DocumentEventListener {
  private readonly logger = new Logger(DocumentEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * analytics.document_viewed_first_time -> notifyUser(owner, 'document_viewed')
   */
  async onDocumentViewedFirstTime(event: DocumentNotificationEventPayload) {
    this.logger.log(
      `Outbox trigger: analytics.document_viewed_first_time for doc ${event.documentId}`,
    );
    return this.notificationService.notifyUser(event.ownerId, event.organizationId, {
      eventType: 'document_viewed',
      title: 'Document Viewed',
      body: `"${event.documentTitle}" was viewed for the first time by a recipient.`,
      resourceType: 'document',
      resourceId: event.documentId,
      recipientEmail: event.recipientEmail,
    });
  }

  /**
   * document.signed -> notifyUser(owner, 'document_signed')
   */
  async onDocumentSigned(event: DocumentNotificationEventPayload) {
    this.logger.log(`Outbox trigger: document.signed for doc ${event.documentId}`);
    return this.notificationService.notifyUser(event.ownerId, event.organizationId, {
      eventType: 'document_signed',
      title: 'Document Signed & Sealed',
      body: `"${event.documentTitle}" has been signed by ${event.signerName || 'recipient'}. Cryptographic certificate generated.`,
      resourceType: 'document',
      resourceId: event.documentId,
      recipientEmail: event.recipientEmail,
    });
  }

  /**
   * document.declined -> notifyUser(owner, 'document_declined')
   */
  async onDocumentDeclined(event: DocumentNotificationEventPayload) {
    this.logger.log(`Outbox trigger: document.declined for doc ${event.documentId}`);
    return this.notificationService.notifyUser(event.ownerId, event.organizationId, {
      eventType: 'document_declined',
      title: 'Document Declined',
      body: `"${event.documentTitle}" was declined. Reason: ${event.reason || 'No reason provided'}.`,
      resourceType: 'document',
      resourceId: event.documentId,
      recipientEmail: event.recipientEmail,
    });
  }

  /**
   * document.expired -> notifyUser(owner, 'document_expired')
   */
  async onDocumentExpired(event: DocumentNotificationEventPayload) {
    this.logger.log(`Outbox trigger: document.expired for doc ${event.documentId}`);
    return this.notificationService.notifyUser(event.ownerId, event.organizationId, {
      eventType: 'document_expired',
      title: 'Document Expired',
      body: `"${event.documentTitle}" reached its expiry deadline.`,
      resourceType: 'document',
      resourceId: event.documentId,
      recipientEmail: event.recipientEmail,
    });
  }
}
