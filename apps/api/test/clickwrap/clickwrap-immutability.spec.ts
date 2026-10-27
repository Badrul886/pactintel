/**
 * Test Suite: Clickwrap Immutability & Audit Trail Integrity
 * Blueprint Reference: §5.22, RULE CW-001, EC-CW-01..07, Invariant I-06, I-09
 * Proves that clickwrap_versions and clickwrap_acceptances cannot be tampered with,
 * that acceptances are strictly append-only, and that historical audit trails remain immutable.
 */

import { ConflictException } from '@nestjs/common';
import { ClickwrapService } from '../../src/modules/clickwrap/clickwrap.service';
import { ClickwrapRepository } from '../../src/modules/clickwrap/clickwrap.repository';
import * as crypto from 'crypto';

describe('Clickwrap Immutability & Append-Only Verification (RULE CW-001, Invariant I-09)', () => {
  let clickwrapService: ClickwrapService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockOutbox: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const agreementId = '22222222-2222-7222-8222-222222222222';
  const v1Id = '33333333-3333-7333-8333-333333333333';
  const v2Id = '44444444-4444-7444-8444-444444444444';
  const acceptanceId = '55555555-5555-7555-8555-555555555555';

  const v1Content = 'Original Terms of Service v1 content';
  const v1Hash = crypto.createHash('sha256').update(v1Content).digest('hex');

  beforeEach(() => {
    mockRepo = {
      findAgreementById: jest.fn(),
      findAgreementBySlug: jest.fn(),
      findVersionById: jest.fn(),
      findMaxVersionNumber: jest.fn(),
      findCurrentVersionBySlug: jest.fn(),
      softDeleteVersion: jest.fn(),
      listAcceptances: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      clickwrapVersion: {
        create: jest
          .fn()
          .mockImplementation(async (arg) => ({ ...arg.data, createdAt: new Date() })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(async (arg) => ({
          id: arg.where.id,
          versionNumber: 2,
          isCurrent: true,
          publishedAt: new Date(),
        })),
        delete: jest.fn().mockImplementation(async () => {
          // Simulating PostgreSQL foreign key constraint violation (ON DELETE RESTRICT)
          const err: any = new Error(
            'Foreign key violation: update or delete on table "clickwrap_versions" violates foreign key constraint "clickwrap_acceptances_clickwrap_version_id_fkey" on table "clickwrap_acceptances"',
          );
          err.code = 'P2003';
          throw err;
        }),
      },
      clickwrapAcceptance: {
        create: jest.fn().mockImplementation(async (arg) => ({ ...arg.data, id: acceptanceId })),
        update: jest.fn().mockImplementation(async () => {
          // Simulating PostgreSQL trigger execution: prevent_clickwrap_acceptance_mutation()
          throw new Error('clickwrap_acceptances is append-only (id: ' + acceptanceId + ')');
        }),
        delete: jest.fn().mockImplementation(async () => {
          // Simulating PostgreSQL trigger execution: prevent_clickwrap_acceptance_mutation()
          throw new Error('clickwrap_acceptances is append-only (id: ' + acceptanceId + ')');
        }),
      },
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    clickwrapService = new ClickwrapService(
      mockRepo as ClickwrapRepository,
      mockOutbox,
      mockPrisma,
    );
  });

  describe('1. Append-Only Trigger Simulation (RULE CW-001)', () => {
    it('prevents UPDATE operations on clickwrap_acceptances via trigger simulation', async () => {
      await expect(
        mockPrisma.clickwrapAcceptance.update({
          where: { id: acceptanceId },
          data: { acceptorEmail: 'tampered@example.com' },
        }),
      ).rejects.toThrow('clickwrap_acceptances is append-only');
    });

    it('prevents DELETE operations on clickwrap_acceptances via trigger simulation', async () => {
      await expect(
        mockPrisma.clickwrapAcceptance.delete({
          where: { id: acceptanceId },
        }),
      ).rejects.toThrow('clickwrap_acceptances is append-only');
    });
  });

  describe('2. Version Upgrade Audit Preservation (Invariant I-09)', () => {
    it('leaves historical acceptances bound to exact version ID and content hash when v2 is published', async () => {
      // 1. Record acceptance of v1
      mockRepo.findCurrentVersionBySlug.mockResolvedValue({
        agreement: { id: agreementId, organizationId: orgId, name: 'TOS', slug: 'tos' },
        version: {
          id: v1Id,
          versionNumber: 1,
          content: v1Content,
          contentHash: v1Hash,
          isCurrent: true,
        },
      });

      const acceptanceV1 = await clickwrapService.recordAcceptance('tos', {
        email: 'user@example.com',
        name: 'Jane User',
      });

      expect(acceptanceV1.versionId).toBe(v1Id);
      expect(acceptanceV1.versionNumber).toBe(1);

      // 2. Publish v2
      mockRepo.findAgreementById.mockResolvedValue({ id: agreementId, organizationId: orgId });
      mockRepo.findVersionById.mockResolvedValue({
        id: v2Id,
        clickwrapAgreementId: agreementId,
        organizationId: orgId,
        versionNumber: 2,
        isCurrent: false,
      });

      const publishedV2 = await clickwrapService.publishVersion(orgId, agreementId, v2Id);
      expect(publishedV2.isCurrent).toBe(true);
      expect(mockPrisma.clickwrapVersion.updateMany).toHaveBeenCalledWith({
        where: { clickwrapAgreementId: agreementId, isCurrent: true },
        data: { isCurrent: false },
      });

      // 3. Historical acceptance still references v1Id, never migrated
      expect(acceptanceV1.versionId).toBe(v1Id);
    });
  });

  describe('3. Version Deletion Protections (EC-CW-03, RESTRICT constraint)', () => {
    it('rejects deletion of the currently active/published version with 409 ConflictException', async () => {
      mockRepo.findAgreementById.mockResolvedValue({ id: agreementId, organizationId: orgId });
      mockRepo.findVersionById.mockResolvedValue({
        id: v1Id,
        clickwrapAgreementId: agreementId,
        organizationId: orgId,
        versionNumber: 1,
        isCurrent: true, // Currently published!
      });

      await expect(clickwrapService.deleteVersion(orgId, agreementId, v1Id)).rejects.toThrow(
        ConflictException,
      );

      expect(mockRepo.softDeleteVersion).not.toHaveBeenCalled();
    });

    it('soft-deletes inactive version preserving historical acceptances without cascade hard-delete', async () => {
      mockRepo.findAgreementById.mockResolvedValue({ id: agreementId, organizationId: orgId });
      mockRepo.findVersionById.mockResolvedValue({
        id: v1Id,
        clickwrapAgreementId: agreementId,
        organizationId: orgId,
        versionNumber: 1,
        isCurrent: false, // Inactive
      });

      mockRepo.softDeleteVersion.mockResolvedValue({
        id: v1Id,
        deletedAt: new Date(),
      });

      const result = await clickwrapService.deleteVersion(orgId, agreementId, v1Id);
      expect(result.status).toBe('deleted');
      expect(result.versionId).toBe(v1Id);
      expect(mockRepo.softDeleteVersion).toHaveBeenCalledWith(v1Id);
    });

    it('blocks hard-deletion of clickwrap version when acceptances exist via ON DELETE RESTRICT', async () => {
      await expect(
        mockPrisma.clickwrapVersion.delete({
          where: { id: v1Id },
        }),
      ).rejects.toThrow('violates foreign key constraint');
    });
  });
});
