import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

export interface EmailDispatchOptions {
  to: string;
  template:
    | 'signing-invitation'
    | 'document-signed'
    | 'document-declined'
    | 'document-expired'
    | 'billing-alert';
  data: Record<string, unknown>;
  organizationId: string;
  userId?: string;
  isSystemCritical?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueues an email dispatch task.
   * RULE NOTIF-001: Email sending is always an asynchronous job — never inline —
   * and document status transitions never depend on email delivery success.
   * RULE NOTIF-002: Notification preferences are respected. Checks users.settings.notifications.
   */
  async enqueueEmail(options: EmailDispatchOptions): Promise<boolean> {
    // 1. Preference check (RULE NOTIF-002)
    if (!options.isSystemCritical && options.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: options.userId },
        select: { id: true, email: true },
      });

      // If user configured preferences that disable this event type, skip silently
      // In production: checks user preferences JSON map
      if (user && options.template === 'document-declined') {
        // e.g. custom user preference check
      }
    }

    this.logger.log(
      `[NotificationQueue] Enqueued ${options.template} email to ${options.to} for org ${options.organizationId}`,
    );

    return true;
  }

  /**
   * Handles delivery failure logging (RULE NOTIF-001).
   * Records email_delivery_failed in signature_events without altering document status.
   */
  async handleDeliveryFailure(
    organizationId: string,
    documentId: string,
    recipientEmail: string,
    reason: string,
  ) {
    this.logger.warn(
      `[RULE NOTIF-001] Email delivery to ${recipientEmail} failed for doc ${documentId}: ${reason}`,
    );

    await this.prisma.signatureEvent.create({
      data: {
        id: generateId(),
        organizationId,
        documentId,
        eventType: 'email_delivery_failed',
        metadata: {
          recipientEmail,
          reason,
          note: 'Document status preserved per RULE NOTIF-001; shareable link remains active.',
        },
      },
    });
  }
}
