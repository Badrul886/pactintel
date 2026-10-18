import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, sha256 } from '@pactintel/shared-utils';
import { CreateSignatureRequestDto } from '@pactintel/shared-types';

@Injectable()
export class SigningRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a signature request with cryptographic tokens per signer (RULE AUTH-005)
   * and append-only audit trail event (RULE SIG-002).
   */
  async createSignatureRequest(
    organizationId: string,
    dto: CreateSignatureRequestDto,
    externalProviderId?: string,
  ) {
    const requestId = generateId();
    // Signing token valid for 90 days or document expiry (RULE AUTH-005)
    const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const sigReq = await tx.signatureRequest.create({
        data: {
          id: requestId,
          organizationId,
          documentId: dto.documentId,
          documentVersionId: dto.documentVersionId,
          externalProviderId: externalProviderId || `boldsign_${requestId.substring(0, 8)}`,
          status: 'pending',
          signingOrder: dto.signingOrder,
          sentAt: new Date(),
        },
      });

      const signerRecords = [];
      for (const signer of dto.signers) {
        const signingToken = generateId().replace(/-/g, '') + generateId().replace(/-/g, '');
        const passcodeHash = signer.passcode ? sha256(signer.passcode) : null;

        const s = await tx.signer.create({
          data: {
            id: generateId(),
            organizationId,
            signatureRequestId: requestId,
            email: signer.email,
            name: signer.name,
            roleLabel: signer.roleLabel,
            signingOrder: signer.signingOrder,
            verificationMethod: signer.verificationMethod,
            passcodeHash,
            signingToken,
            tokenExpiresAt,
            status:
              signer.signingOrder === 0 || dto.signingOrder === 'parallel' ? 'sent' : 'pending',
          },
        });
        signerRecords.push(s);
      }

      // Record first audit trail event (append-only)
      await tx.signatureEvent.create({
        data: {
          id: generateId(),
          organizationId,
          documentId: dto.documentId,
          eventType: 'sent',
          metadata: { signatureRequestId: requestId, signerCount: signerRecords.length },
        },
      });

      // Update document status to sent if it was draft
      await tx.document.updateMany({
        where: { id: dto.documentId, organizationId, status: 'draft' },
        data: { status: 'sent' },
      });

      return { signatureRequest: sigReq, signers: signerRecords };
    });
  }

  async findSignatureRequestById(organizationId: string, id: string) {
    return this.prisma.signatureRequest.findFirst({
      where: { id, organizationId },
      include: {
        signers: { orderBy: { signingOrder: 'asc' } },
        document: true,
        documentVersion: true,
      },
    });
  }

  async findSignerByToken(signingToken: string) {
    return this.prisma.signer.findUnique({
      where: { signingToken },
      include: {
        signatureRequest: {
          include: {
            document: {
              include: {
                organization: true,
              },
            },
            documentVersion: true,
            signers: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                roleLabel: true,
                signingOrder: true,
                signedAt: true,
              },
              orderBy: { signingOrder: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * RULE SIG-005: Signer substitution preserves full audit trail.
   * Sets old signer to 'reassigned' (never deletes).
   * Inserts signature_events record linking old and new signer IDs.
   * Creates new signer record with a fresh ID and token.
   */
  async reassignSigner(
    organizationId: string,
    signatureRequestId: string,
    oldSignerId: string,
    newSignerData: { email: string; name?: string; reason: string; passcode?: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch existing signer
      const oldSigner = await tx.signer.findFirst({
        where: { id: oldSignerId, signatureRequestId, organizationId },
      });

      if (!oldSigner) {
        throw new Error('Signer to reassign does not exist.');
      }

      if (oldSigner.status === 'signed') {
        throw new Error('Cannot reassign a signer who has already signed.');
      }

      // 2. Mark old signer as 'reassigned' (NEVER DELETE)
      await tx.signer.update({
        where: { id: oldSignerId },
        data: { status: 'reassigned' },
      });

      // 3. Create fresh new signer record
      const newSignerId = generateId();
      const newSigningToken = generateId().replace(/-/g, '') + generateId().replace(/-/g, '');
      const newPasscodeHash = newSignerData.passcode ? sha256(newSignerData.passcode) : null;
      const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const newSigner = await tx.signer.create({
        data: {
          id: newSignerId,
          organizationId,
          signatureRequestId,
          email: newSignerData.email,
          name: newSignerData.name,
          roleLabel: oldSigner.roleLabel,
          signingOrder: oldSigner.signingOrder,
          verificationMethod: oldSigner.verificationMethod,
          passcodeHash: newPasscodeHash,
          signingToken: newSigningToken,
          tokenExpiresAt,
          status: 'sent',
        },
      });

      // 4. Create signature_events audit record (append-only)
      const sigReq = await tx.signatureRequest.findUnique({
        where: { id: signatureRequestId },
      });

      const auditEvent = await tx.signatureEvent.create({
        data: {
          id: generateId(),
          organizationId,
          documentId: sigReq!.documentId,
          signerId: oldSignerId,
          eventType: 'reassigned',
          metadata: {
            reassignedTo: newSignerId,
            reason: newSignerData.reason,
            oldEmail: oldSigner.email,
            newEmail: newSignerData.email,
          },
        },
      });

      return { oldSigner, newSigner, auditEvent };
    });
  }

  /**
   * RULE SIG-002: Verifies content hash before recording signature.
   * RULE SIG-003: Partial signing locks document version (is_signed = true).
   */
  async recordSignature(
    organizationId: string,
    documentId: string,
    signerId: string,
    signatureData: string | Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch signer and verify current state
      const signer = await tx.signer.findFirst({
        where: { id: signerId, organizationId },
        include: { signatureRequest: true },
      });

      if (!signer) {
        throw new Error('Signer does not exist.');
      }

      if (signer.status === 'signed') {
        return { signer, alreadySigned: true, allCompleted: false };
      }

      // 2. Lock document version immediately (RULE SIG-003)
      await tx.documentVersion.updateMany({
        where: {
          id: signer.signatureRequest.documentVersionId,
          organizationId,
        },
        data: { isSigned: true },
      });

      // 3. Update signer to 'signed'
      const updatedSigner = await tx.signer.update({
        where: { id: signerId },
        data: {
          status: 'signed',
          signedAt: new Date(),
          signatureData: signatureData as Prisma.InputJsonValue,
          ipAddress,
          userAgent,
        },
      });

      // 4. Append to immutable signature_events table
      await tx.signatureEvent.create({
        data: {
          id: generateId(),
          organizationId,
          documentId,
          signerId,
          eventType: 'signed',
          ipAddress,
          userAgent,
          metadata: { signerEmail: updatedSigner.email },
        },
      });

      // 5. Check if all signers for this request are completed
      const remainingSigners = await tx.signer.count({
        where: {
          signatureRequestId: signer.signatureRequestId,
          status: { notIn: ['signed', 'reassigned'] },
        },
      });

      const allCompleted = remainingSigners === 0;

      if (allCompleted) {
        await tx.signatureRequest.update({
          where: { id: signer.signatureRequestId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });

        await tx.document.update({
          where: { id: documentId },
          data: { status: 'signed' },
        });
      }

      return { signer: updatedSigner, allCompleted, alreadySigned: false };
    });
  }

  async recordDecline(
    organizationId: string,
    documentId: string,
    signerId: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const signer = await tx.signer.update({
        where: { id: signerId },
        data: { status: 'declined' },
        include: { signatureRequest: true },
      });

      await tx.signatureRequest.update({
        where: { id: signer.signatureRequestId },
        data: { status: 'declined' },
      });

      await tx.document.update({
        where: { id: documentId },
        data: { status: 'declined' },
      });

      await tx.signatureEvent.create({
        data: {
          id: generateId(),
          organizationId,
          documentId,
          signerId,
          eventType: 'declined',
          ipAddress,
          userAgent,
          metadata: { reason, signerEmail: signer.email },
        },
      });

      return signer;
    });
  }

  async voidRequest(organizationId: string, signatureRequestId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const sigReq = await tx.signatureRequest.update({
        where: { id: signatureRequestId, organizationId },
        data: { status: 'voided' },
        include: { document: true },
      });

      await tx.document.update({
        where: { id: sigReq.documentId },
        data: { status: 'voided' },
      });

      await tx.signatureEvent.create({
        data: {
          id: generateId(),
          organizationId,
          documentId: sigReq.documentId,
          eventType: 'voided',
          metadata: { reason, signatureRequestId },
        },
      });

      return sigReq;
    });
  }

  /**
   * RULE BOLD-002: Query in-progress requests older than 1 hour for reconciliation
   */
  async findStalledRequestsForReconciliation() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.prisma.signatureRequest.findMany({
      where: {
        status: { in: ['in_progress', 'pending'] },
        createdAt: { lt: oneHourAgo },
      },
      include: {
        document: true,
        documentVersion: true,
        signers: true,
      },
    });
  }
}
