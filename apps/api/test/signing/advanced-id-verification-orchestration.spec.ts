import { HttpException } from '@nestjs/common';
import { PublicSigningController } from '../../src/modules/signing/public-signing.controller';
import { SigningService } from '../../src/modules/signing/signing.service';
import { SigningRepository } from '../../src/modules/signing/signing.repository';
import { BoldSignAdapter } from '../../src/modules/signing/adapters/boldsign.adapter';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Advanced ID Verification Orchestration (Sprint 3.6)', () => {
  let controller: PublicSigningController;
  let signingService: SigningService;
  let adapter: BoldSignAdapter;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockNotificationService: Partial<NotificationService>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const signerId = '0192a000-0000-7000-8000-000000000002';
  const docId = '0192a000-0000-7000-8000-000000000003';
  const kbaToken = 'token-kba-orchestration-001';
  const idDocToken = 'token-govid-orchestration-002';
  const qesToken = 'token-qes-orchestration-003';

  const mockReq: any = {
    ip: '192.168.1.100',
    headers: { 'user-agent': 'Jest-E2E-Agent/1.0' },
  };

  // In-memory state tracking to simulate real repository updates
  let currentSignerState: any;

  beforeEach(() => {
    adapter = new BoldSignAdapter();
    adapter.resetCircuitBreaker();

    currentSignerState = {
      id: signerId,
      organizationId: orgId,
      email: 'verified.signer@enterprise.com',
      name: 'Verified Signer',
      status: 'sent',
      roleLabel: 'Signer',
      verificationMethod: 'kba',
      verificationAttempts: 0,
      kbaLockedAt: null,
      verificationResult: null,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      signatureRequestId: 'sigreq-orch-1',
      signatureRequest: {
        documentId: docId,
        signatureRequestId: 'sigreq-orch-1',
        document: {
          id: docId,
          title: 'Master Collaboration Agreement',
          status: 'sent',
          currency: 'USD',
          totalValue: 50000,
          organization: { name: 'PactIntel Enterprise', slug: 'pactintel' },
        },
        documentVersion: {
          versionNumber: 1,
          contentSnapshot: {},
          contentHash: 'hash-abc-123',
        },
      },
    };

    mockSigningRepo = {
      findSignerByToken: jest.fn().mockImplementation(async () => currentSignerState),
      recordKbaFailure: jest.fn().mockImplementation(async (_org, _doc, _sId, attempts, locked) => {
        currentSignerState.verificationAttempts = attempts;
        if (locked) currentSignerState.kbaLockedAt = new Date();
        return currentSignerState;
      }),
      recordVerificationPassed: jest
        .fn()
        .mockImplementation(async (_org, _doc, _sId, _method, result) => {
          currentSignerState.verificationResult = result;
          currentSignerState.status = 'viewed';
          return currentSignerState;
        }),
      recordVerificationFallback: jest
        .fn()
        .mockImplementation(async (_org, _doc, _sId, _orig, fallback) => {
          currentSignerState.verificationMethod = fallback;
          return currentSignerState;
        }),
      recordSignature: jest.fn().mockImplementation(async () => {
        currentSignerState.status = 'signed';
        return { signer: currentSignerState, allCompleted: true };
      }),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-orch-1' } as any),
    };

    mockNotificationService = {
      enqueueEmail: jest.fn().mockResolvedValue(true),
    };

    const mockTx = {
      signer: { update: jest.fn() },
      signatureEvent: { create: jest.fn() },
    };

    mockPrisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ planTier: 'enterprise' }),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    signingService = new SigningService(
      mockSigningRepo as SigningRepository,
      mockOutbox as DocumentOutboxService,
      mockNotificationService as NotificationService,
      mockPrisma as PrismaService,
      adapter,
    );

    controller = new PublicSigningController(signingService);
  });

  describe('Full KBA Flow (Initiate -> Answer -> Verify -> Sign)', () => {
    it('successfully verifies identity via KBA and allows document execution', async () => {
      // 1. Initial page access
      const docView = await controller.getSignerDocument(kbaToken);
      expect(docView.signer.verificationMethod).toBe('kba');
      expect(docView.signer.kbaLocked).toBe(false);

      // Attempting to sign without verification must fail
      await expect(
        controller.signDocument(kbaToken, { legalAssent: true, signatureData: 'sig' }, mockReq),
      ).rejects.toThrow(HttpException);

      // 2. Initiate KBA
      const kbaSession: any = await controller.initiateKba(kbaToken, mockReq);
      expect(kbaSession.sessionId).toBeDefined();
      expect(kbaSession.questions).toHaveLength(3);

      // 3. Submit correct answers
      const submitRes = await controller.submitKbaAnswers(
        kbaToken,
        {
          sessionId: kbaSession.sessionId,
          answers: {
            q1: '742 Evergreen Terrace, Springfield, OR',
            q2: '2019',
            q3: 'Ally Bank',
          },
        },
        mockReq,
      );

      expect(submitRes.passed).toBe(true);
      expect(submitRes.locked).toBe(false);

      // Verify outbox emitted verification.kba.passed
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'verification.kba.passed',
        signerId,
        expect.anything(),
      );

      // 4. Submit signature with legal assent
      const signRes = await controller.signDocument(
        kbaToken,
        { legalAssent: true, signatureData: 'typed:Verified Signer' },
        mockReq,
      );

      expect(signRes.signer.status).toBe('signed');
      expect(signRes.allCompleted).toBe(true);
    });
  });

  describe('KBA 3-Attempt Failure & Account Lockout Flow', () => {
    it('locks signer account on 3 failed answer attempts and blocks signing permanently', async () => {
      // 1. Initiate KBA
      const kbaSession: any = await controller.initiateKba(kbaToken, mockReq);

      // 2. Submit wrong answers 3 times
      for (let attempt = 1; attempt <= 2; attempt++) {
        const failRes = await controller.submitKbaAnswers(
          kbaToken,
          {
            sessionId: kbaSession.sessionId,
            answers: { q1: 'wrong', q2: 'wrong', q3: 'wrong' },
          },
          mockReq,
        );
        expect(failRes.passed).toBe(false);
        expect(failRes.locked).toBe(false);
        expect(failRes.attemptsRemaining).toBe(3 - attempt);
      }

      // 3rd failure triggers lockout
      const lockRes = await controller.submitKbaAnswers(
        kbaToken,
        {
          sessionId: kbaSession.sessionId,
          answers: { q1: 'wrong', q2: 'wrong', q3: 'wrong' },
        },
        mockReq,
      );
      expect(lockRes.passed).toBe(false);
      expect(lockRes.locked).toBe(true);
      expect(lockRes.attemptsRemaining).toBe(0);

      // 3. Re-querying document now shows locked state
      const lockedDocView = await controller.getSignerDocument(kbaToken);
      expect(lockedDocView.signer.kbaLocked).toBe(true);

      // 4. Any further verification or sign attempts are rejected with 403
      await expect(controller.initiateKba(kbaToken, mockReq)).rejects.toThrow(HttpException);
      await expect(
        controller.signDocument(kbaToken, { legalAssent: true, signatureData: 'sig' }, mockReq),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('Government ID & Biometric Verification Flow (Zero PII Retention)', () => {
    beforeEach(() => {
      currentSignerState.verificationMethod = 'id_document';
    });

    it('initiates Gov ID verification and stores strictly non-PII audit record', async () => {
      const session: any = await controller.initiateIdVerification(
        idDocToken,
        { returnUrl: 'https://pactintel.internal/done' },
        mockReq,
      );
      expect(session.sessionId).toBeDefined();
      expect(session.verificationUrl).toContain('https://verify.boldsign.com/id/');

      // Check result
      const checkRes = await controller.getIdVerificationResult(
        idDocToken,
        session.sessionId,
        mockReq,
      );
      expect(checkRes.status).toBe('passed');
      expect(checkRes.confidenceScore).toBe(98);
      expect(checkRes.biometricMatch).toBe(true);

      // Ensure no PII was written to signer state
      expect(currentSignerState.verificationResult.ssn).toBeUndefined();
      expect(currentSignerState.verificationResult.driverLicenseNumber).toBeUndefined();
      expect(currentSignerState.verificationResult.photoUrl).toBeUndefined();

      // Sign document
      const signRes = await controller.signDocument(
        idDocToken,
        { legalAssent: true, signatureData: 'typed:Verified Signer' },
        mockReq,
      );
      expect(signRes.signer.status).toBe('signed');
    });
  });

  describe('Qualified Electronic Signature (QES) Flow', () => {
    beforeEach(() => {
      currentSignerState.verificationMethod = 'qes';
    });

    it('initiates QES session for EU member state and completes qualified execution', async () => {
      // 1. Non-EU country code is rejected
      await expect(
        controller.initiateQes(qesToken, { countryCode: 'US' }, mockReq),
      ).rejects.toThrow(HttpException);

      // 2. Valid EU country code initiates QES session
      const qesSession: any = await controller.initiateQes(
        qesToken,
        { countryCode: 'DE', providerPreference: 'D-Trust Qualified QTSP EU' },
        mockReq,
      );
      expect(qesSession.sessionId).toBeDefined();
      expect(qesSession.eidasLevel).toBe('QES');

      // 3. Query QES status
      const qesRes = await controller.getQesResult(qesToken, qesSession.sessionId, mockReq);
      expect(qesRes.status).toBe('completed');
      expect(qesRes.certificateIssuer).toBeDefined();

      // 4. Sign document with QES audit trail
      const signRes = await controller.signDocument(
        qesToken,
        { legalAssent: true, signatureData: 'qes:qualified-cert-DE' },
        mockReq,
      );
      expect(signRes.signer.status).toBe('signed');
    });
  });

  describe('Circuit Breaker Resilience & Conservative Fallback (RULE RISK-001)', () => {
    it('automatically transitions to conservative fallback when BoldSign is down', async () => {
      // Trip circuit breaker
      for (let i = 0; i < 5; i++) {
        adapter.recordFailure();
      }
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(true);

      // When recipient initiates KBA during outage:
      const res = await controller.initiateKba(kbaToken, mockReq);
      expect((res as any).fallbackApplied).toBe(true);
      expect((res as any).fallbackMethod).toBe('sms');

      // Verification method updated to fallback
      expect(currentSignerState.verificationMethod).toBe('sms');
    });
  });
});
