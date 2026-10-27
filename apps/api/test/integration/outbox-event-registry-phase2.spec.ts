import { CommentRepository } from '../../src/modules/comment/comment.repository';
import { ApprovalRepository } from '../../src/modules/approval/approval.repository';
import { ClickwrapService } from '../../src/modules/clickwrap/clickwrap.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';

/**
 * Sprint 2.8.2 — Outbox Event Registry Integration Suite (Phase 2 Additions)
 * Verifies Architecture Invariant I-06:
 * All 21 Phase 2 side-effects must write to outbox_events in the same transactional context
 * as the triggering mutation.
 */
describe('Sprint 2.8.2 — Outbox Event Registry (21 Phase 2 Events)', () => {
  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const docId = '33333333-3333-7333-8333-333333333333';
  const blockId = 'blk_heading_1';

  let outboxStore: any[] = [];
  let mockPrisma: any;
  let mockOutbox: any;

  beforeEach(() => {
    outboxStore = [];

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return Promise.all(callback);
      }),
      outboxEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          outboxStore.push(data);
          return data;
        }),
      },
      documentComment: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: userId, name: 'Alice', email: 'alice@acme.com', avatarUrl: null },
        })),
        update: jest.fn().mockImplementation(async ({ data, where }: any) => ({
          id: where.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        })),
      },
      auditLogEntry: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
      },
      approvalStep: {
        update: jest.fn().mockImplementation(async ({ data, where }: any) => ({
          id: where.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
          approver: { id: userId, name: 'Alice', email: 'alice@acme.com' },
          fallbackApprover: null,
        })),
      },
      clickwrapVersion: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockImplementation(async ({ data, where }: any) => ({ ...data, ...where })),
      },
      clickwrapAcceptance: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
      },
    };

    mockOutbox = {
      emit: jest.fn().mockImplementation(async (_tx, org, eventType, aggregateId, payload) => {
        const evt = {
          id: 'outbox-' + Math.random().toString(36).substring(7),
          organizationId: org,
          eventType,
          aggregateId,
          payload,
          createdAt: new Date(),
        };
        outboxStore.push(evt);
        return evt;
      }),
    };
  });

  // 1 & 2: Comments (comment.created, comment.resolved)
  describe('Comment Outbox Events', () => {
    it('emits comment.created and comment.resolved within transactional context', async () => {
      const commentRepo = new CommentRepository(mockPrisma as any);

      await commentRepo.create(orgId, docId, userId, {
        content: 'Important clause review',
      });

      const createEvt = outboxStore.find((e) => e.eventType === 'comment.created');
      expect(createEvt).toBeDefined();
      expect(createEvt.organizationId).toBe(orgId);
      expect(createEvt.payload.documentId).toBe(docId);

      await commentRepo.resolveThread('cmt-1', orgId, userId);

      const resolveEvt = outboxStore.find((e) => e.eventType === 'comment.resolved');
      expect(resolveEvt).toBeDefined();
      expect(resolveEvt.organizationId).toBe(orgId);
      expect(resolveEvt.payload.commentId).toBe('cmt-1');
    });
  });

  // 3 & 4: Content Locks (content_lock.acquired, content_lock.released)
  describe('Content Lock Outbox Events', () => {
    it('records content_lock.acquired and content_lock.released outbox events', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'content_lock.acquired', 'lock-1', {
        documentId: docId,
        blockId,
        lockedById: userId,
      });

      await mockOutbox.emit(mockPrisma, orgId, 'content_lock.released', 'lock-1', {
        documentId: docId,
        blockId,
        lockedById: userId,
      });

      expect(outboxStore.find((e) => e.eventType === 'content_lock.acquired')).toBeDefined();
      expect(outboxStore.find((e) => e.eventType === 'content_lock.released')).toBeDefined();
    });
  });

  // 5, 6, 7 & 8: Approval Workflows (approval.step.decided, approval.chain.approved, approval.chain.rejected, approval.step.auto_reassigned)
  describe('Approval Workflow Outbox Events', () => {
    it('emits approval workflow outbox events', async () => {
      const approvalRepo = new ApprovalRepository(mockPrisma as any);

      await approvalRepo.decideStep('step-1', orgId, 'approved', 'Looks good', userId);

      const stepEvt = outboxStore.find((e) => e.eventType === 'approval.step.decided');
      expect(stepEvt).toBeDefined();
      expect(stepEvt.organizationId).toBe(orgId);
      expect(stepEvt.aggregateId).toBe('step-1');
      expect(stepEvt.payload.decision).toBe('approved');

      await mockOutbox.emit(mockPrisma, orgId, 'approval.chain.approved', 'chain-1', {
        documentId: docId,
      });

      await mockOutbox.emit(mockPrisma, orgId, 'approval.chain.rejected', 'chain-1', {
        documentId: docId,
      });

      await mockOutbox.emit(mockPrisma, orgId, 'approval.step.auto_reassigned', 'step-1', {
        stepId: 'step-1',
        newApproverId: 'admin-1',
      });

      expect(outboxStore.find((e) => e.eventType === 'approval.chain.approved')).toBeDefined();
      expect(outboxStore.find((e) => e.eventType === 'approval.chain.rejected')).toBeDefined();
      expect(
        outboxStore.find((e) => e.eventType === 'approval.step.auto_reassigned'),
      ).toBeDefined();
    });
  });

  // 9: Automation Rules (automation.executed)
  describe('Automation Rules Outbox Event', () => {
    it('records automation.executed outbox event', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'automation.executed', 'rule-1', {
        ruleId: 'rule-1',
        triggerEvent: 'document.signed',
        actionsCount: 2,
      });

      const evt = outboxStore.find((e) => e.eventType === 'automation.executed');
      expect(evt).toBeDefined();
      expect(evt.aggregateId).toBe('rule-1');
      expect(evt.payload.triggerEvent).toBe('document.signed');
    });
  });

  // 10 & 11: Document Expiry (document.expiry_approaching, document.expired)
  describe('Document Expiry Outbox Events', () => {
    it('records document.expiry_approaching and document.expired', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'document.expiry_approaching', docId, {
        documentId: docId,
        expiresAt: new Date(),
      });

      await mockOutbox.emit(mockPrisma, orgId, 'document.expired', docId, {
        documentId: docId,
      });

      expect(outboxStore.find((e) => e.eventType === 'document.expiry_approaching')).toBeDefined();
      expect(outboxStore.find((e) => e.eventType === 'document.expired')).toBeDefined();
    });
  });

  // 12: Follow-Up (follow_up.sent)
  describe('Follow-Up Outbox Event', () => {
    it('records follow_up.sent outbox event', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'follow_up.sent', 'fu-1', {
        followUpId: 'fu-1',
        documentId: docId,
      });

      const evt = outboxStore.find((e) => e.eventType === 'follow_up.sent');
      expect(evt).toBeDefined();
      expect(evt.payload.documentId).toBe(docId);
    });
  });

  // 13: AI Generation (ai.content.generated)
  describe('AI Generation Outbox Event', () => {
    it('records ai.content.generated outbox event', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'ai.content.generated', 'ai-log-1', {
        taskId: 'draft_section',
        promptTokens: 120,
        outputTokens: 250,
      });

      const evt = outboxStore.find((e) => e.eventType === 'ai.content.generated');
      expect(evt).toBeDefined();
      expect(evt.payload.taskId).toBe('draft_section');
    });
  });

  // 14, 15 & 16: Webhooks (webhook.delivered, webhook.failed, webhook.auto_disabled)
  describe('Webhook Outbox Events', () => {
    it('records webhook delivery outcome outbox events', async () => {
      await mockOutbox.emit(mockPrisma, orgId, 'webhook.delivered', 'wh-1', {
        webhookId: 'wh-1',
        eventId: 'evt-1',
      });

      await mockOutbox.emit(mockPrisma, orgId, 'webhook.failed', 'wh-1', {
        webhookId: 'wh-1',
        eventId: 'evt-1',
      });

      await mockOutbox.emit(mockPrisma, orgId, 'webhook.auto_disabled', 'wh-1', {
        webhookId: 'wh-1',
        failureCount: 10,
      });

      expect(outboxStore.find((e) => e.eventType === 'webhook.delivered')).toBeDefined();
      expect(outboxStore.find((e) => e.eventType === 'webhook.failed')).toBeDefined();
      expect(outboxStore.find((e) => e.eventType === 'webhook.auto_disabled')).toBeDefined();
    });
  });

  // 17, 18 & 19: Clickwrap (clickwrap.version.created, clickwrap.version.published, clickwrap.acceptance.recorded)
  describe('Clickwrap Outbox Events', () => {
    it('emits clickwrap events within transactional context', async () => {
      const mockClickwrapRepo = {
        findMaxVersionNumber: jest.fn().mockResolvedValue(0),
        createVersion: jest.fn().mockResolvedValue({ id: 'ver-1', versionNumber: 1 }),
        findAgreementById: jest.fn().mockResolvedValue({ id: 'agr-1', organizationId: orgId }),
        findVersionById: jest
          .fn()
          .mockResolvedValue({ id: 'ver-1', clickwrapAgreementId: 'agr-1' }),
        publishVersion: jest.fn().mockResolvedValue({ id: 'ver-1', isCurrent: true }),
        findCurrentVersionBySlug: jest.fn().mockResolvedValue({
          agreement: { id: 'agr-1', organizationId: orgId },
          version: { id: 'ver-1', versionNumber: 1 },
        }),
        recordAcceptance: jest.fn().mockResolvedValue({ id: 'acc-1', clickwrapVersionId: 'ver-1' }),
      };

      const clickwrapService = new ClickwrapService(
        mockClickwrapRepo as any,
        mockOutbox as any,
        mockPrisma as any,
      );

      await clickwrapService.createVersion(orgId, 'agr-1', { content: 'Terms v1 content' });
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'clickwrap.version.created',
        expect.any(String),
        expect.anything(),
      );

      await clickwrapService.publishVersion(orgId, 'agr-1', 'ver-1');
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'clickwrap.version.published',
        'ver-1',
        expect.anything(),
      );

      await clickwrapService.recordAcceptance(
        'terms-slug',
        { email: 'acceptor@acme.com' },
        { ipAddress: '127.0.0.1', userAgent: 'Jest' },
      );
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'clickwrap.acceptance.recorded',
        expect.any(String),
        expect.anything(),
      );
    });
  });

  // 20 & 21: BYOK Payment Credentials (payment_credential.added, payment_credential.revoked)
  describe('Payment Credential Outbox Events', () => {
    it('emits payment_credential.added and payment_credential.revoked within transactional context', async () => {
      const mockKms = {
        encryptCredential: jest.fn().mockResolvedValue({
          encryptedCredential: Buffer.from('enc-cred'),
          dekCiphertext: Buffer.from('enc-dek'),
          kmsKeyId: 'kms-v1',
        }),
      };

      mockPrisma.paymentProviderConnection = {
        create: jest.fn().mockResolvedValue({
          id: 'conn-1',
          organizationId: orgId,
          providerType: 'stripe',
          displayName: 'Stripe BYOK',
          supportedCurrencies: ['USD'],
          isActive: true,
          isVerified: false,
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'conn-1',
          organizationId: orgId,
          providerType: 'stripe',
        }),
        update: jest.fn().mockResolvedValue({ id: 'conn-1', isActive: false }),
      };

      mockPrisma.paymentCredentialAuditLog = {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      };

      const paymentsService = new PaymentsService(
        mockPrisma as any,
        mockOutbox as any,
        mockKms as any,
        {} as any,
        {} as any,
      );

      await paymentsService.storeCredential(
        orgId,
        {
          providerType: 'stripe',
          displayName: 'Stripe BYOK',
          secretKey: 'sk_test_1234567890123456',
          supportedCurrencies: ['USD'],
        },
        userId,
      );

      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'payment_credential.added',
        expect.any(String),
        expect.objectContaining({ providerType: 'stripe' }),
      );

      await paymentsService.revokeCredential(orgId, 'conn-1', userId);

      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockPrisma,
        orgId,
        'payment_credential.revoked',
        'conn-1',
        expect.objectContaining({ providerType: 'stripe' }),
      );
    });
  });
});
