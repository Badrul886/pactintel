import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RULE BILL-002: Monthly Document Limit and Quota Checking on Send', () => {
  let docService: DocumentService;
  let mockDocRepo: Partial<DocumentRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';

  beforeEach(() => {
    mockDocRepo = {
      findById: jest.fn().mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'draft',
        title: 'Sales Agreement',
        slug: 'sales-agreement-xyz',
        versions: [{ versionNumber: 1, isSigned: false }],
      }),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockTx = {
      document: {
        update: jest.fn().mockResolvedValue({ id: docId, status: 'sent' }),
      },
      subscription: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
      subscription: {
        findUnique: jest.fn(),
      },
      approvalStep: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    docService = new DocumentService(
      mockDocRepo as DocumentRepository,
      mockOutbox as DocumentOutboxService,
      mockPrisma as PrismaService,
    );
  });

  it('rejects sendDocument with 402 DOCUMENT_LIMIT_REACHED when quota is exhausted', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      organizationId: orgId,
      planTier: 'starter',
      documentLimit: 10,
      documentsUsedThisPeriod: 10,
    });

    await expect(docService.sendDocument(orgId, docId)).rejects.toThrow(
      new HttpException(
        {
          code: 'DOCUMENT_LIMIT_REACHED',
          message:
            'Monthly document limit (10) reached for plan tier starter. Please upgrade to continue.',
          details: { limit: 10, used: 10 },
        },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    expect(mockTx.document.update).not.toHaveBeenCalled();
    expect(mockTx.subscription.update).not.toHaveBeenCalled();
    expect(mockOutbox.emit).not.toHaveBeenCalled();
  });

  it('successfully sends document and increments documentsUsedThisPeriod when within quota', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      organizationId: orgId,
      planTier: 'starter',
      documentLimit: 10,
      documentsUsedThisPeriod: 9,
    });

    const result = await docService.sendDocument(orgId, docId);

    expect(result.status).toBe('sent');
    expect(mockTx.document.update).toHaveBeenCalledWith({
      where: { id: docId, organizationId: orgId },
      data: { status: 'sent' },
    });
    expect(mockTx.subscription.update).toHaveBeenCalledWith({
      where: { organizationId: orgId },
      data: { documentsUsedThisPeriod: { increment: 1 } },
    });
    expect(mockOutbox.emit).toHaveBeenCalledWith(mockTx, orgId, 'document.sent', docId, {
      documentId: docId,
      slug: 'sales-agreement-xyz',
    });
  });

  it('allows sending when documentLimit is null (e.g. Enterprise unlimited tier)', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      organizationId: orgId,
      planTier: 'enterprise',
      documentLimit: null,
      documentsUsedThisPeriod: 540,
    });

    const result = await docService.sendDocument(orgId, docId);

    expect(result.status).toBe('sent');
    expect(mockTx.document.update).toHaveBeenCalledWith({
      where: { id: docId, organizationId: orgId },
      data: { status: 'sent' },
    });
    expect(mockTx.subscription.update).not.toHaveBeenCalled();
    expect(mockOutbox.emit).toHaveBeenCalledWith(
      mockTx,
      orgId,
      'document.sent',
      docId,
      expect.objectContaining({ documentId: docId }),
    );
  });
});
