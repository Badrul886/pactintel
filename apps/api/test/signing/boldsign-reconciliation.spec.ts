import { SigningReconciliationService } from '../../src/modules/signing/signing-reconciliation.service';
import { SigningRepository } from '../../src/modules/signing/signing.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE BOLD-002: BoldSign Background Reconciliation', () => {
  let reconciliationService: SigningReconciliationService;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const reqId = '33333333-3333-7333-8333-333333333333';
  const versionId = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockSigningRepo = {
      findStalledRequestsForReconciliation: jest.fn(),
    };

    mockTx = {
      documentVersion: { updateMany: jest.fn() },
      signatureRequest: { update: jest.fn() },
      document: { update: jest.fn() },
      signer: { updateMany: jest.fn() },
      signatureEvent: { create: jest.fn() },
      auditLogEntry: { create: jest.fn() },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    reconciliationService = new SigningReconciliationService(
      mockSigningRepo as SigningRepository,
      mockPrisma as PrismaService,
    );
  });

  it('detects completed external provider status, locks version, and creates audit log entry', async () => {
    (mockSigningRepo.findStalledRequestsForReconciliation as jest.Mock).mockResolvedValue([
      {
        id: reqId,
        organizationId: orgId,
        documentId: docId,
        documentVersionId: versionId,
        status: 'in_progress',
        externalProviderId: 'boldsign_doc_force_completed_123',
      },
    ]);

    const result = await reconciliationService.reconcileStalledRequests();

    expect(result.stalledChecked).toBe(1);
    expect(result.reconciledCount).toBe(1);

    // 1. Version lock (RULE SIG-003)
    expect(mockTx.documentVersion.updateMany).toHaveBeenCalledWith({
      where: { id: versionId },
      data: { isSigned: true },
    });

    // 2. Request and document update to completed / signed
    expect(mockTx.signatureRequest.update).toHaveBeenCalledWith({
      where: { id: reqId },
      data: expect.objectContaining({ status: 'completed' }),
    });

    expect(mockTx.document.update).toHaveBeenCalledWith({
      where: { id: docId },
      data: { status: 'signed' },
    });

    // 3. Mark pending signers as signed
    expect(mockTx.signer.updateMany).toHaveBeenCalledWith({
      where: { signatureRequestId: reqId, status: { notIn: ['signed', 'reassigned'] } },
      data: expect.objectContaining({ status: 'signed' }),
    });

    // 4. Audit Log Entry (RULE BOLD-002)
    expect(mockTx.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgId,
        actorType: 'system',
        action: 'signature_request.reconciled',
        resourceType: 'document',
        resourceId: docId,
        changes: expect.objectContaining({
          signatureRequestId: reqId,
          providerStatus: 'Completed',
          note: 'Signature completion detected via reconciliation, not webhook.',
        }),
      }),
    });
  });

  it('skips reconciliation when external provider reports still InProgress', async () => {
    (mockSigningRepo.findStalledRequestsForReconciliation as jest.Mock).mockResolvedValue([
      {
        id: reqId,
        organizationId: orgId,
        documentId: docId,
        documentVersionId: versionId,
        status: 'in_progress',
        externalProviderId: 'boldsign_doc_still_pending',
      },
    ]);

    const result = await reconciliationService.reconcileStalledRequests();

    expect(result.stalledChecked).toBe(1);
    expect(result.reconciledCount).toBe(0);
    expect(mockTx.document.update).not.toHaveBeenCalled();
  });
});
