import { ContentLockService } from '../content-lock.service';
import { ContentLockRepository } from '../content-lock.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('ContentLockService Unit Tests (Rules COLLAB-002 & EC-COLLAB-01..04)', () => {
  let service: ContentLockService;
  let mockRepo: Partial<Record<keyof ContentLockRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const otherUserId = '33333333-3333-7333-8333-333333333333';
  const documentId = '44444444-4444-7444-8444-444444444444';
  const blockId = 'section-pricing-table';
  const lockId = '55555555-5555-7555-8555-555555555555';

  beforeEach(() => {
    mockRepo = {
      createLock: jest.fn(),
      findByBlock: jest.fn(),
      findLocksByDocument: jest.fn(),
      deleteLock: jest.fn(),
    };

    mockPrisma = {
      document: {
        findFirst: jest.fn().mockResolvedValue({
          id: documentId,
          title: 'Contract NDA',
        }),
      },
    };

    service = new ContentLockService(
      mockRepo as unknown as ContentLockRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('lockBlock', () => {
    it('Test 1: acquires lock on unlocked block successfully', async () => {
      mockRepo.findByBlock!.mockResolvedValue(null);
      mockRepo.createLock!.mockResolvedValue({
        id: lockId,
        organizationId: orgId,
        documentId,
        blockId,
        lockedById: userId,
        lockedBy: { id: userId, name: 'Alice', email: 'alice@example.com' },
        lockedAt: new Date('2026-10-24T12:00:00Z'),
      });

      const result = await service.lockBlock(orgId, userId, documentId, { blockId });

      expect(mockRepo.findByBlock).toHaveBeenCalledWith(documentId, blockId);
      expect(mockRepo.createLock).toHaveBeenCalledWith(orgId, documentId, blockId, userId);
      expect(result.blockId).toBe(blockId);
      expect(result.lockedById).toBe(userId);
    });

    it('Test 2: rejects lock on block held by another user with 409 Conflict BLOCK_ALREADY_LOCKED (EC-COLLAB-02)', async () => {
      mockRepo.findByBlock!.mockResolvedValue({
        id: lockId,
        documentId,
        blockId,
        lockedById: otherUserId, // Locked by someone else!
        lockedAt: new Date('2026-10-24T12:00:00Z'),
      });

      await expect(service.lockBlock(orgId, userId, documentId, { blockId })).rejects.toThrow(
        ConflictException,
      );
    });

    it('Test 3: returns existing lock idempotently when locked by same user', async () => {
      const existingLock = {
        id: lockId,
        documentId,
        blockId,
        lockedById: userId, // Same user
        lockedBy: { id: userId, name: 'Alice', email: 'alice@example.com' },
        lockedAt: new Date('2026-10-24T12:00:00Z'),
      };
      mockRepo.findByBlock!.mockResolvedValue(existingLock);

      const result = await service.lockBlock(orgId, userId, documentId, { blockId });

      expect(mockRepo.createLock).not.toHaveBeenCalled();
      expect(result.id).toBe(lockId);
      expect(result.lockedById).toBe(userId);
    });
  });

  describe('unlockBlock', () => {
    it('Test 4: allows lock owner to release their lock', async () => {
      mockRepo.findByBlock!.mockResolvedValue({
        id: lockId,
        documentId,
        blockId,
        lockedById: userId,
      });
      mockRepo.deleteLock!.mockResolvedValue({ success: true });

      const result = await service.unlockBlock(orgId, userId, 'member', documentId, blockId);

      expect(mockRepo.deleteLock).toHaveBeenCalledWith(lockId, orgId, documentId, blockId, userId);
      expect(result.success).toBe(true);
    });

    it('Test 5: allows content admin (admin/owner/manager) to unlock block locked by another user (EC-COLLAB-04 override)', async () => {
      mockRepo.findByBlock!.mockResolvedValue({
        id: lockId,
        documentId,
        blockId,
        lockedById: otherUserId, // Held by someone else
      });
      mockRepo.deleteLock!.mockResolvedValue({ success: true });

      // Admin calls unlock
      const resultAdmin = await service.unlockBlock(orgId, userId, 'admin', documentId, blockId);
      expect(resultAdmin.success).toBe(true);

      // Manager calls unlock
      const resultManager = await service.unlockBlock(
        orgId,
        userId,
        'manager',
        documentId,
        blockId,
      );
      expect(resultManager.success).toBe(true);
    });

    it('Test 6: rejects regular member unlocking block held by another user with 403 Forbidden NOT_LOCK_OWNER', async () => {
      mockRepo.findByBlock!.mockResolvedValue({
        id: lockId,
        documentId,
        blockId,
        lockedById: otherUserId,
      });

      await expect(
        service.unlockBlock(orgId, userId, 'member', documentId, blockId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Test 7: returns idempotent success if lock is already deleted/released', async () => {
      mockRepo.findByBlock!.mockResolvedValue(null);

      const result = await service.unlockBlock(orgId, userId, 'member', documentId, blockId);

      expect(mockRepo.deleteLock).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('listLocks', () => {
    it('Test 8: lists active content locks for document', async () => {
      mockRepo.findLocksByDocument!.mockResolvedValue([
        {
          id: lockId,
          documentId,
          blockId,
          lockedById: userId,
          lockedBy: { id: userId, name: 'Alice', email: 'alice@example.com' },
          lockedAt: new Date('2026-10-24T12:00:00Z'),
        },
      ]);

      const result = await service.listLocks(orgId, documentId);

      expect(mockRepo.findLocksByDocument).toHaveBeenCalledWith(orgId, documentId);
      expect(result).toHaveLength(1);
      expect(result[0].blockId).toBe(blockId);
    });
  });
});
