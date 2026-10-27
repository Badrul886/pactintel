import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class WebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    id?: string;
    organizationId: string;
    url: string;
    secretHash: string;
    secret?: string;
    events: string[];
  }) {
    return this.prisma.webhook.create({
      data: {
        id: data.id || generateId(),
        organizationId: data.organizationId,
        url: data.url,
        secretHash: data.secretHash,
        secret: data.secret,
        events: data.events,
        isActive: true,
        failureCount: 0,
      },
    });
  }

  async findById(id: string, organizationId?: string) {
    return this.prisma.webhook.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
      include: {
        _count: {
          select: { deliveryLogs: true },
        },
      },
    });
  }

  async findActiveByOrgAndEvent(organizationId: string, eventType: string) {
    return this.prisma.webhook.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        events: {
          has: eventType,
        },
      },
    });
  }

  async listByOrg(organizationId: string, cursor?: string, limit = 50) {
    const items = await this.prisma.webhook.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { deliveryLogs: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const records = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      items: records,
      nextCursor,
      hasMore,
    };
  }

  async update(
    id: string,
    data: {
      url?: string;
      events?: string[];
      isActive?: boolean;
      failureCount?: number;
      lastTriggeredAt?: Date;
    },
  ) {
    return this.prisma.webhook.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string, organizationId: string) {
    return this.prisma.webhook.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async incrementFailureCount(id: string): Promise<number> {
    const updated = await this.prisma.webhook.update({
      where: { id },
      data: {
        failureCount: { increment: 1 },
      },
      select: { failureCount: true, organizationId: true },
    });
    return updated.failureCount;
  }

  async resetFailureCount(id: string) {
    return this.prisma.webhook.update({
      where: { id },
      data: {
        failureCount: 0,
      },
    });
  }

  async disable(id: string) {
    return this.prisma.webhook.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  // --- Webhook Delivery Logs ---

  async findSuccessfulDelivery(webhookId: string, eventId: string) {
    return this.prisma.webhookDeliveryLog.findFirst({
      where: {
        webhookId,
        eventId,
        httpStatus: { gte: 200, lt: 300 },
      },
    });
  }

  async recordDeliveryLog(data: {
    id?: string;
    organizationId: string;
    webhookId: string;
    eventId: string;
    eventType: string;
    payloadHash: string;
    attemptNumber: number;
    httpStatus?: number | null;
    responseBody?: string | null;
    deliveredAt?: Date | null;
  }) {
    return this.prisma.webhookDeliveryLog.create({
      data: {
        id: data.id || generateId(),
        organizationId: data.organizationId,
        webhookId: data.webhookId,
        eventId: data.eventId,
        eventType: data.eventType,
        payloadHash: data.payloadHash,
        attemptNumber: data.attemptNumber,
        httpStatus: data.httpStatus,
        responseBody: data.responseBody,
        deliveredAt: data.deliveredAt,
      },
    });
  }

  async listDeliveryLogs(webhookId: string, organizationId: string, cursor?: string, limit = 50) {
    const items = await this.prisma.webhookDeliveryLog.findMany({
      where: {
        webhookId,
        organizationId,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const records = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      items: records,
      nextCursor,
      hasMore,
    };
  }
}
