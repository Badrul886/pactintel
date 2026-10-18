import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { sha256, canonicalJson } from '@pactintel/shared-utils';

describe('RULE SIG-001 & SIG-002: Document Version Immutability & Deterministic Hashing', () => {
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
      softDelete: jest.fn(),
      createVersion: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockTx = {
      document: {
        update: jest.fn(),
      },
      documentVersion: {
        create: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    docService = new DocumentService(
      mockDocRepo as DocumentRepository,
      mockOutbox as DocumentOutboxService,
      mockPrisma as PrismaService,
    );
  });

  describe('RULE SIG-001: Immutability enforcement on signed documents', () => {
    it('rejects saveVersion when latest version is already signed with 409 DOCUMENT_VERSION_SIGNED', async () => {
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'draft',
        versions: [{ versionNumber: 1, isSigned: true }],
      });

      await expect(
        docService.saveVersion(orgId, docId, { content: 'New text' }, 'user-1'),
      ).rejects.toThrow(
        new HttpException(
          {
            code: 'DOCUMENT_VERSION_SIGNED',
            message: 'Cannot modify or add versions to a signed document.',
          },
          HttpStatus.CONFLICT,
        ),
      );

      expect(mockDocRepo.createVersion).not.toHaveBeenCalled();
      expect(mockOutbox.emit).not.toHaveBeenCalled();
    });

    it('rejects saveVersion when document status is signed with 409 DOCUMENT_VERSION_SIGNED', async () => {
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'signed',
        versions: [{ versionNumber: 1, isSigned: false }],
      });

      await expect(
        docService.saveVersion(orgId, docId, { content: 'New text' }, 'user-1'),
      ).rejects.toThrow(
        new HttpException(
          {
            code: 'DOCUMENT_VERSION_SIGNED',
            message: 'Cannot modify or add versions to a signed document.',
          },
          HttpStatus.CONFLICT,
        ),
      );

      expect(mockDocRepo.createVersion).not.toHaveBeenCalled();
    });

    it('rejects updateDocument on signed or voided documents with 409 DOCUMENT_IMMUTABLE', async () => {
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'signed',
        versions: [],
      });

      await expect(
        docService.updateDocument(orgId, docId, { title: 'Changed Title' }),
      ).rejects.toThrow(
        new HttpException(
          {
            code: 'DOCUMENT_IMMUTABLE',
            message: 'Signed or voided documents cannot be modified.',
          },
          HttpStatus.CONFLICT,
        ),
      );

      expect(mockDocRepo.update).not.toHaveBeenCalled();
    });

    it('rejects softDelete on signed documents with 409 DOCUMENT_SIGNED', async () => {
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'signed',
        versions: [],
      });

      await expect(docService.softDelete(orgId, docId)).rejects.toThrow(
        new HttpException(
          {
            code: 'DOCUMENT_SIGNED',
            message: 'Legally signed documents cannot be deleted. Archive instead.',
          },
          HttpStatus.CONFLICT,
        ),
      );

      expect(mockDocRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('RULE SIG-002: Deterministic SHA-256 Content Hashing', () => {
    it('produces identical content hash regardless of JSON object key ordering', () => {
      const snapshotOrderA = {
        type: 'doc',
        title: 'Agreement',
        metadata: { partyA: 'Acme', partyB: 'Globex', value: 5000 },
        clauses: ['clause1', 'clause2'],
      };

      const snapshotOrderB = {
        clauses: ['clause1', 'clause2'],
        metadata: { value: 5000, partyB: 'Globex', partyA: 'Acme' },
        title: 'Agreement',
        type: 'doc',
      };

      const hashA = sha256(canonicalJson(snapshotOrderA));
      const hashB = sha256(canonicalJson(snapshotOrderB));

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64); // SHA-256 hex string
    });

    it('produces distinct hashes when content is genuinely modified', () => {
      const original = {
        type: 'doc',
        text: 'Payment due in 30 days',
      };

      const tampered = {
        type: 'doc',
        text: 'Payment due in 90 days',
      };

      const hashOriginal = sha256(canonicalJson(original));
      const hashTampered = sha256(canonicalJson(tampered));

      expect(hashOriginal).not.toBe(hashTampered);
    });

    it('creates monotonic version increment and emits outbox event on saveVersion', async () => {
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'draft',
        versions: [{ versionNumber: 2, isSigned: false }],
      });

      const newContent = { type: 'doc', text: 'Updated clause' };
      const expectedHash = sha256(canonicalJson(newContent));

      (mockDocRepo.createVersion as jest.Mock).mockResolvedValue({
        id: 'ver-3',
        documentId: docId,
        versionNumber: 3,
        contentSnapshot: newContent,
        contentHash: expectedHash,
      });

      const result = await docService.saveVersion(orgId, docId, newContent, 'user-1');

      expect(mockDocRepo.createVersion).toHaveBeenCalledWith(
        orgId,
        docId,
        3, // version 2 + 1 = 3
        newContent,
        expectedHash,
        'user-1',
      );

      expect(mockOutbox.emit).toHaveBeenCalledWith(
        mockTx,
        orgId,
        'document.created',
        docId,
        expect.objectContaining({
          documentId: docId,
          versionNumber: 3,
          contentHash: expectedHash,
        }),
      );

      expect(result.versionNumber).toBe(3);
    });
  });
});
