import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { DocumentStatus } from '@pactintel/shared-types';

describe('RULE SIG-004: Document Status State Machine', () => {
  let docService: DocumentService;
  let mockDocRepo: Partial<DocumentRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';

  beforeEach(() => {
    mockDocRepo = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockTx = {
      document: {
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: any }) => Promise.resolve({ id: docId, ...data })),
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
    };

    docService = new DocumentService(
      mockDocRepo as DocumentRepository,
      mockOutbox as DocumentOutboxService,
      mockPrisma as PrismaService,
    );
  });

  const setupDocWithStatus = (status: DocumentStatus) => {
    (mockDocRepo.findById as jest.Mock).mockResolvedValue({
      id: docId,
      organizationId: orgId,
      status,
      title: 'Master Services Agreement',
      slug: 'msa-test',
      versions: [{ versionNumber: 1, isSigned: false }],
    });
  };

  describe('Legal status transitions', () => {
    it.each<[DocumentStatus, DocumentStatus]>([
      ['draft', 'sent'],
      ['draft', 'archived'],
      ['draft', 'voided'],
      ['sent', 'viewed'],
      ['sent', 'signed'],
      ['sent', 'declined'],
      ['sent', 'expired'],
      ['sent', 'voided'],
      ['sent', 'archived'],
      ['viewed', 'signed'],
      ['viewed', 'declined'],
      ['viewed', 'expired'],
      ['viewed', 'voided'],
      ['viewed', 'archived'],
      ['signed', 'archived'],
      ['declined', 'archived'],
      ['expired', 'archived'],
      ['voided', 'archived'],
      ['archived', 'draft'],
    ])(
      'allows legal transition from %s to %s',
      async (fromStatus: DocumentStatus, toStatus: DocumentStatus) => {
        setupDocWithStatus(fromStatus);

        const result = await docService.transitionStatus(orgId, docId, toStatus);
        expect(result.status).toBe(toStatus);
        expect(mockTx.document.update).toHaveBeenCalledWith({
          where: { id: docId, organizationId: orgId },
          data: { status: toStatus },
        });
      },
    );

    it('emits transactional outbox event for state transitions (Invariant I-06)', async () => {
      setupDocWithStatus('sent');

      await docService.transitionStatus(orgId, docId, 'viewed');

      expect(mockOutbox.emit).toHaveBeenCalledWith(mockTx, orgId, 'document.viewed', docId, {
        documentId: docId,
        status: 'viewed',
      });
    });
  });

  describe('Illegal status transitions rejection', () => {
    it.each<[DocumentStatus, DocumentStatus]>([
      ['draft', 'viewed'],
      ['draft', 'signed'],
      ['sent', 'draft'],
      ['signed', 'draft'],
      ['signed', 'sent'],
      ['signed', 'voided'],
      ['declined', 'sent'],
      ['declined', 'draft'],
      ['declined', 'signed'],
      ['expired', 'sent'],
      ['expired', 'signed'],
      ['voided', 'sent'],
      ['voided', 'draft'],
      ['voided', 'signed'],
      ['archived', 'sent'],
      ['archived', 'signed'],
    ])(
      'rejects illegal transition from %s to %s with 409 INVALID_STATUS_TRANSITION',
      async (fromStatus: DocumentStatus, toStatus: DocumentStatus) => {
        setupDocWithStatus(fromStatus);

        await expect(docService.transitionStatus(orgId, docId, toStatus)).rejects.toThrow(
          new HttpException(
            {
              code: 'INVALID_STATUS_TRANSITION',
              message: `Illegal document status transition from '${fromStatus}' to '${toStatus}'.`,
              details: expect.objectContaining({
                currentStatus: fromStatus,
                targetStatus: toStatus,
              }),
            },
            HttpStatus.CONFLICT,
          ),
        );

        expect(mockTx.document.update).not.toHaveBeenCalled();
        expect(mockOutbox.emit).not.toHaveBeenCalled();
      },
    );
  });
});
