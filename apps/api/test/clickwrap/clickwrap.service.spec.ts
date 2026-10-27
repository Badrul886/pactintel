import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClickwrapService } from '../../src/modules/clickwrap/clickwrap.service';
import { ClickwrapRepository } from '../../src/modules/clickwrap/clickwrap.repository';
import * as crypto from 'crypto';

describe('Sprint 2.7: Clickwrap Service & Immutability (RULE CW-001, EC-CW-01..07)', () => {
  let clickwrapService: ClickwrapService;
  let mockRepo: any;
  let mockPrisma: any;
  let mockOutbox: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const agreementId = '22222222-2222-7222-8222-222222222222';
  const v1Id = '33333333-3333-7333-8333-333333333333';
  const v2Id = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockRepo = {
      createAgreement: jest.fn(),
      findAgreementById: jest.fn(),
      findAgreementBySlug: jest.fn(),
      listAgreements: jest.fn(),
      createVersion: jest.fn(),
      findVersionById: jest.fn(),
      findMaxVersionNumber: jest.fn(),
      findCurrentVersion: jest.fn(),
      findCurrentVersionBySlug: jest.fn(),
      listVersions: jest.fn(),
      softDeleteVersion: jest.fn(),
      recordAcceptance: jest.fn(),
      listAcceptances: jest.fn(),
      countAcceptances: jest.fn(),
      getAgreementStats: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      clickwrapVersion: {
        create: jest
          .fn()
          .mockImplementation(async (arg) => ({ ...arg.data, createdAt: new Date() })),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      clickwrapAcceptance: {
        create: jest.fn(),
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

  describe('Agreement & Version Creation (RULE CW-001)', () => {
    it('creates agreement with unique slug and first version with SHA-256 contentHash', async () => {
      mockRepo.findAgreementBySlug.mockResolvedValue(null);
      mockRepo.createAgreement.mockResolvedValue({
        id: agreementId,
        organizationId: orgId,
        name: 'Terms of Service',
        slug: 'terms-of-service',
        isActive: true,
      });

      const agreement = await clickwrapService.createAgreement(orgId, {
        name: 'Terms of Service',
        slug: 'terms-of-service',
      });

      expect(agreement.id).toBe(agreementId);
      expect(mockRepo.createAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          name: 'Terms of Service',
          slug: 'terms-of-service',
        }),
      );

      // Create draft version
      const content =
        '<h2>Terms of Service</h2><p>By using our service, you agree to these terms.</p>';
      const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

      mockRepo.findAgreementById.mockResolvedValue(agreement);
      mockRepo.findMaxVersionNumber.mockResolvedValue(0); // v1
      mockRepo.createVersion.mockImplementation(async (data: any) => ({
        id: v1Id,
        ...data,
      }));

      const version = await clickwrapService.createVersion(orgId, agreementId, {
        content,
      });

      expect(version.versionNumber).toBe(1);
      expect(version.contentHash).toBe(expectedHash);
      expect(mockPrisma.clickwrapVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clickwrapAgreementId: agreementId,
          versionNumber: 1,
          contentHash: expectedHash,
          isCurrent: false,
        }),
      });
    });
  });

  describe('Atomic Version Publishing (RULE EC-CW-02)', () => {
    it('atomically unsets isCurrent on previous version and sets isCurrent: true on new version', async () => {
      mockRepo.findAgreementById.mockResolvedValue({
        id: agreementId,
        organizationId: orgId,
      });

      mockRepo.findVersionById.mockResolvedValue({
        id: v2Id,
        clickwrapAgreementId: agreementId,
        versionNumber: 2,
        isCurrent: false,
      });

      mockPrisma.clickwrapVersion.update.mockResolvedValue({
        id: v2Id,
        clickwrapAgreementId: agreementId,
        versionNumber: 2,
        isCurrent: true,
        publishedAt: new Date(),
      });

      const published = await clickwrapService.publishVersion(orgId, agreementId, v2Id);

      expect(published.isCurrent).toBe(true);
      expect(mockPrisma.clickwrapVersion.updateMany).toHaveBeenCalledWith({
        where: { clickwrapAgreementId: agreementId, isCurrent: true },
        data: { isCurrent: false },
      });
      expect(mockPrisma.clickwrapVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: v2Id },
          data: expect.objectContaining({
            isCurrent: true,
          }),
        }),
      );
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'clickwrap.version.published',
        v2Id,
        expect.objectContaining({
          agreementId,
          versionId: v2Id,
          versionNumber: 2,
        }),
      );
    });
  });

  describe('Version Deletion Constraints (RULE EC-CW-03)', () => {
    it('throws 409 Conflict when attempting to delete the currently active version', async () => {
      mockRepo.findVersionById.mockResolvedValue({
        id: v1Id,
        clickwrapAgreementId: agreementId,
        versionNumber: 1,
        isCurrent: true, // Currently published
      });

      await expect(clickwrapService.deleteVersion(orgId, agreementId, v1Id)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.softDeleteVersion).not.toHaveBeenCalled();
    });

    it('soft deletes a draft/archived version when isCurrent is false', async () => {
      mockRepo.findVersionById.mockResolvedValue({
        id: v2Id,
        clickwrapAgreementId: agreementId,
        versionNumber: 2,
        isCurrent: false,
      });

      const result = await clickwrapService.deleteVersion(orgId, agreementId, v2Id);
      expect(result.status).toBe('deleted');
      expect(mockRepo.softDeleteVersion).toHaveBeenCalledWith(v2Id);
    });
  });

  describe('Public Acceptance Capture & Immutability (RULE CW-001 & EC-CW-01)', () => {
    it('records consent capturing IP address, user agent, and links to active version ID', async () => {
      mockRepo.findCurrentVersionBySlug.mockResolvedValue({
        agreement: { id: agreementId, organizationId: orgId, name: 'TOS', slug: 'tos' },
        version: { id: v2Id, versionNumber: 2, content: 'TOS v2', isCurrent: true },
      });

      mockPrisma.clickwrapAcceptance.create.mockImplementation(async (arg: any) => arg.data);

      const acceptance = await clickwrapService.recordAcceptance(
        'tos',
        {
          email: 'user@company.com',
          name: 'Jane Doe',
        },
        {
          ipAddress: '198.51.100.42',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      );

      expect(acceptance.accepted).toBe(true);
      expect(acceptance.versionId).toBe(v2Id);
      expect(acceptance.versionNumber).toBe(2);

      expect(mockPrisma.clickwrapAcceptance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          clickwrapVersionId: v2Id,
          acceptorEmail: 'user@company.com',
          acceptorName: 'Jane Doe',
          ipAddress: '198.51.100.42',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          acceptedAt: expect.any(Date),
        }),
      });

      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'clickwrap.acceptance.recorded',
        expect.any(String),
        expect.objectContaining({
          agreementId,
          slug: 'tos',
          versionId: v2Id,
          acceptorEmail: 'user@company.com',
        }),
      );
    });

    it('throws 404 if agreement has no currently published version', async () => {
      mockRepo.findCurrentVersionBySlug.mockResolvedValue(null);

      await expect(
        clickwrapService.recordAcceptance('non-existent', { email: 'user@company.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
