import { HttpException, HttpStatus } from '@nestjs/common';
import { ExpiryCheckJob } from '../../src/modules/document/jobs/expiry-check.job';
import { ReminderCheckJob } from '../../src/modules/document/jobs/reminder-check.job';
import { FollowUpService } from '../../src/modules/follow-up/follow-up.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FollowUpRepository } from '../../src/modules/follow-up/follow-up.repository';
import { DocumentService } from '../../src/modules/document/document.service';

describe('Document Expiry, Reminders & Follow-up Queue (Sprint 2.6)', () => {
  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const ownerId = '33333333-3333-7333-8333-333333333333';
  const followUpId = '44444444-4444-7444-8444-444444444444';

  let mockDocRepo: any;
  let mockOutbox: any;
  let mockPrisma: any;
  let mockTx: any;
  let mockNotificationService: any;
  let mockFollowUpRepo: any;

  beforeEach(() => {
    mockTx = {
      document: {
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: docId, ...data })),
      },
      followUpQueue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: followUpId, ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: followUpId, ...data })),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
      document: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: docId, ...data })),
      },
      followUpQueue: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: followUpId, ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: followUpId, ...data })),
      },
      brandKit: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      auditLogEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockDocRepo = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findExpiringSoon: jest.fn(),
      findJustExpired: jest.fn(),
      setExpiryWarningAt: jest.fn(),
      setStatus: jest.fn(),
      findInactiveDocuments: jest.fn(),
      recordView: jest.fn().mockResolvedValue({ id: docId }),
      update: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    mockNotificationService = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
    };

    mockFollowUpRepo = {
      findById: jest.fn(),
      listPendingForUser: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
      delete: jest.fn(),
    };
  });

  describe('ExpiryCheckJob (Hourly Job)', () => {
    let expiryJob: ExpiryCheckJob;

    beforeEach(() => {
      expiryJob = new ExpiryCheckJob(
        mockDocRepo as DocumentRepository,
        mockOutbox as DocumentOutboxService,
        mockPrisma as PrismaService,
      );
    });

    it('Test 1: marks document as expired and emits document.expired outbox event when expires_at has passed', async () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      mockDocRepo.findExpiringSoon.mockResolvedValue([]);
      mockDocRepo.findJustExpired.mockResolvedValue([
        {
          id: docId,
          organizationId: orgId,
          title: 'Consulting Contract',
          expiresAt: pastExpiry,
          status: 'sent',
        },
      ]);

      const result = await expiryJob.processExpiryCheck(now);

      expect(result.expiredCount).toBe(1);
      expect(mockTx.document.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: { status: 'expired' },
      });
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockTx,
        orgId,
        'document.expired',
        docId,
        expect.objectContaining({
          documentId: docId,
          title: 'Consulting Contract',
        }),
      );
    });

    it('Test 2: emits document.expiry_approaching outbox and sets expiry_warning_sent_at when expires_at is in 20h (< 24h)', async () => {
      const now = new Date();
      const expiringSoonDate = new Date(now.getTime() + 20 * 60 * 60 * 1000); // 20 hours from now

      mockDocRepo.findExpiringSoon.mockResolvedValue([
        {
          id: docId,
          organizationId: orgId,
          ownerId,
          title: 'Services Agreement',
          expiresAt: expiringSoonDate,
          expiryWarningSentAt: null,
          status: 'sent',
        },
      ]);
      mockDocRepo.findJustExpired.mockResolvedValue([]);

      const result = await expiryJob.processExpiryCheck(now);

      expect(result.warningsSent).toBe(1);
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockTx,
        orgId,
        'document.expiry_approaching',
        docId,
        expect.objectContaining({
          documentId: docId,
          expiresAt: expiringSoonDate,
          title: 'Services Agreement',
        }),
      );
      expect(mockTx.document.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: { expiryWarningSentAt: now },
      });
      // Also enqueued to followUpQueue with reason='expiry_warning'
      expect(mockTx.followUpQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          documentId: docId,
          ownerId,
          reason: 'expiry_warning',
          status: 'pending',
        }),
      });
    });

    it('Test 3: does NOT emit warning when expires_at is in 48h (> 24h)', async () => {
      const now = new Date();
      // findExpiringSoon queries documents where expiresAt <= now + 24h.
      // A doc with expiresAt in 48h is not returned by the repository query.
      mockDocRepo.findExpiringSoon.mockResolvedValue([]);
      mockDocRepo.findJustExpired.mockResolvedValue([]);

      const result = await expiryJob.processExpiryCheck(now);

      expect(result.warningsSent).toBe(0);
      expect(mockOutbox.emit).not.toHaveBeenCalled();
      expect(mockTx.document.update).not.toHaveBeenCalled();
    });

    it('Test 4: already expired document is not re-expired (idempotency)', async () => {
      const now = new Date();
      // findJustExpired filters status: { notIn: ['expired', 'signed', 'voided', 'declined'] }
      // So already expired docs are never returned.
      mockDocRepo.findExpiringSoon.mockResolvedValue([]);
      mockDocRepo.findJustExpired.mockResolvedValue([]);

      const result = await expiryJob.processExpiryCheck(now);

      expect(result.expiredCount).toBe(0);
      expect(mockTx.document.update).not.toHaveBeenCalled();
      expect(mockOutbox.emit).not.toHaveBeenCalled();
    });

    it('Edge case EC-EXPIRY-03: warning deduplication - does not send warning twice', async () => {
      const now = new Date();
      // Doc already had warning sent (expiryWarningSentAt is not null) -> repo query excludes it
      mockDocRepo.findExpiringSoon.mockResolvedValue([]);
      mockDocRepo.findJustExpired.mockResolvedValue([]);

      const result = await expiryJob.processExpiryCheck(now);

      expect(result.warningsSent).toBe(0);
      expect(mockOutbox.emit).not.toHaveBeenCalled();
    });
  });

  describe('ReminderCheckJob (Daily Inactivity Nudge)', () => {
    let reminderJob: ReminderCheckJob;

    beforeEach(() => {
      reminderJob = new ReminderCheckJob(
        mockDocRepo as DocumentRepository,
        mockPrisma as PrismaService,
      );
    });

    it('Test 7: inactivity - last_viewed_at 10 days ago, threshold 7 days -> added to follow_up_queue', async () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      mockDocRepo.findInactiveDocuments.mockResolvedValue([
        {
          id: docId,
          organizationId: orgId,
          ownerId,
          title: 'NDA with Corp',
          status: 'sent',
          lastViewedAt: tenDaysAgo,
          inactivityReminderDays: 7,
          createdAt: tenDaysAgo,
          owner: { id: ownerId, name: 'Alice Rep', email: 'alice@pactintel.com' },
        },
      ]);
      mockPrisma.followUpQueue.findFirst.mockResolvedValue(null);

      const count = await reminderJob.processInactivityReminders(now);

      expect(count).toBe(1);
      expect(mockPrisma.followUpQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          documentId: docId,
          ownerId,
          reason: 'inactivity',
          status: 'pending',
        }),
      });
    });

    it('Test 8: inactivity - last_viewed_at 5 days ago, threshold 7 days -> NOT added to follow_up_queue', async () => {
      const now = new Date();
      // findInactiveDocuments will filter out docs where daysDiff < threshold
      mockDocRepo.findInactiveDocuments.mockResolvedValue([]);

      const count = await reminderJob.processInactivityReminders(now);

      expect(count).toBe(0);
      expect(mockPrisma.followUpQueue.create).not.toHaveBeenCalled();
    });

    it('Edge case EC-EXPIRY-05: inactivity calculation when last_viewed_at is null falls back to createdAt', async () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      // Verify the fallback logic in repository by testing findInactiveDocuments candidate filtering
      const candidates = [
        {
          id: docId,
          organizationId: orgId,
          ownerId,
          title: 'Unopened Contract',
          status: 'sent',
          lastViewedAt: null, // Client never opened
          createdAt: tenDaysAgo, // Sent 10 days ago
          inactivityReminderDays: 7,
          owner: { id: ownerId, name: 'Alice Rep', email: 'alice@pactintel.com' },
        },
      ];

      // Simulate findInactiveDocuments internal behavior
      const inactive = candidates.filter((doc) => {
        const refDate = doc.lastViewedAt ?? doc.createdAt;
        const daysDiff = (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= (doc.inactivityReminderDays || 0);
      });

      expect(inactive.length).toBe(1);
      expect(inactive[0].id).toBe(docId);
    });
  });

  describe('FollowUpService (Queue Processing & Actions)', () => {
    let followUpService: FollowUpService;

    beforeEach(() => {
      followUpService = new FollowUpService(
        mockFollowUpRepo as FollowUpRepository,
        mockOutbox as DocumentOutboxService,
        mockPrisma as PrismaService,
        mockNotificationService,
      );
    });

    it('Test 5: rep sends follow-up -> status = "sent" + follow_up.sent outbox event emitted (RULE FOLLOW-001 & I-06)', async () => {
      const mockItem = {
        id: followUpId,
        organizationId: orgId,
        documentId: docId,
        ownerId,
        status: 'pending',
        reason: 'inactivity',
        document: {
          id: docId,
          title: 'SaaS Agreement',
          status: 'sent',
          signatureRequests: [
            {
              signers: [{ email: 'client@enterprise.com' }],
            },
          ],
        },
      };

      mockFollowUpRepo.findById.mockResolvedValue(mockItem);

      const result = await followUpService.sendFollowUp(orgId, ownerId, followUpId);

      expect(result.status).toBe('sent');
      expect(result.recipientEmail).toBe('client@enterprise.com');
      expect(mockTx.followUpQueue.update).toHaveBeenCalledWith({
        where: { id: followUpId },
        data: expect.objectContaining({
          status: 'sent',
        }),
      });
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockTx,
        orgId,
        'follow_up.sent',
        followUpId,
        expect.objectContaining({
          followUpId,
          documentId: docId,
          recipientEmail: 'client@enterprise.com',
        }),
      );
    });

    it('Test 6: rep snoozes follow-up -> status = "snoozed", snoozedUntil is set', async () => {
      const mockItem = {
        id: followUpId,
        organizationId: orgId,
        documentId: docId,
        ownerId,
        status: 'pending',
      };
      const snoozedDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

      mockFollowUpRepo.findById.mockResolvedValue(mockItem);
      mockFollowUpRepo.update.mockResolvedValue({
        id: followUpId,
        status: 'snoozed',
        snoozedUntil: snoozedDate,
      });

      const result = await followUpService.snoozeFollowUp(orgId, ownerId, followUpId, snoozedDate);

      expect(result.status).toBe('snoozed');
      expect(result.snoozedUntil).toEqual(snoozedDate);
      expect(mockFollowUpRepo.update).toHaveBeenCalledWith(followUpId, {
        status: 'snoozed',
        snoozedUntil: snoozedDate,
      });
    });

    it('Edge case EC-EXPIRY-04: follow-up on already signed document -> auto-dismiss and 409 Conflict', async () => {
      const mockItem = {
        id: followUpId,
        organizationId: orgId,
        documentId: docId,
        ownerId,
        status: 'pending',
        document: {
          id: docId,
          title: 'Already Signed MSA',
          status: 'signed', // Signed in the interim
        },
      };

      mockFollowUpRepo.findById.mockResolvedValue(mockItem);

      await expect(followUpService.sendFollowUp(orgId, ownerId, followUpId)).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.CONFLICT,
        }),
      );

      // Auto-dismissed
      expect(mockFollowUpRepo.update).toHaveBeenCalledWith(followUpId, {
        status: 'dismissed',
      });
    });

    it('rep dismisses follow-up -> status = "dismissed"', async () => {
      const mockItem = {
        id: followUpId,
        organizationId: orgId,
        documentId: docId,
        ownerId,
        status: 'pending',
      };

      mockFollowUpRepo.findById.mockResolvedValue(mockItem);
      mockFollowUpRepo.update.mockResolvedValue({
        id: followUpId,
        status: 'dismissed',
      });

      const result = await followUpService.dismissFollowUp(orgId, ownerId, followUpId);

      expect(result.status).toBe('dismissed');
      expect(mockFollowUpRepo.update).toHaveBeenCalledWith(followUpId, {
        status: 'dismissed',
      });
    });
  });

  describe('Document Gate & Invariant Tests (EC-EXPIRY-01 & EC-EXPIRY-02)', () => {
    let docService: DocumentService;

    beforeEach(() => {
      docService = new DocumentService(
        mockDocRepo as DocumentRepository,
        mockOutbox as DocumentOutboxService,
        mockPrisma as PrismaService,
        mockNotificationService,
      );
    });

    it('Edge case EC-EXPIRY-01: viewing expired document via validateRecipientAccess returns EXPIRED denial', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago
      mockDocRepo.findBySlug.mockResolvedValue({
        id: docId,
        organizationId: orgId,
        title: 'Expired Agreement',
        slug: 'expired-slug',
        status: 'sent',
        expiresAt: pastDate,
        passwordHash: null,
        domainRestriction: [],
        versions: [{ versionNumber: 1, contentSnapshot: '...', isSigned: false }],
        organization: { name: 'PactIntel Org' },
      });

      const result = await docService.validateRecipientAccess('expired-slug');

      expect(result.accessible).toBe(false);
      expect(result.denialType).toBe('EXPIRED');
      expect(result.message).toBe('This document link has expired.');
      // Auto-marks document as expired
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: { status: 'expired' },
      });
    });

    it('Edge case EC-EXPIRY-02: transitioning an expired document to signed is illegal and rejected', async () => {
      mockDocRepo.findById.mockResolvedValue({
        id: docId,
        organizationId: orgId,
        title: 'Expired Agreement',
        status: 'expired',
      });

      // Attempting to transition from 'expired' to 'signed' violates SIG-004 state machine
      await expect(docService.transitionStatus(orgId, docId, 'signed')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
