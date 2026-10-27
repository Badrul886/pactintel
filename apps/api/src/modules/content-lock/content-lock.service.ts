import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ContentLockRepository } from './content-lock.repository';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import { LockBlockDto, ContentLockDto, ContentLockEvent, UserRole } from '@pactintel/shared-types';

@Injectable()
export class ContentLockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentLockService.name);
  private redisPublisher: Redis | null = null;

  constructor(
    private readonly repo: ContentLockRepository,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Only connect if not in test environment or if test explicitly enables it
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const redisUrl = process.env.REDIS_REALTIME_URL;
      const host = process.env.REDIS_REALTIME_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_REALTIME_PORT || '6382', 10);
      const password = process.env.REDIS_REALTIME_PASSWORD || undefined;

      this.redisPublisher = redisUrl
        ? new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          })
        : new Redis({
            host,
            port,
            password,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });

      this.redisPublisher.on('error', (err) => {
        this.logger.warn(
          `Redis Realtime publisher error: ${err.message}. Running without pub/sub broadcast.`,
        );
      });
    } catch (err: any) {
      this.logger.warn(`Could not initialize Redis Realtime publisher: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.redisPublisher) {
      try {
        await this.redisPublisher.quit();
      } catch {
        // ignore disconnect errors
      }
    }
  }

  /**
   * Broadcasts lock events to Redis Realtime channel content-lock:{documentId}.
   */
  private async broadcastLockEvent(documentId: string, event: ContentLockEvent): Promise<void> {
    if (!this.redisPublisher || this.redisPublisher.status !== 'ready') {
      return;
    }
    try {
      const channel = `content-lock:${documentId}`;
      await this.redisPublisher.publish(channel, JSON.stringify(event));
    } catch (err: any) {
      this.logger.warn(`Failed to broadcast lock event to Redis: ${err.message}`);
    }
  }

  private async ensureDocumentExists(organizationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return doc;
  }

  /**
   * Acquires a block lock on a document.
   * EC-COLLAB-01 & 02: Single-locker exclusivity. 409 BLOCK_ALREADY_LOCKED if held by another user.
   */
  async lockBlock(
    organizationId: string,
    userId: string,
    documentId: string,
    dto: LockBlockDto,
  ): Promise<ContentLockDto> {
    await this.ensureDocumentExists(organizationId, documentId);

    const existingLock = await this.repo.findByBlock(documentId, dto.blockId);
    if (existingLock) {
      // Idempotent if locked by same user
      if (existingLock.lockedById === userId) {
        return {
          id: existingLock.id,
          documentId: existingLock.documentId,
          blockId: existingLock.blockId,
          lockedById: existingLock.lockedById,
          lockedBy: existingLock.lockedBy,
          lockedAt: existingLock.lockedAt.toISOString(),
        };
      }

      // Conflict if locked by another user (EC-COLLAB-02)
      throw new ConflictException({
        code: 'BLOCK_ALREADY_LOCKED',
        message: `Block ${dto.blockId} is already locked by user ${existingLock.lockedById}`,
      });
    }

    const lock = await this.repo.createLock(organizationId, documentId, dto.blockId, userId);

    const resultDto: ContentLockDto = {
      id: lock.id,
      documentId: lock.documentId,
      blockId: lock.blockId,
      lockedById: lock.lockedById,
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt.toISOString(),
    };

    // Broadcast over Redis Realtime
    await this.broadcastLockEvent(documentId, {
      action: 'locked',
      documentId,
      blockId: dto.blockId,
      lockedById: userId,
      lockedAt: resultDto.lockedAt,
    });

    return resultDto;
  }

  /**
   * Unlocks a block.
   * EC-COLLAB-04: Can only be unlocked by the lock owner or user with role admin/owner/manager.
   */
  async unlockBlock(
    organizationId: string,
    userId: string,
    userRole: UserRole,
    documentId: string,
    blockId: string,
  ): Promise<{ success: boolean; message?: string }> {
    await this.ensureDocumentExists(organizationId, documentId);

    const lock = await this.repo.findByBlock(documentId, blockId);
    if (!lock) {
      return { success: true, message: 'Lock not found or already released' };
    }

    const isPrivileged = userRole === 'admin' || userRole === 'owner' || userRole === 'manager';
    if (lock.lockedById !== userId && !isPrivileged) {
      throw new ForbiddenException({
        code: 'NOT_LOCK_OWNER',
        message: 'You do not have permission to unlock this block',
      });
    }

    await this.repo.deleteLock(lock.id, organizationId, documentId, blockId, lock.lockedById);

    // Broadcast over Redis Realtime
    await this.broadcastLockEvent(documentId, {
      action: 'unlocked',
      documentId,
      blockId,
      lockedById: lock.lockedById,
      lockedAt: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Lists all active content locks for a document.
   */
  async listLocks(organizationId: string, documentId: string): Promise<ContentLockDto[]> {
    await this.ensureDocumentExists(organizationId, documentId);

    const locks = await this.repo.findLocksByDocument(organizationId, documentId);
    return locks.map((lock) => ({
      id: lock.id,
      documentId: lock.documentId,
      blockId: lock.blockId,
      lockedById: lock.lockedById,
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt.toISOString(),
    }));
  }
}
