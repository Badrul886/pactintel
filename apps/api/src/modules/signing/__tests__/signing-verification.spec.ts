import { HttpException, HttpStatus } from '@nestjs/common';
import { SigningService } from '../signing.service';
import { SigningRepository } from '../signing.repository';
import { DocumentOutboxService } from '../../document/outbox/document-outbox.service';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SigningProviderPort } from '../ports/signing-provider.port';
import { CircuitBreakerOpenException } from '../adapters/boldsign.adapter';

describe('SigningService - Advanced ID Verification (Sprint 3.6)', () => {
  let signingService: SigningService;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockNotificationService: Partial<NotificationService>;
  let mockPrisma: any;
  let mockSigningProvider: Partial<SigningProviderPort>;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const signerId = '0192a000-0000-7000-8000-000000000002';
  const docId = '0192a000-0000-7000-8000-000000000003';
  const validToken = 'valid-token-sprint36-12345';

  beforeEach(() => {
    mockSigningRepo = {
      findSignerByToken: jest.fn(),
      recordKbaFailure: jest.fn(),
      recordVerificationPassed: jest.fn(),
      recordVerificationFallback: jest.fn(),
      recordSignature: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
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
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    mockSigningProvider = {
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
      mockSigningProvider as SigningProviderPort,
    );
  });

  describe('Plan Gating (KBA, Gov ID, QES)', () => {
    it('rejects KBA on Free and Starter plan tiers with 403 Forbidden', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'starter' });

      await expect(signingService.checkVerificationPlanGate(orgId, 'kba')).rejects.toThrow(
        HttpException,
      );

      try {
        await signingService.checkVerificationPlanGate(orgId, 'kba');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect(err.getResponse().code).toBe('PLAN_GATE_RESTRICTED');
      }
    });

    it('allows KBA on Professional, Business, and Enterprise plans', async () => {
      for (const tier of ['professional', 'business', 'enterprise']) {
        mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: tier });
        await expect(signingService.checkVerificationPlanGate(orgId, 'kba')).resolves.not.toThrow();
      }
    });

    it('rejects Government ID on Professional tier and allows on Business/Enterprise', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'professional' });
      await expect(signingService.checkVerificationPlanGate(orgId, 'id_document')).rejects.toThrow(
        HttpException,
      );

      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'business' });
      await expect(
        signingService.checkVerificationPlanGate(orgId, 'id_document'),
      ).resolves.not.toThrow();
    });

    it('rejects QES on Business tier and restricts exclusively to Enterprise', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'business' });
      await expect(signingService.checkVerificationPlanGate(orgId, 'qes')).rejects.toThrow(
        HttpException,
      );

      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'enterprise' });
      await expect(signingService.checkVerificationPlanGate(orgId, 'qes')).resolves.not.toThrow();
    });
  });

  describe('Jurisdiction Enforcement', () => {
    it('restricts KBA to US signers', () => {
      expect(() => signingService.checkVerificationJurisdiction('kba', 'US')).not.toThrow();
      expect(() => signingService.checkVerificationJurisdiction('kba', 'GB')).toThrow(
        HttpException,
      );
    });

    it('restricts QES to EU member states (eIDAS)', () => {
      expect(() => signingService.checkVerificationJurisdiction('qes', 'DE')).not.toThrow();
      expect(() => signingService.checkVerificationJurisdiction('qes', 'FR')).not.toThrow();
      expect(() => signingService.checkVerificationJurisdiction('qes', 'US')).toThrow(
        HttpException,
      );
    });

    it('allows Government ID globally for all countries', () => {
      expect(() => signingService.checkVerificationJurisdiction('id_document', 'US')).not.toThrow();
      expect(() => signingService.checkVerificationJurisdiction('id_document', 'DE')).not.toThrow();
      expect(() => signingService.checkVerificationJurisdiction('id_document', 'SG')).not.toThrow();
    });
  });

  describe('KBA 3-Attempt Lockout (RULE KBA-001)', () => {
    it('rejects initiation and signing when signer is already locked out', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        kbaLockedAt: new Date(),
        signatureRequest: {
          document: { id: docId, status: 'sent', organization: { name: 'Acme', slug: 'acme' } },
          documentVersion: { versionNumber: 1 },
        },
      });

      await expect(signingService.initiateKba(validToken)).rejects.toThrow(HttpException);
      await expect(
        signingService.signDocumentWithToken(validToken, {
          legalAssent: true,
          signatureData: 'sig',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('locks out signer on 3rd failed answer attempt and dispatches owner alert', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        verificationAttempts: 2, // 2 prior failed attempts
        kbaLockedAt: null,
        email: 'target@corp.com',
        signatureRequest: {
          documentId: docId,
          document: { id: docId, title: 'MSA Agreement', organization: { slug: 'acme-corp' } },
        },
      });

      (mockSigningProvider.submitKbaAnswers as jest.Mock).mockResolvedValue({
        passed: false,
        locked: true,
        attemptsRemaining: 0,
        message: 'Maximum KBA attempts exceeded.',
      });

      const result = await signingService.submitKbaAnswers(validToken, {
        sessionId: 'sess-123',
        answers: { q1: 'wrong' },
      });

      expect(result.passed).toBe(false);
      expect(result.locked).toBe(true);
      expect(result.attemptsRemaining).toBe(0);

      // Verify repository recorded KBA failure with locked=true
      expect(mockSigningRepo.recordKbaFailure).toHaveBeenCalledWith(
        orgId,
        docId,
        signerId,
        3,
        true,
        undefined,
        undefined,
      );

      // Verify outbox emitted verification.kba.locked
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'verification.kba.locked',
        signerId,
        expect.objectContaining({ attempts: 3, locked: true }),
      );

      // Verify sender notification email enqueued
      expect(mockNotificationService.enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'kba-lockout-notice',
          organizationId: orgId,
        }),
      );
    });
  });

  describe('Verification Requirement Gate Before Signing', () => {
    it('blocks signing with 403 VERIFICATION_REQUIRED if advanced verification is pending', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        status: 'viewed',
        verificationMethod: 'kba',
        verificationResult: null, // Not yet verified
        signatureRequest: {
          documentId: docId,
          signatureRequestId: 'sigreq-1',
          document: { id: docId, title: 'Contract' },
        },
      });

      await expect(
        signingService.signDocumentWithToken(validToken, {
          legalAssent: true,
          signatureData: 'typed:John Doe',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await signingService.signDocumentWithToken(validToken, {
          legalAssent: true,
          signatureData: 'typed:John Doe',
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect(err.getResponse().code).toBe('VERIFICATION_REQUIRED');
      }
    });

    it('allows signing when identity verification has passed', async () => {
      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        status: 'viewed',
        verificationMethod: 'kba',
        verificationResult: { status: 'passed', method: 'kba' },
        signatureRequest: {
          documentId: docId,
          signatureRequestId: 'sigreq-1',
          document: { id: docId, title: 'Contract' },
        },
      });

      (mockSigningRepo.recordSignature as jest.Mock).mockResolvedValue({
        signer: { id: signerId, status: 'signed' },
        allCompleted: true,
      });

      const res = await signingService.signDocumentWithToken(validToken, {
        legalAssent: true,
        signatureData: 'typed:John Doe',
      });

      expect(res.signer.status).toBe('signed');
      expect(res.allCompleted).toBe(true);
    });
  });

  describe('Circuit Breaker Outage & Conservative Fallback (RULE RISK-001)', () => {
    it('applies conservative fallback to SMS OTP when verification provider circuit breaker trips', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({ planTier: 'enterprise' });

      (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
        id: signerId,
        organizationId: orgId,
        verificationMethod: 'kba',
        signatureRequest: {
          documentId: docId,
          document: { id: docId, title: 'MSA' },
        },
      });

      (mockSigningProvider.initiateKba as jest.Mock).mockRejectedValue(
        new CircuitBreakerOpenException('BoldSign circuit breaker is OPEN'),
      );

      const result = await signingService.initiateKba(validToken);

      expect((result as any).fallbackApplied).toBe(true);
      expect((result as any).fallbackMethod).toBe('sms');

      // Verify repo recorded fallback audit trail
      expect(mockSigningRepo.recordVerificationFallback).toHaveBeenCalledWith(
        orgId,
        docId,
        signerId,
        'kba',
        'sms',
        expect.stringContaining('BoldSign circuit breaker is OPEN'),
        undefined,
        undefined,
      );

      // Verify outbox event emitted
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'verification.fallback_applied',
        signerId,
        expect.objectContaining({
          originalMethod: 'kba',
          fallbackMethod: 'sms',
        }),
      );
    });
  });
});
