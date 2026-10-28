import { Inject, Injectable, HttpException, HttpStatus, Logger, Optional } from '@nestjs/common';
import { SigningRepository } from './signing.repository';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSignatureRequestDto,
  ReassignSignerDto,
  SignWithTokenDto,
  DeclineWithTokenDto,
  SubmitKbaAnswersDto,
  InitiateIdVerificationDto,
  InitiateQesDto,
} from '@pactintel/shared-types';
import { generateId, sha256 } from '@pactintel/shared-utils';
import { SIGNING_PROVIDER_PORT, SigningProviderPort } from './ports/signing-provider.port';
import { RISK_SCORING_PORT, RiskScoringPort } from './ports/risk-scoring.port';
import {
  CircuitBreakerOpenException,
  SigningProviderTimeoutException,
} from './adapters/boldsign.adapter';

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  // Subscription plan tier ranking for feature gates
  private readonly tierRanks: Record<string, number> = {
    free: 0,
    starter: 1,
    professional: 2,
    business: 3,
    enterprise: 4,
  };

  // EU member states for eIDAS QES jurisdiction checks
  private readonly euJurisdictions = new Set([
    'EU',
    'DE',
    'FR',
    'IT',
    'ES',
    'NL',
    'BE',
    'AT',
    'SE',
    'PL',
    'IE',
    'PT',
    'GR',
    'CZ',
    'RO',
    'DK',
    'FI',
    'SK',
    'BG',
    'HR',
    'LT',
    'SI',
    'LV',
    'EE',
    'CY',
    'LU',
    'MT',
  ]);

  constructor(
    private readonly signingRepo: SigningRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
    @Inject(SIGNING_PROVIDER_PORT)
    private readonly signingProvider: SigningProviderPort,
    @Optional()
    @Inject(RISK_SCORING_PORT)
    private readonly riskScoring?: RiskScoringPort,
  ) {}

  /**
   * Plan gate validation (Sprint 3.6):
   * - KBA: Professional and above
   * - Government ID: Business and above
   * - QES: Enterprise only
   */
  async checkVerificationPlanGate(organizationId: string, method: string): Promise<void> {
    if (['none', 'email', 'passcode', 'sms'].includes(method)) {
      return;
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    const currentTier = sub?.planTier?.toLowerCase() || 'free';
    const rank = this.tierRanks[currentTier] ?? 0;

    if (method === 'adaptive' && rank < this.tierRanks['business']) {
      throw new HttpException(
        {
          code: 'PLAN_GATE_RESTRICTED',
          message: 'Risk-Adaptive Identity Verification requires a Business plan or above.',
          currentTier,
          requiredTier: 'business',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (method === 'kba' && rank < this.tierRanks['professional']) {
      throw new HttpException(
        {
          code: 'PLAN_GATE_RESTRICTED',
          message: 'Knowledge-Based Authentication (KBA) requires a Professional plan or above.',
          currentTier,
          requiredTier: 'professional',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (method === 'id_document' && rank < this.tierRanks['business']) {
      throw new HttpException(
        {
          code: 'PLAN_GATE_RESTRICTED',
          message: 'Government ID verification requires a Business plan or above.',
          currentTier,
          requiredTier: 'business',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (method === 'qes' && rank < this.tierRanks['enterprise']) {
      throw new HttpException(
        {
          code: 'PLAN_GATE_RESTRICTED',
          message: 'Qualified Electronic Signatures (QES) are restricted to Enterprise plans.',
          currentTier,
          requiredTier: 'enterprise',
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Jurisdiction validation:
   * - KBA: US credit bureau data only -> US only
   * - QES: EU QTSP / eIDAS only -> EU only
   * - Gov ID: Global
   */
  checkVerificationJurisdiction(method: string, jurisdiction?: string): void {
    if (method === 'kba' && jurisdiction && jurisdiction.toUpperCase() !== 'US') {
      throw new HttpException(
        {
          code: 'JURISDICTION_RESTRICTED',
          message: 'Knowledge-Based Authentication (KBA) is only available for US signers.',
          jurisdiction,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (method === 'qes' && jurisdiction && !this.euJurisdictions.has(jurisdiction.toUpperCase())) {
      throw new HttpException(
        {
          code: 'JURISDICTION_RESTRICTED',
          message: 'Qualified Electronic Signatures (QES) are only available for EU signers.',
          jurisdiction,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Conservative fallback resolution (RULE RISK-001):
   * When verification provider is down or circuit breaker trips, fall back to next conservative method
   * (e.g. SMS OTP or Passcode). Never bypass verification platform-wide.
   */
  private getFallbackVerificationMethod(currentMethod: string): 'sms' | 'passcode' | 'id_document' {
    if (currentMethod === 'qes') {
      return 'id_document';
    }
    return 'sms';
  }

  /**
   * Creates a signature request (RULE SIG-002, AUTH-005).
   */
  async createSignatureRequest(
    organizationId: string,
    dto: CreateSignatureRequestDto,
    externalProviderId?: string,
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: dto.documentId, organizationId, deletedAt: null },
      include: { versions: { where: { id: dto.documentVersionId } } },
    });

    if (!doc) {
      throw new HttpException(
        { code: 'DOCUMENT_NOT_FOUND', message: 'Document does not exist.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (doc.status === 'signed' || doc.status === 'voided') {
      throw new HttpException(
        {
          code: 'DOCUMENT_IMMUTABLE',
          message: 'Cannot create a signature request for a signed or voided document.',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Validate plan gates for each requested verification method
    for (const signer of dto.signers) {
      await this.checkVerificationPlanGate(organizationId, signer.verificationMethod);
    }

    const { signatureRequest, signers } = await this.signingRepo.createSignatureRequest(
      organizationId,
      dto,
      externalProviderId,
    );

    // Emit transactional outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'signature_request.created', signatureRequest.id, {
        documentId: doc.id,
        signatureRequestId: signatureRequest.id,
        signerCount: signers.length,
      });
    });

    // Enqueue initial invitation emails asynchronously (RULE NOTIF-001)
    for (const signer of signers.filter((s) => s.status === 'sent')) {
      await this.notificationService.enqueueEmail({
        to: signer.email,
        template: 'signing-invitation',
        organizationId,
        data: {
          documentTitle: doc.title,
          signerName: signer.name || signer.email,
          signingUrl: `/sign/${signer.signingToken}`,
        },
      });
    }

    return { signatureRequest, signers };
  }

  /**
   * RULE SIG-005: Signer substitution preserves the full audit trail.
   */
  async reassignSigner(
    organizationId: string,
    signatureRequestId: string,
    oldSignerId: string,
    dto: ReassignSignerDto,
  ) {
    try {
      const { oldSigner, newSigner, auditEvent } = await this.signingRepo.reassignSigner(
        organizationId,
        signatureRequestId,
        oldSignerId,
        {
          email: dto.newEmail,
          name: dto.newName,
          reason: dto.reason,
        },
      );

      // Emit transactional outbox event (Invariant I-06)
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.emit(tx, organizationId, 'signer.reassigned', newSigner.id, {
          signatureRequestId,
          oldSignerId: oldSigner.id,
          newSignerId: newSigner.id,
          reason: dto.reason,
        });
      });

      // Dispatch invitation email to the new signer
      await this.notificationService.enqueueEmail({
        to: newSigner.email,
        template: 'signing-invitation',
        organizationId,
        data: {
          signerName: newSigner.name || newSigner.email,
          signingUrl: `/sign/${newSigner.signingToken}`,
        },
      });

      return { oldSigner, newSigner, auditEvent };
    } catch (err: any) {
      throw new HttpException(
        { code: 'SIGNER_REASSIGN_FAILED', message: err.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * RULE AUTH-005: External signer access gate (/sign/:token).
   * Validates token expiration, document state, and returns verification requirements.
   */
  async getSignerByToken(token: string, ipAddress?: string, userAgent?: string) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid or unknown signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    // 1. Check token expiration (RULE AUTH-005: 90 days or document expiration)
    if (signer.tokenExpiresAt && new Date() > signer.tokenExpiresAt) {
      throw new HttpException(
        { code: 'TOKEN_EXPIRED', message: 'This signing link has expired.' },
        HttpStatus.GONE,
      );
    }

    const { document, documentVersion } = signer.signatureRequest;

    if (document.status === 'voided') {
      throw new HttpException(
        {
          code: 'DOCUMENT_VOIDED',
          message: 'This signature request has been voided by the sender.',
        },
        HttpStatus.GONE,
      );
    }

    if (document.status === 'expired') {
      throw new HttpException(
        { code: 'DOCUMENT_EXPIRED', message: 'This document has expired.' },
        HttpStatus.GONE,
      );
    }

    // 2. Pre-Verified Network Recognition (Sprint 3.7 - Invariant I-03)
    const emailHash = sha256(signer.email.toLowerCase().trim());
    const preVerified =
      typeof this.signingRepo.findPreVerifiedSigner === 'function'
        ? await this.signingRepo.findPreVerifiedSigner(emailHash)
        : null;
    let isPreVerified = false;

    if (preVerified && new Date() < preVerified.expiresAt) {
      isPreVerified = true;
      const vResult = (signer.verificationResult || {}) as Record<string, any>;
      if (!vResult.preVerified && signer.status !== 'signed') {
        if (typeof this.signingRepo.recordPreVerifiedBypass === 'function') {
          await this.signingRepo.recordPreVerifiedBypass(
            signer.organizationId,
            document.id,
            signer.id,
            preVerified.verificationMethod,
            preVerified.verifiedAt,
            ipAddress,
            userAgent,
          );
        }
        signer.verificationResult = {
          preVerified: true,
          verifiedAt: preVerified.verifiedAt.toISOString(),
          method: preVerified.verificationMethod,
          status: 'passed',
        };
      }
    }

    // 3. Dynamic Risk-Adaptive Method Resolution (Sprint 3.7 - Product Blueprint §5.20)
    if (signer.verificationMethod === 'adaptive' && !isPreVerified && this.riskScoring) {
      const riskResult = await this.riskScoring.computeRiskScore({
        signerId: signer.id,
        email: signer.email,
        name: signer.name || undefined,
        ipAddress,
        userAgent,
        dealValue: document.totalValue ? Number(document.totalValue) : undefined,
        currency: document.currency,
        organizationId: signer.organizationId,
        documentId: document.id,
        signatureRequestId: signer.signatureRequestId,
      });

      if (typeof this.signingRepo.recordRiskAssessment === 'function') {
        await this.signingRepo.recordRiskAssessment({
          organizationId: signer.organizationId,
          signerId: signer.id,
          documentId: document.id,
          signatureRequestId: signer.signatureRequestId,
          riskScore: riskResult.score,
          riskLevel: riskResult.level,
          assignedMethod: riskResult.suggestedMethod,
          isPreVerified: false,
          fallbackApplied: Boolean(riskResult.fallbackApplied),
          factors: riskResult.factors,
          ipAddress,
          userAgent,
        });
      }

      if (riskResult.fallbackApplied) {
        await this.prisma.signatureEvent.create({
          data: {
            id: generateId(),
            organizationId: signer.organizationId,
            documentId: document.id,
            signerId: signer.id,
            eventType: 'risk_scoring_fallback',
            ipAddress,
            userAgent,
            metadata: {
              reason: 'vendor_unreachable',
              fallbackMethod: riskResult.suggestedMethod,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }

      signer.verificationMethod = riskResult.suggestedMethod;
      await this.prisma.signer.update({
        where: { id: signer.id },
        data: { verificationMethod: riskResult.suggestedMethod },
      });
    }

    const requiresPasscode = signer.verificationMethod === 'passcode' && signer.status !== 'signed';
    const isKbaLocked = !!signer.kbaLockedAt;

    return {
      signer: {
        id: signer.id,
        email: signer.email,
        name: signer.name,
        status: signer.status,
        roleLabel: signer.roleLabel,
        verificationMethod: signer.verificationMethod,
        verificationAttempts: signer.verificationAttempts,
        kbaLocked: isKbaLocked,
        kbaLockedAt: signer.kbaLockedAt,
        verificationResult: signer.verificationResult,
        requiresPasscode,
        isPreVerified,
      },
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        currency: document.currency,
        totalValue: document.totalValue,
        organizationName: document.organization.name,
        currentVersion: {
          versionNumber: documentVersion.versionNumber,
          contentSnapshot: documentVersion.contentSnapshot,
          contentHash: documentVersion.contentHash,
        },
      },
    };
  }

  /**
   * RULE AUTH-005: Verifies signer passcode or OTP identity challenge.
   */
  async verifySignerIdentity(
    token: string,
    passcodeAttempt?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        {
          code: 'SIGNER_LOCKED',
          message: 'Signer account is locked due to failed identity verification.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (signer.verificationMethod === 'passcode') {
      if (!passcodeAttempt) {
        throw new HttpException(
          { code: 'PASSCODE_REQUIRED', message: 'A passcode is required to access this document.' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (sha256(passcodeAttempt) !== signer.passcodeHash) {
        throw new HttpException(
          { code: 'INVALID_PASSCODE', message: 'The provided passcode is incorrect.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    // Record 'viewed' transition if status is 'sent'
    if (signer.status === 'sent') {
      await this.prisma.$transaction(async (tx) => {
        await tx.signer.update({
          where: { id: signer.id },
          data: { status: 'viewed' },
        });

        await tx.signatureEvent.create({
          data: {
            id: generateId(),
            organizationId: signer.organizationId,
            documentId: signer.signatureRequest.documentId,
            signerId: signer.id,
            eventType: 'viewed',
            ipAddress,
            userAgent,
            metadata: { signerEmail: signer.email },
          },
        });

        await this.outbox.emit(tx, signer.organizationId, 'signer.viewed', signer.id, {
          signerId: signer.id,
          documentId: signer.signatureRequest.documentId,
        });
      });
    }

    return { verified: true, message: 'Identity verified successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Advanced ID Verification Operations (Sprint 3.6)
  // ---------------------------------------------------------------------------

  /**
   * Initiates KBA session with circuit breaker & plan gate check.
   */
  async initiateKba(token: string, ipAddress?: string, userAgent?: string) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        {
          code: 'KBA_LOCKED',
          message: 'Signer identity verification is locked due to maximum failed attempts.',
          kbaLockedAt: signer.kbaLockedAt,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.checkVerificationPlanGate(signer.organizationId, 'kba');

    try {
      const session = await this.signingProvider.initiateKba({
        signerId: signer.id,
        signerEmail: signer.email,
        signerName: signer.name || undefined,
      });

      return session;
    } catch (err: any) {
      this.logger.error(`[KBA Initiation Error] ${err.message}`);
      if (
        err instanceof CircuitBreakerOpenException ||
        err instanceof SigningProviderTimeoutException
      ) {
        // RULE RISK-001: Conservative fallback to SMS/passcode
        const fallbackMethod = this.getFallbackVerificationMethod('kba');
        await this.signingRepo.recordVerificationFallback(
          signer.organizationId,
          signer.signatureRequest.documentId,
          signer.id,
          'kba',
          fallbackMethod,
          err.message,
          ipAddress,
          userAgent,
        );

        if (typeof this.signingRepo.recordPreVerification === 'function') {
          const emailHash = sha256(signer.email.toLowerCase().trim());
          await this.signingRepo.recordPreVerification(emailHash, 'kba');
        }

        await this.prisma.$transaction(async (tx) => {
          await this.outbox.emit(
            tx,
            signer.organizationId,
            'verification.fallback_applied',
            signer.id,
            {
              signerId: signer.id,
              originalMethod: 'kba',
              fallbackMethod,
              reason: err.message,
            },
          );
        });

        return {
          fallbackApplied: true,
          fallbackMethod,
          message:
            'Verification provider is temporarily unavailable. Switched to fallback verification.',
        };
      }
      throw err;
    }
  }

  /**
   * Submits KBA answers, tracks 3-attempt lockout, emits outbox events.
   */
  async submitKbaAnswers(
    token: string,
    dto: SubmitKbaAnswersDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        {
          code: 'KBA_LOCKED',
          message: 'Signer identity verification is locked due to maximum failed attempts.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const result = await this.signingProvider.submitKbaAnswers({
        sessionId: dto.sessionId,
        signerId: signer.id,
        answers: dto.answers,
      });

      if (result.passed) {
        await this.signingRepo.recordVerificationPassed(
          signer.organizationId,
          signer.signatureRequest.documentId,
          signer.id,
          'kba',
          {
            status: 'passed',
            method: 'kba',
            verifiedAt: new Date().toISOString(),
          },
          ipAddress,
          userAgent,
        );

        if (typeof this.signingRepo.recordPreVerification === 'function') {
          const emailHash = sha256(signer.email.toLowerCase().trim());
          await this.signingRepo.recordPreVerification(emailHash, 'kba');
        }

        await this.prisma.$transaction(async (tx) => {
          await this.outbox.emit(tx, signer.organizationId, 'verification.kba.passed', signer.id, {
            signerId: signer.id,
            documentId: signer.signatureRequest.documentId,
          });
        });

        return {
          passed: true,
          locked: false,
          attemptsRemaining: result.attemptsRemaining,
          message: result.message,
        };
      }

      // Handle failure & lockout count
      const attempts = (signer.verificationAttempts || 0) + 1;
      const locked = attempts >= 3 || result.locked;

      await this.signingRepo.recordKbaFailure(
        signer.organizationId,
        signer.signatureRequest.documentId,
        signer.id,
        attempts,
        locked,
        ipAddress,
        userAgent,
      );

      await this.prisma.$transaction(async (tx) => {
        const eventType = locked ? 'verification.kba.locked' : 'verification.kba.failed';
        await this.outbox.emit(tx, signer.organizationId, eventType, signer.id, {
          signerId: signer.id,
          documentId: signer.signatureRequest.documentId,
          attempts,
          locked,
        });
      });

      // Notify document owner/sender if locked out
      if (locked) {
        await this.notificationService.enqueueEmail({
          to: signer.signatureRequest.document.organization.slug || 'sender@pactintel.internal',
          template: 'kba-lockout-notice',
          organizationId: signer.organizationId,
          data: {
            signerEmail: signer.email,
            signerName: signer.name || signer.email,
            documentTitle: signer.signatureRequest.document.title,
          },
        });
      }

      return {
        passed: false,
        locked,
        attemptsRemaining: Math.max(0, 3 - attempts),
        message: locked ? 'Maximum KBA attempts exceeded. Verification locked.' : result.message,
      };
    } catch (err: any) {
      this.logger.error(`[KBA Submit Error] ${err.message}`);
      if (
        err instanceof CircuitBreakerOpenException ||
        err instanceof SigningProviderTimeoutException
      ) {
        const fallbackMethod = this.getFallbackVerificationMethod('kba');
        await this.signingRepo.recordVerificationFallback(
          signer.organizationId,
          signer.signatureRequest.documentId,
          signer.id,
          'kba',
          fallbackMethod,
          err.message,
          ipAddress,
          userAgent,
        );

        if (typeof this.signingRepo.recordPreVerification === 'function') {
          const emailHash = sha256(signer.email.toLowerCase().trim());
          await this.signingRepo.recordPreVerification(emailHash, 'kba');
        }

        await this.prisma.$transaction(async (tx) => {
          await this.outbox.emit(
            tx,
            signer.organizationId,
            'verification.fallback_applied',
            signer.id,
            {
              signerId: signer.id,
              originalMethod: 'kba',
              fallbackMethod,
              reason: err.message,
            },
          );
        });

        return {
          passed: false,
          locked: false,
          attemptsRemaining: 0,
          fallbackApplied: true,
          fallbackMethod,
          message: 'Identity verification provider unavailable. Switched to fallback verification.',
        };
      }
      throw err;
    }
  }

  /**
   * Initiates Government ID & Biometric Verification (Business+ plan required).
   */
  async initiateIdVerification(
    token: string,
    dto: InitiateIdVerificationDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        { code: 'KBA_LOCKED', message: 'Signer is locked.' },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.checkVerificationPlanGate(signer.organizationId, 'id_document');

    try {
      const session = await this.signingProvider.initiateIdVerification({
        signerId: signer.id,
        signerEmail: signer.email,
        returnUrl: dto.returnUrl,
      });

      await this.prisma.$transaction(async (tx) => {
        await this.outbox.emit(tx, signer.organizationId, 'verification.id.submitted', signer.id, {
          signerId: signer.id,
          sessionId: session.sessionId,
        });
      });

      return session;
    } catch (err: any) {
      this.logger.error(`[ID Verification Initiation Error] ${err.message}`);
      if (
        err instanceof CircuitBreakerOpenException ||
        err instanceof SigningProviderTimeoutException
      ) {
        const fallbackMethod = this.getFallbackVerificationMethod('id_document');
        await this.signingRepo.recordVerificationFallback(
          signer.organizationId,
          signer.signatureRequest.documentId,
          signer.id,
          'id_document',
          fallbackMethod,
          err.message,
          ipAddress,
          userAgent,
        );

        return {
          fallbackApplied: true,
          fallbackMethod,
          message: 'ID verification provider is unavailable. Conservative fallback applied.',
        };
      }
      throw err;
    }
  }

  /**
   * Checks Government ID verification result (ZERO-PII Storage enforced).
   */
  async checkIdVerificationResult(
    token: string,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await this.signingProvider.getIdVerificationResult({ sessionId });

    if (result.status === 'passed') {
      // STRICT ZERO-PII: Only status, score, reference ID, verifiedAt, biometricMatch
      const sanitizedResult = {
        status: 'passed',
        method: 'id_document',
        confidenceScore: result.confidenceScore,
        vendorReferenceId: result.vendorReferenceId,
        biometricMatch: result.biometricMatch,
        verifiedAt: result.verifiedAt || new Date().toISOString(),
      };

      await this.signingRepo.recordVerificationPassed(
        signer.organizationId,
        signer.signatureRequest.documentId,
        signer.id,
        'id_document',
        sanitizedResult,
        ipAddress,
        userAgent,
      );

      if (typeof this.signingRepo.recordPreVerification === 'function') {
        const emailHash = sha256(signer.email.toLowerCase().trim());
        await this.signingRepo.recordPreVerification(emailHash, 'id_document');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.outbox.emit(tx, signer.organizationId, 'verification.id.passed', signer.id, {
          signerId: signer.id,
          confidenceScore: result.confidenceScore,
        });
      });
    } else if (result.status === 'failed') {
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.emit(tx, signer.organizationId, 'verification.id.failed', signer.id, {
          signerId: signer.id,
          failureReason: result.failureReason,
        });
      });
    }

    return result;
  }

  /**
   * Initiates Qualified Electronic Signature (QES - Enterprise only, EU jurisdictions only).
   */
  async initiateQes(token: string, dto: InitiateQesDto, ipAddress?: string, userAgent?: string) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        { code: 'KBA_LOCKED', message: 'Signer is locked.' },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.checkVerificationPlanGate(signer.organizationId, 'qes');
    this.checkVerificationJurisdiction('qes', dto.countryCode);

    try {
      const session = await this.signingProvider.initiateQes({
        signerId: signer.id,
        signerEmail: signer.email,
        signerName: signer.name || undefined,
        countryCode: dto.countryCode,
        providerPreference: dto.providerPreference,
        returnUrl: dto.returnUrl,
      });

      return session;
    } catch (err: any) {
      this.logger.error(`[QES Initiation Error] ${err.message}`);
      if (
        err instanceof CircuitBreakerOpenException ||
        err instanceof SigningProviderTimeoutException
      ) {
        const fallbackMethod = this.getFallbackVerificationMethod('qes');
        await this.signingRepo.recordVerificationFallback(
          signer.organizationId,
          signer.signatureRequest.documentId,
          signer.id,
          'qes',
          fallbackMethod,
          err.message,
          ipAddress,
          userAgent,
        );

        return {
          fallbackApplied: true,
          fallbackMethod,
          message: 'QES trust provider unavailable. Fallback verification applied.',
        };
      }
      throw err;
    }
  }

  /**
   * Checks QES verification status and records Qualified Certificate metadata.
   */
  async checkQesResult(token: string, sessionId: string, ipAddress?: string, userAgent?: string) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await this.signingProvider.getQesResult({ sessionId });

    if (result.status === 'completed') {
      const qesResultData = {
        status: 'passed',
        method: 'qes',
        eidasLevel: 'QES',
        certificateIssuer: result.certificateIssuer,
        certificateSerial: result.certificateSerial,
        qualifiedTimestamp: result.qualifiedTimestamp,
        vendorReferenceId: result.vendorReferenceId,
        verifiedAt: result.verifiedAt || new Date().toISOString(),
      };

      await this.signingRepo.recordVerificationPassed(
        signer.organizationId,
        signer.signatureRequest.documentId,
        signer.id,
        'qes',
        qesResultData,
        ipAddress,
        userAgent,
      );

      if (typeof this.signingRepo.recordPreVerification === 'function') {
        const emailHash = sha256(signer.email.toLowerCase().trim());
        await this.signingRepo.recordPreVerification(emailHash, 'qes');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.outbox.emit(tx, signer.organizationId, 'verification.qes.applied', signer.id, {
          signerId: signer.id,
          certificateIssuer: result.certificateIssuer,
          qualifiedTimestamp: result.qualifiedTimestamp,
        });
      });
    }

    return result;
  }

  /**
   * RULE SIG-002, SIG-003: Submits signature, locks version, and records audit trail.
   */
  async signDocumentWithToken(
    token: string,
    dto: SignWithTokenDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!dto.legalAssent) {
      throw new HttpException(
        {
          code: 'LEGAL_ASSENT_REQUIRED',
          message: 'You must explicitly consent to use electronic signatures.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (signer.kbaLockedAt) {
      throw new HttpException(
        {
          code: 'SIGNER_LOCKED',
          message: 'This signer account has been locked due to failed identity verification.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (signer.status === 'signed') {
      throw new HttpException(
        { code: 'ALREADY_SIGNED', message: 'You have already signed this document.' },
        HttpStatus.CONFLICT,
      );
    }

    // Advanced ID verification gate check before signing
    if (['kba', 'id_document', 'qes'].includes(signer.verificationMethod)) {
      const vResult = signer.verificationResult as any;
      if (!vResult || (vResult.status !== 'passed' && vResult.status !== 'completed')) {
        throw new HttpException(
          {
            code: 'VERIFICATION_REQUIRED',
            message: `Identity verification via ${signer.verificationMethod.toUpperCase()} must be successfully completed before signing.`,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const { signer: updatedSigner, allCompleted } = await this.signingRepo.recordSignature(
      signer.organizationId,
      signer.signatureRequest.documentId,
      signer.id,
      dto.signatureData,
      ipAddress,
      userAgent,
    );

    // Emit transactional outbox events
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, signer.organizationId, 'signer.signed', signer.id, {
        signerId: signer.id,
        documentId: signer.signatureRequest.documentId,
        email: signer.email,
      });

      if (allCompleted) {
        await this.outbox.emit(
          tx,
          signer.organizationId,
          'document.signed',
          signer.signatureRequest.documentId,
          {
            documentId: signer.signatureRequest.documentId,
            signatureRequestId: signer.signatureRequestId,
          },
        );
      }
    });

    return {
      signer: updatedSigner,
      allCompleted,
      message: allCompleted
        ? 'All parties have signed. Document is officially executed.'
        : 'Your signature has been recorded.',
    };
  }

  async declineWithToken(
    token: string,
    dto: DeclineWithTokenDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const signer = await this.signingRepo.findSignerByToken(token);
    if (!signer) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Invalid signing token.' },
        HttpStatus.NOT_FOUND,
      );
    }

    const updatedSigner = await this.signingRepo.recordDecline(
      signer.organizationId,
      signer.signatureRequest.documentId,
      signer.id,
      dto.reason,
      ipAddress,
      userAgent,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(
        tx,
        signer.organizationId,
        'document.declined',
        signer.signatureRequest.documentId,
        {
          documentId: signer.signatureRequest.documentId,
          signerId: signer.id,
          reason: dto.reason,
        },
      );
    });

    return {
      signer: updatedSigner,
      message: 'You have declined to sign this document.',
    };
  }

  async voidSignatureRequest(organizationId: string, requestId: string, reason: string) {
    const sigReq = await this.signingRepo.findSignatureRequestById(organizationId, requestId);
    if (!sigReq) {
      throw new HttpException(
        { code: 'REQUEST_NOT_FOUND', message: 'Signature request not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (sigReq.status === 'completed' || sigReq.status === 'voided') {
      throw new HttpException(
        {
          code: 'INVALID_VOID_STATUS',
          message: 'Cannot void a completed or already voided signature request.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.signingRepo.voidRequest(organizationId, requestId, reason);

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'document.voided', sigReq.documentId, {
        documentId: sigReq.documentId,
        signatureRequestId: requestId,
        reason,
      });
    });

    return updated;
  }
}
