import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * ExpiryListener handles outbox event triggers for expiry warnings and terminations.
 * Adheres to Invariant I-06 (Transactional Outbox) and D-07 (No EventEmitter2).
 */
@Injectable()
export class ExpiryListener {
  private readonly logger = new Logger(ExpiryListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async handleExpiryApproaching(payload: {
    documentId: string;
    organizationId: string;
    expiresAt: Date;
    title?: string;
  }) {
    this.logger.log(`[ExpiryListener] Expiry approaching for doc: ${payload.documentId}`);

    const doc = await this.prisma.document.findUnique({
      where: { id: payload.documentId },
      include: { owner: true },
    });

    if (doc && this.notificationService) {
      await this.notificationService.notifyUser(doc.ownerId, doc.organizationId, {
        eventType: 'document_expiring_soon',
        title: 'Document Expiring in 24 Hours',
        body: `'${doc.title}' will expire on ${new Date(payload.expiresAt).toLocaleDateString()}. Review your follow-up queue.`,
        resourceType: 'document',
        resourceId: doc.id,
        recipientEmail: doc.owner.email,
      });
    }
  }

  async handleDocumentExpired(payload: {
    documentId: string;
    organizationId: string;
    title?: string;
  }) {
    this.logger.log(`[ExpiryListener] Document expired: ${payload.documentId}`);

    const doc = await this.prisma.document.findUnique({
      where: { id: payload.documentId },
      include: { owner: true },
    });

    if (doc && this.notificationService) {
      await this.notificationService.notifyUser(doc.ownerId, doc.organizationId, {
        eventType: 'document_expired',
        title: 'Document Link Expired',
        body: `'${doc.title}' has expired. Recipients will now see the expired notice page.`,
        resourceType: 'document',
        resourceId: doc.id,
        recipientEmail: doc.owner.email,
      });
    }
  }
}
