import { SigningService } from '../../src/modules/signing/signing.service';
import { SigningRepository } from '../../src/modules/signing/signing.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RULE SIG-002 & RULE SIG-003: Signing Workflow and Immutability Version Lock', () => {
  let signingService: SigningService;
  let mockSigningRepo: Partial<SigningRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockNotificationService: Partial<NotificationService>;
  let mockPrisma: any;
  let mockTx: any;

  const validToken = 'cryptotoken_signer_1';
  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const sigReqId = '33333333-3333-7333-8333-333333333333';
  const signerId = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockSigningRepo = {
      findSignerByToken: jest.fn(),
      recordSignature: jest.fn(),
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

    signingService = new SigningService(
      mockSigningRepo as SigningRepository,
      mockOutbox as DocumentOutboxService,
      mockNotificationService as NotificationService,
      mockPrisma as PrismaService,
    );
  });

  it('rejects signature submission when legal assent checkbox is false', async () => {
    await expect(
      signingService.signDocumentWithToken(validToken, {
        signatureData: 'data:image/png;base64,sig',
        legalAssent: false,
      }),
    ).rejects.toThrow(
      new HttpException(
        {
          code: 'LEGAL_ASSENT_REQUIRED',
          message: 'You must explicitly consent to use electronic signatures.',
        },
        HttpStatus.BAD_REQUEST,
      ),
    );
  });

  it('rejects duplicate signature if signer already signed', async () => {
    (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
      id: signerId,
      status: 'signed',
    });

    await expect(
      signingService.signDocumentWithToken(validToken, {
        signatureData: 'data:image/png;base64,sig',
        legalAssent: true,
      }),
    ).rejects.toThrow(
      new HttpException(
        { code: 'ALREADY_SIGNED', message: 'You have already signed this document.' },
        HttpStatus.CONFLICT,
      ),
    );
  });

  it('records signature, triggers partial version lock, and emits signer.signed event', async () => {
    (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
      id: signerId,
      organizationId: orgId,
      email: 'signer1@acme.com',
      status: 'viewed',
      signatureRequestId: sigReqId,
      signatureRequest: {
        documentId: docId,
      },
    });

    (mockSigningRepo.recordSignature as jest.Mock).mockResolvedValue({
      signer: { id: signerId, status: 'signed' },
      allCompleted: false, // first of multi-party signers
    });

    const result = await signingService.signDocumentWithToken(
      validToken,
      {
        signatureData: 'data:image/png;base64,sig123',
        legalAssent: true,
      },
      '10.0.0.1',
      'Chrome Windows',
    );

    expect(result.allCompleted).toBe(false);
    expect(result.signer.status).toBe('signed');

    expect(mockSigningRepo.recordSignature).toHaveBeenCalledWith(
      orgId,
      docId,
      signerId,
      'data:image/png;base64,sig123',
      '10.0.0.1',
      'Chrome Windows',
    );

    // Verifies outbox emission for single signature
    expect(mockOutbox.emit).toHaveBeenCalledWith(
      mockTx,
      orgId,
      'signer.signed',
      signerId,
      expect.objectContaining({
        signerId,
        documentId: docId,
        email: 'signer1@acme.com',
      }),
    );
    // document.signed should NOT be emitted yet
    expect(mockOutbox.emit).not.toHaveBeenCalledWith(
      mockTx,
      orgId,
      'document.signed',
      expect.anything(),
      expect.anything(),
    );
  });

  it('emits document.signed event when final signer executes', async () => {
    (mockSigningRepo.findSignerByToken as jest.Mock).mockResolvedValue({
      id: signerId,
      organizationId: orgId,
      email: 'signer2@acme.com',
      status: 'viewed',
      signatureRequestId: sigReqId,
      signatureRequest: {
        documentId: docId,
      },
    });

    (mockSigningRepo.recordSignature as jest.Mock).mockResolvedValue({
      signer: { id: signerId, status: 'signed' },
      allCompleted: true, // all parties have signed
    });

    const result = await signingService.signDocumentWithToken(
      validToken,
      {
        signatureData: 'data:image/png;base64,sig456',
        legalAssent: true,
      },
      '10.0.0.2',
      'Safari Mac',
    );

    expect(result.allCompleted).toBe(true);

    expect(mockOutbox.emit).toHaveBeenCalledWith(
      mockTx,
      orgId,
      'document.signed',
      docId,
      expect.objectContaining({
        documentId: docId,
        signatureRequestId: sigReqId,
      }),
    );
  });
});
