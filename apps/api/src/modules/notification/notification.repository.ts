import { Injectable } from '@nestjs/common';
import { PrismaClient, InAppNotification, NotificationPreference } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import { NotificationPreferenceItem } from '@pactintel/shared-types';

@Injectable()
export class NotificationRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async createNotification(params: {
    organizationId: string;
    userId: string;
    eventType: string;
    title: string;
    body: string;
    resourceType?: string;
    resourceId?: string;
  }): Promise<InAppNotification> {
    const id = generateId();
    return this.prisma.inAppNotification.create({
      data: {
        id,
        organizationId: params.organizationId,
        userId: params.userId,
        eventType: params.eventType,
        title: params.title,
        body: params.body,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        isRead: false,
      },
    });
  }

  async findNotificationsByUser(
    userId: string,
    orgId: string,
    filter?: { isRead?: boolean; eventType?: string; cursor?: string; limit?: number },
  ): Promise<{ items: InAppNotification[]; nextCursor: string | null }> {
    const limit = filter?.limit || 20;
    const where: any = {
      userId,
      organizationId: orgId,
    };

    if (filter?.isRead !== undefined) {
      where.isRead = filter.isRead;
    }
    if (filter?.eventType) {
      where.eventType = filter.eventType;
    }

    const queryArgs: any = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
    };

    if (filter?.cursor) {
      queryArgs.cursor = { id: filter.cursor };
      queryArgs.skip = 1;
    }

    const results = await this.prisma.inAppNotification.findMany(queryArgs);
    let nextCursor: string | null = null;
    let items = results;

    if (results.length > limit) {
      nextCursor = results[limit].id;
      items = results.slice(0, limit);
    }

    return { items, nextCursor };
  }

  async markAsRead(id: string, userId: string, orgId: string): Promise<InAppNotification> {
    const existing = await this.prisma.inAppNotification.findFirst({
      where: { id, userId, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Notification ${id} not found for user ${userId}`);
    }

    return this.prisma.inAppNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string, orgId: string): Promise<{ count: number }> {
    return this.prisma.inAppNotification.updateMany({
      where: { userId, organizationId: orgId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async deleteNotification(id: string, userId: string, orgId: string): Promise<InAppNotification> {
    const existing = await this.prisma.inAppNotification.findFirst({
      where: { id, userId, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Notification ${id} not found for user ${userId}`);
    }

    return this.prisma.inAppNotification.delete({
      where: { id },
    });
  }

  async findPreferences(userId: string, orgId: string): Promise<NotificationPreference[]> {
    return this.prisma.notificationPreference.findMany({
      where: { userId, organizationId: orgId },
    });
  }

  async isChannelEnabled(
    userId: string,
    orgId: string,
    channel: string,
    eventType: string,
  ): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findFirst({
      where: { userId, organizationId: orgId, channel, eventType },
    });
    // Defaults to true if no explicit user override exists
    return pref ? pref.isEnabled : true;
  }

  async upsertPreferences(
    userId: string,
    orgId: string,
    items: NotificationPreferenceItem[],
  ): Promise<NotificationPreference[]> {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_channel_eventType: {
              userId,
              channel: item.channel,
              eventType: item.eventType,
            },
          },
          update: { isEnabled: item.isEnabled },
          create: {
            id: generateId(),
            organizationId: orgId,
            userId,
            channel: item.channel,
            eventType: item.eventType,
            isEnabled: item.isEnabled,
          },
        }),
      ),
    );
  }
}
