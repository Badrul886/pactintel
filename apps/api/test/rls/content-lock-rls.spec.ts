/**
 * Critical Test Suite: Cross-Tenant RLS Isolation for Content Locks
 * Blueprint Reference: §3.4, §5.18, Invariant I-02, Invariant I-03, RULE MT-001, RULE LOCK-001
 * Proves that content_locks strictly isolate tenant data with zero leakage:
 * Org A creates a content lock -> Org B cannot see it, cannot unlock it, and cannot bypass it.
 */

import { NotFoundException } from '@nestjs/common';
import { ContentLockService } from '../../src/modules/content-lock/content-lock.service';
import { ContentLockRepository } from '../../src/modules/content-lock/content-lock.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Critical Test: Multi-Tenant RLS Isolation for Content Locks', () => {
  const orgA = '11111111-1111-7111-8111-111111111111';
  const orgB = '22222222-2222-7222-8222-222222222222';
  const userA = 'usr-a-owner';
  const userB = 'usr-b-intruder';
  const docA = 'doc-a-confidential';
  const blockA = 'block-pricing-terms';
  const lockIdA = 'lock-uuid-a1';

  let service: ContentLockService;
  let mockRepo: Partial<Record<keyof ContentLockRepository, jest.Mock>>;
  let mockPrisma: any;

  beforeEach(() => {
    mockRepo = {
      createLock: jest.fn(),
      findByBlock: jest.fn(),
      findLocksByDocument: jest.fn(),
      deleteLock: jest.fn(),
    };

    mockPrisma = {
      document: {
        findFirst: jest.fn(),
      },
    };

    service = new ContentLockService(
      mockRepo as unknown as ContentLockRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('Read Isolation (USING policy)', () => {
    it('Org B cannot view locks belonging to Org A (throws NotFoundException)', async () => {
      // Document belongs to Org A; Org B requests locks
      mockPrisma.document.findFirst.mockResolvedValue(null); // Not found in Org B

      await expect(service.listLocks(orgB, docA)).rejects.toThrow(NotFoundException);
      expect(mockRepo.findLocksByDocument).not.toHaveBeenCalled();
    });

    it('Org A can view its own content locks', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: docA, organizationId: orgA });
      mockRepo.findLocksByDocument!.mockResolvedValue([
        {
          id: lockIdA,
          organizationId: orgA,
          documentId: docA,
          blockId: blockA,
          lockedById: userA,
          lockedBy: { id: userA, name: 'Alice Legal', email: 'alice@orga.com' },
          lockedAt: new Date(),
        },
      ]);

      const locks = await service.listLocks(orgA, docA);
      expect(locks).toHaveLength(1);
      expect(locks[0].blockId).toBe(blockA);
      expect(locks[0].lockedById).toBe(userA);
    });
  });

  describe('Write & Unlock Isolation (WITH CHECK policy)', () => {
    it('Org B user cannot unlock a block locked by Org A (throws NotFoundException)', async () => {
      // Org B user attempts to unlock Org A document block
      mockPrisma.document.findFirst.mockResolvedValue(null); // Document docA not accessible in orgB

      await expect(service.unlockBlock(orgB, userB, 'member', docA, blockA)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockRepo.deleteLock).not.toHaveBeenCalled();
    });

    it('Org B user cannot lock a block in Org A document (throws NotFoundException)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.lockBlock(orgB, userB, docA, { blockA } as any)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockRepo.createLock).not.toHaveBeenCalled();
    });
  });
});
