import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { FollowUpRepository } from './follow-up.repository';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private readonly repo: FollowUpRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async listFollowUps(
    organizationId: string,
    userId: string,
    reason?: string,
    cursor?: string,
    limit = 50,
  ) {
    return this.repo.listPendingForUser(organizationId, userId, reason, cursor, limit);
  }

  /**
   * Confirms and dispatches a follow-up email from the nudge queue (RULE FOLLOW-001).
   * Validates that the document has not already been signed (RULE EC-EXPIRY-04).
   */
  async sendFollowUp(organizationId: string, userId: string, followUpId: string) {
    const item = await this.repo.findById(followUpId, organizationId);
    if (!item) {
      throw new NotFoundException(`Follow-up item '${followUpId}' not found.`);
    }

    const doc = item.document;
    if (!doc) {
      throw new NotFoundException(`Associated document for follow-up '${followUpId}' not found.`);
    }

    // RULE EC-EXPIRY-04: If document is already signed, dismiss follow-up and reject with 409
    if (doc.status === 'signed') {
      await this.repo.update(followUpId, { status: 'dismissed' });
      throw new HttpException(
        {
          code: 'DOCUMENT_ALREADY_SIGNED',
          message: 'Document has already been signed. Follow-up dismissed.',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Determine target recipient email
    const sigReq = (doc as any).signatureRequests?.[0];
    const recipientEmail =
      sigReq?.signers?.[0]?.email || (doc as any).recipientEmail || 'recipient@example.com';

    const sentAt = new Date();

    // In a transaction: update status and emit transactional outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await tx.followUpQueue.update({
        where: { id: followUpId },
        data: {
          status: 'sent',
          sentAt,
        },
      });

      await this.outbox.emit(tx, organizationId, 'follow_up.sent', followUpId, {
        followUpId,
        documentId: doc.id,
        recipientEmail,
        sentAt,
      });
    });

    // Enqueue actual notification email via resilient dispatch
    if (this.notificationService) {
      try {
        await this.notificationService.notifyUser(item.ownerId, organizationId, {
          eventType: 'follow_up_dispatched',
          title: `Follow-up sent for '${doc.title}'`,
          body: `Follow-up email successfully queued for delivery to ${recipientEmail}.`,
          resourceType: 'document',
          resourceId: doc.id,
          recipientEmail,
        });
      } catch (err: any) {
        this.logger.warn(`Could not dispatch notification: ${err.message}`);
      }
    }

    this.logger.log(
      `[FollowUpService] Follow-up ${followUpId} sent by user ${userId} for document ${doc.id}`,
    );

    return {
      status: 'sent',
      sentAt,
      recipientEmail,
    };
  }

  async snoozeFollowUp(
    organizationId: string,
    _userId: string,
    followUpId: string,
    snoozedUntil: Date,
  ) {
    const item = await this.repo.findById(followUpId, organizationId);
    if (!item) {
      throw new NotFoundException(`Follow-up item '${followUpId}' not found.`);
    }

    const updated = await this.repo.update(followUpId, {
      status: 'snoozed',
      snoozedUntil,
    });

    return updated;
  }

  async dismissFollowUp(organizationId: string, _userId: string, followUpId: string) {
    const item = await this.repo.findById(followUpId, organizationId);
    if (!item) {
      throw new NotFoundException(`Follow-up item '${followUpId}' not found.`);
    }

    const updated = await this.repo.update(followUpId, {
      status: 'dismissed',
    });

    return updated;
  }
}
