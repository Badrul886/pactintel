import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContentLockRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Acquires a block lock and emits transactional outbox event.
   */
  async createLock(
    organizationId: string,
    documentId: string,
    blockId: string,
    lockedById: string,
    id: string = generateId(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.contentLock.create({
        data: {
          id,
          organizationId,
          documentId,
          blockId,
          lockedById,
        },
        include: {
          lockedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'content_lock.acquired',
          aggregateType: 'ContentLock',
          aggregateId: lock.id,
          payload: {
            lockId: lock.id,
            documentId: lock.documentId,
            blockId: lock.blockId,
            lockedById: lock.lockedById,
            lockedAt: lock.lockedAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return lock;
    });
  }

  async findByBlock(documentId: string, blockId: string) {
    return this.prisma.contentLock.findUnique({
      where: {
        documentId_blockId: {
          documentId,
          blockId,
        },
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findLocksByDocument(organizationId: string, documentId: string) {
    return this.prisma.contentLock.findMany({
      where: {
        organizationId,
        documentId,
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { lockedAt: 'asc' },
    });
  }

  async deleteLock(
    id: string,
    organizationId: string,
    documentId: string,
    blockId: string,
    lockedById: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.contentLock.delete({
        where: { id },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'content_lock.released',
          aggregateType: 'ContentLock',
          aggregateId: id,
          payload: {
            lockId: id,
            documentId,
            blockId,
            lockedById,
          } as Prisma.InputJsonValue,
        },
      });

      return { success: true };
    });
  }
}
