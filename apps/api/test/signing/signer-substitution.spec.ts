import { SigningService } from '../../src/modules/signing/signing.service';
import { SigningRepository } from '../../src/modules/signing/signing.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE SIG-005: Signer Substitution Preserving Complete Audit Trail', () => {
  let signingService: SigningService;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockNotificationService: Partial<NotificationService>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const sigReqId = '22222222-2222-7222-8222-222222222222';
  const oldSignerId = '33333333-3333-7333-8333-333333333333';
  const newSignerId = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockSigningRepo = {
      reassignSigner: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockNotificationService = {
      enqueueEmail: jest.fn().mockResolvedValue(true),
    };

    mockTx = {};
    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    const mockSigningProvider = {
      providerName: 'boldsign',
      getCircuitBreakerStatus: jest
        .fn()
        .mockReturnValue({ isOpen: false, failureCount: 0, cooldownRemainingMs: 0 }),
      resetCircuitBreaker: jest.fn(),
      recordFailure: jest.fn(),
      recordSuccess: jest.fn(),
      initiateKba: jest.fn(),
      submitKbaAnswers: jest.fn(),
      initiateIdVerification: jest.fn(),
      getIdVerificationResult: jest.fn(),
      initiateQes: jest.fn(),
      getQesResult: jest.fn(),
    };

    signingService = new SigningService(
      mockSigningRepo as SigningRepository,
      mockOutbox as DocumentOutboxService,
      mockNotificationService as NotificationService,
      mockPrisma as PrismaService,
      mockSigningProvider as any,
    );
  });

  it('marks old signer as reassigned, creates new signer with fresh token, and appends audit trail entry', async () => {
    const oldSigner = {
      id: oldSignerId,
      email: 'original.vp@enterprise.com',
      name: 'Original VP',
      status: 'reassigned',
    };

    const newSigner = {
      id: newSignerId,
      email: 'successor.vp@enterprise.com',
      name: 'Successor VP',
      signingToken: 'cryptotoken_succ_123',
      status: 'sent',
    };

    const auditEvent = {
      id: 'event-reassign-1',
      eventType: 'signer_reassigned',
      metadata: {
        reason: 'Original VP on medical leave',
        reassignedFrom: oldSignerId,
        reassignedTo: newSignerId,
      },
    };

    (mockSigningRepo.reassignSigner as jest.Mock).mockResolvedValue({
      oldSigner,
      newSigner,
      auditEvent,
    });

    const result = await signingService.reassignSigner(orgId, sigReqId, oldSignerId, {
      newEmail: 'successor.vp@enterprise.com',
      newName: 'Successor VP',
      reason: 'Original VP on medical leave',
    });

    expect(result.oldSigner.status).toBe('reassigned');
    expect(result.newSigner.email).toBe('successor.vp@enterprise.com');
    expect(result.auditEvent.eventType).toBe('signer_reassigned');

    expect(mockSigningRepo.reassignSigner).toHaveBeenCalledWith(
      orgId,
      sigReqId,
      oldSignerId,
      expect.objectContaining({
        email: 'successor.vp@enterprise.com',
        name: 'Successor VP',
        reason: 'Original VP on medical leave',
      }),
    );

    // Verifies transactional outbox emission (Invariant I-06)
    expect(mockOutbox.emit).toHaveBeenCalledWith(
      mockTx,
      orgId,
      'signer.reassigned',
      newSignerId,
      expect.objectContaining({
        signatureRequestId: sigReqId,
        oldSignerId,
        newSignerId,
        reason: 'Original VP on medical leave',
      }),
    );

    // Verifies invitation dispatched to new signer
    expect(mockNotificationService.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'successor.vp@enterprise.com',
        template: 'signing-invitation',
        data: expect.objectContaining({
          signingUrl: '/sign/cryptotoken_succ_123',
        }),
      }),
    );
  });
});
