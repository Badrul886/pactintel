import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject, Observable, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationRepository } from './notification.repository';
import { NotificationPreferenceItem } from '@pactintel/shared-types';
import { InAppNotification, NotificationPreference, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { getMessages, formatMessage, SupportedLocale, DEFAULT_LOCALE } from '@pactintel/i18n';
import { CircuitBreaker } from '../../common/resilience/circuit-breaker';

export interface EmailDispatchOptions {
  to: string;
  template:
    | 'signing-invitation'
    | 'document-signed'
    | 'document-declined'
    | 'document-expired'
    | 'billing-alert'
    | 'kba-lockout-notice';
  data: Record<string, unknown>;
  organizationId: string;
  userId?: string;
  locale?: string;
  isSystemCritical?: boolean;
}

export interface InAppNotificationPayload {
  eventType: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  recipientEmail?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // Per-user SSE active dispatch subjects
  private userStreamSubjects = new Map<string, Subject<MessageEvent>>();
  private repository: NotificationRepository;
  private prisma: PrismaClient | PrismaService;
  private readonly fcmBreaker = new CircuitBreaker({ name: 'fcm' });
  private readonly apnsBreaker = new CircuitBreaker({ name: 'apns' });

  constructor(
    repositoryOrPrisma: NotificationRepository | PrismaService | PrismaClient,
    prismaOptional?: PrismaService | PrismaClient,
  ) {
    if (repositoryOrPrisma && 'createNotification' in repositoryOrPrisma) {
      this.repository = repositoryOrPrisma as NotificationRepository;
      this.prisma = prismaOptional || new PrismaClient();
    } else {
      this.prisma = (repositoryOrPrisma || new PrismaClient()) as PrismaClient;
      this.repository = new NotificationRepository();
    }
  }

  /**
   * Enqueues an email dispatch task.
   * RULE NOTIF-001: Email sending is always an asynchronous job — never inline —
   * and document status transitions never depend on email delivery success.
   */
  async enqueueEmail(options: EmailDispatchOptions): Promise<boolean> {
    if (!options.isSystemCritical && options.userId) {
      const isEnabled = await this.repository.isChannelEnabled(
        options.userId,
        options.organizationId,
        'email',
        options.template.replace('-', '_'),
      );
      if (!isEnabled) {
        this.logger.log(
          `[RULE NOTIF-002] Email suppressed by user preference for user ${options.userId} (${options.template})`,
        );
        return false;
      }
    }

    const locale =
      options.locale || (await this.getOrgLocale(options.organizationId)) || DEFAULT_LOCALE;
    const rendered = this.renderEmailContent(options.template, locale, options.data);

    this.logger.log(
      `[NotificationQueue] Enqueued ${options.template} (${locale}) email to ${options.to} for org ${options.organizationId}: subject="${rendered.subject}"`,
    );
    return true;
  }

  /**
   * Dispatches an in-app and optional email notification to a user.
   * Checks user notification preferences before dispatch.
   */
  async notifyUser(
    userId: string,
    orgId: string,
    payload: InAppNotificationPayload,
  ): Promise<InAppNotification | null> {
    // 1. Check in_app channel preference
    const inAppEnabled = await this.repository.isChannelEnabled(
      userId,
      orgId,
      'in_app',
      payload.eventType,
    );

    let createdNotification: InAppNotification | null = null;

    if (inAppEnabled) {
      createdNotification = await this.repository.createNotification({
        organizationId: orgId,
        userId,
        eventType: payload.eventType,
        title: payload.title,
        body: payload.body,
        resourceType: payload.resourceType,
        resourceId: payload.resourceId,
      });

      // Push to active SSE stream (redis-realtime simulation)
      const userSubject = this.userStreamSubjects.get(userId);
      if (userSubject) {
        userSubject.next({
          data: {
            id: createdNotification.id,
            eventType: createdNotification.eventType,
            title: createdNotification.title,
            body: createdNotification.body,
            resourceType: createdNotification.resourceType,
            resourceId: createdNotification.resourceId,
            createdAt: createdNotification.createdAt.toISOString(),
          },
        });
      }
    }

    // 2. Check email channel preference (fire and forget)
    if (payload.recipientEmail) {
      const emailEnabled = await this.repository.isChannelEnabled(
        userId,
        orgId,
        'email',
        payload.eventType,
      );

      if (emailEnabled) {
        // RULE NOTIF-001: Never await email delivery in business transactions
        this.enqueueEmail({
          to: payload.recipientEmail,
          template: payload.eventType.replace('_', '-') as any,
          data: { title: payload.title, body: payload.body },
          organizationId: orgId,
          userId,
        }).catch((err) => {
          this.logger.warn(`Failed to enqueue notification email: ${err.message}`);
        });
      }
    }

    // 3. Dispatch to mobile devices if registered (Sprint 3.12 FCM/APNs push)
    this.dispatchPushNotification(userId, orgId, payload).catch((err) => {
      this.logger.warn(`Failed to dispatch push notification: ${err.message}`);
    });

    return createdNotification;
  }

  /**
   * Generates SSE EventSource stream for the authenticated user.
   * Emits a keep-alive ping every 30s to prevent Cloud Run proxy timeouts.
   */
  getSseStream(userId: string): Observable<MessageEvent> {
    let subject = this.userStreamSubjects.get(userId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.userStreamSubjects.set(userId, subject);
    }

    // 30-second heartbeat ping stream to prevent Cloud Run connection cutoffs
    const pingStream = interval(30000).pipe(
      map((): MessageEvent => ({
        data: { type: 'ping', timestamp: Date.now() },
      })),
    );

    return merge(subject.asObservable(), pingStream);
  }

  // --- Notification Inbox Operations ---

  async getNotifications(
    userId: string,
    orgId: string,
    filter?: { isRead?: boolean; eventType?: string; cursor?: string; limit?: number },
  ): Promise<{ items: InAppNotification[]; nextCursor: string | null }> {
    return this.repository.findNotificationsByUser(userId, orgId, filter);
  }

  async markAsRead(id: string, userId: string, orgId: string): Promise<InAppNotification> {
    return this.repository.markAsRead(id, userId, orgId);
  }

  async markAllAsRead(userId: string, orgId: string): Promise<{ count: number }> {
    return this.repository.markAllAsRead(userId, orgId);
  }

  async deleteNotification(id: string, userId: string, orgId: string): Promise<InAppNotification> {
    return this.repository.deleteNotification(id, userId, orgId);
  }

  async getPreferences(userId: string, orgId: string): Promise<NotificationPreference[]> {
    return this.repository.findPreferences(userId, orgId);
  }

  async updatePreferences(
    userId: string,
    orgId: string,
    items: NotificationPreferenceItem[],
  ): Promise<NotificationPreference[]> {
    return this.repository.upsertPreferences(userId, orgId, items);
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

  // --- i18n Email Rendering (RULE I18N-002) ---

  async getOrgLocale(organizationId: string): Promise<SupportedLocale> {
    try {
      const org = await (this.prisma as PrismaClient).organization.findUnique({
        where: { id: organizationId },
        select: { locale: true },
      });
      return (org?.locale as SupportedLocale) || DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  }

  renderEmailContent(
    template: string,
    locale: string,
    data: Record<string, unknown>,
  ): { subject: string; body: string } {
    const messages = getMessages(locale);
    const normalizedKey = template.replace(/-/g, '_');
    const subjectTemplate =
      messages[`email.${normalizedKey}.subject`] || `Notification from PactIntel`;
    const bodyTemplate = messages[`email.${normalizedKey}.body`] || `You have a new update.`;

    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' || typeof v === 'number') {
        vars[k] = v;
      }
    }

    return {
      subject: formatMessage(subjectTemplate, vars),
      body: formatMessage(bodyTemplate, vars),
    };
  }

  // --- Mobile Push Notification Operations (Sprint 3.12 Backend Readiness) ---

  async registerDevice(
    organizationId: string,
    userId: string,
    platform: 'ios' | 'android',
    token: string,
  ) {
    return (this.prisma as PrismaClient).device.upsert({
      where: { token },
      update: {
        organizationId,
        userId,
        platform,
        updatedAt: new Date(),
      },
      create: {
        id: generateId(),
        organizationId,
        userId,
        platform,
        token,
      },
    });
  }

  async deregisterDevice(organizationId: string, userId: string, deviceId: string) {
    return (this.prisma as PrismaClient).device.deleteMany({
      where: {
        id: deviceId,
        organizationId,
        userId,
      },
    });
  }

  async dispatchPushNotification(
    userId: string,
    organizationId: string,
    payload: InAppNotificationPayload,
  ): Promise<number> {
    try {
      const devices = await (this.prisma as PrismaClient).device.findMany({
        where: { userId, organizationId },
      });

      if (!devices || devices.length === 0) {
        return 0;
      }

      for (const device of devices) {
        const breaker = device.platform === 'ios' ? this.apnsBreaker : this.fcmBreaker;
        await breaker.execute(async () => {
          // Simulation of FCM/APNs push dispatch (with circuit breaker)
          this.logger.log(
            `[PushNotification] Delivered ${device.platform.toUpperCase()} push alert to token ${device.token.slice(0, 8)}... (${payload.title})`,
          );
        });
      }

      return devices.length;
    } catch (err: any) {
      this.logger.warn(`Push dispatch failed: ${err.message}`);
      return 0;
    }
  }
}
