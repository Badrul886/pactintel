import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, decodeCursor, buildCursorPage } from '@pactintel/shared-utils';

@Injectable()
export class FollowUpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingForUser(
    organizationId: string,
    ownerId: string,
    reason?: string,
    cursor?: string,
    limit = 50,
  ) {
    const decoded = decodeCursor(cursor);
    const items = await this.prisma.followUpQueue.findMany({
      where: {
        organizationId,
        ownerId,
        status: { in: ['pending', 'snoozed'] },
        ...(reason && reason !== 'all' ? { reason } : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            lastViewedAt: true,
            expiresAt: true,
          },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
      take: limit + 1,
      orderBy: { scheduledFor: 'asc' },
    });

    return buildCursorPage(items, limit);
  }

  async findById(id: string, organizationId?: string) {
    return this.prisma.followUpQueue.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        document: {
          include: {
            signatureRequests: {
              where: { status: { notIn: ['cancelled', 'expired'] } },
              include: { signers: true },
              take: 1,
            },
          },
        },
        owner: true,
      },
    });
  }

  async create(data: {
    id?: string;
    organizationId: string;
    documentId: string;
    ownerId: string;
    scheduledFor: Date;
    reason: string;
    status?: string;
  }) {
    return this.prisma.followUpQueue.create({
      data: {
        id: data.id ?? generateId(),
        organizationId: data.organizationId,
        documentId: data.documentId,
        ownerId: data.ownerId,
        scheduledFor: data.scheduledFor,
        reason: data.reason,
        status: data.status ?? 'pending',
      },
    });
  }

  async update(
    id: string,
    data: {
      status?: string;
      sentAt?: Date | null;
      snoozedUntil?: Date | null;
    },
  ) {
    return this.prisma.followUpQueue.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.followUpQueue.delete({
      where: { id },
    });
  }
}
