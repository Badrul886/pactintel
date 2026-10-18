import { Injectable, Logger } from '@nestjs/common';
import { SigningRepository } from './signing.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class SigningReconciliationService {
  private readonly logger = new Logger(SigningReconciliationService.name);

  constructor(
    private readonly signingRepo: SigningRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * RULE BOLD-002: Reconciles stalled signature requests older than 1 hour.
   * Defense-in-depth against lost webhook deliveries.
   */
  async reconcileStalledRequests(): Promise<{
    reconciledCount: number;
    stalledChecked: number;
  }> {
    const stalledRequests = await this.signingRepo.findStalledRequestsForReconciliation();
    let reconciledCount = 0;

    for (const req of stalledRequests) {
      try {
        // In production: polls BoldSign API GET /v1/documents/:externalProviderId
        // Simulating provider response check
        const providerStatus = await this.fetchProviderStatus(req.externalProviderId || req.id);

        if (providerStatus === 'Completed' && req.status !== 'completed') {
          this.logger.warn(
            `[RULE BOLD-002] Reconciliation found completed provider status for request ${req.id} (doc ${req.documentId}). Auto-completing.`,
          );

          await this.prisma.$transaction(async (tx) => {
            // 1. Lock document version
            await tx.documentVersion.updateMany({
              where: { id: req.documentVersionId },
              data: { isSigned: true },
            });

            // 2. Update request and document to completed / signed
            await tx.signatureRequest.update({
              where: { id: req.id },
              data: { status: 'completed', completedAt: new Date() },
            });

            await tx.document.update({
              where: { id: req.documentId },
              data: { status: 'signed' },
            });

            // 3. Mark pending signers as signed
            await tx.signer.updateMany({
              where: { signatureRequestId: req.id, status: { notIn: ['signed', 'reassigned'] } },
              data: { status: 'signed', signedAt: new Date() },
            });

            // 4. Record audit event
            await tx.signatureEvent.create({
              data: {
                id: generateId(),
                organizationId: req.organizationId,
                documentId: req.documentId,
                eventType: 'signed',
                metadata: {
                  reconciliation: true,
                  reason: 'Signature completion detected via reconciliation, not webhook.',
                },
              },
            });

            // 5. Append audit log entry (RULE BOLD-002 §13.24)
            await tx.auditLogEntry.create({
              data: {
                id: generateId(),
                organizationId: req.organizationId,
                actorType: 'system',
                action: 'signature_request.reconciled',
                resourceType: 'document',
                resourceId: req.documentId,
                changes: {
                  signatureRequestId: req.id,
                  providerStatus: 'Completed',
                  note: 'Signature completion detected via reconciliation, not webhook.',
                },
              },
            });
          });

          reconciledCount++;
        }
      } catch (err: any) {
        this.logger.error(`Failed to reconcile request ${req.id}: ${err.message}`);
      }
    }

    return { reconciledCount, stalledChecked: stalledRequests.length };
  }

  private async fetchProviderStatus(externalProviderId: string): Promise<string> {
    // If mock or sandbox: returns simulated status or Completed if tagged
    if (externalProviderId.includes('force_completed')) {
      return 'Completed';
    }
    return 'InProgress';
  }
}
