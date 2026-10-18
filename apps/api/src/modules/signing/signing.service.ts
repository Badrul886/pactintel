import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { SigningRepository } from './signing.repository';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSignatureRequestDto,
  ReassignSignerDto,
  SignWithTokenDto,
  DeclineWithTokenDto,
} from '@pactintel/shared-types';
import { generateId, sha256 } from '@pactintel/shared-utils';

@Injectable()
export class SigningService {
  constructor(
    private readonly signingRepo: SigningRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

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
  async getSignerByToken(token: string) {
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

    const requiresPasscode = signer.verificationMethod === 'passcode' && signer.status !== 'signed';

    return {
      signer: {
        id: signer.id,
        email: signer.email,
        name: signer.name,
        status: signer.status,
        roleLabel: signer.roleLabel,
        verificationMethod: signer.verificationMethod,
        requiresPasscode,
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

    if (signer.status === 'signed') {
      throw new HttpException(
        { code: 'ALREADY_SIGNED', message: 'You have already signed this document.' },
        HttpStatus.CONFLICT,
      );
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
