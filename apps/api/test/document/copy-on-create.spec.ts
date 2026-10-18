import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256, canonicalJson } from '@pactintel/shared-utils';

describe('RULE SIG-006: Copy-On-Create Template Semantics', () => {
  let docService: DocumentService;
  let mockDocRepo: Partial<DocumentRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const ownerId = 'user-owner-1';
  const templateId = '33333333-3333-7333-8333-333333333333';

  beforeEach(() => {
    mockDocRepo = {
      create: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockTx = {};

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
      template: {
        findFirst: jest.fn(),
      },
    };

    docService = new DocumentService(
      mockDocRepo as DocumentRepository,
      mockOutbox as DocumentOutboxService,
      mockPrisma as PrismaService,
    );
  });

  it('deep-copies template content snapshot on document creation decoupling it from future template changes', async () => {
    const templateContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Standard NDA' }] },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Confidentiality agreement clause.' }],
        },
      ],
    };

    mockPrisma.template.findFirst.mockResolvedValue({
      id: templateId,
      organizationId: orgId,
      title: 'Standard NDA Template',
      content: templateContent,
      deletedAt: null,
    });

    const expectedHash = sha256(canonicalJson(templateContent));

    (mockDocRepo.create as jest.Mock).mockImplementation(
      (
        _orgId: string,
        _ownerId: string,
        dto: any,
        slug: string,
        initialContent: any,
        contentHash: string,
      ) => {
        return Promise.resolve({
          doc: {
            id: 'doc-new-1',
            title: dto.title,
            slug,
            organizationId: orgId,
            status: 'draft',
          },
          version: {
            id: 'ver-1',
            versionNumber: 1,
            contentSnapshot: initialContent,
            contentHash,
          },
        });
      },
    );

    const result = await docService.createDocument(orgId, ownerId, {
      title: 'Acme Corp Non-Disclosure Agreement',
      type: 'contract',
      workspaceId: 'ws-1',
      currency: 'USD',
      sourceTemplateId: templateId,
    });

    expect(mockPrisma.template.findFirst).toHaveBeenCalledWith({
      where: { id: templateId, organizationId: orgId, deletedAt: null },
    });

    expect(mockDocRepo.create).toHaveBeenCalledWith(
      orgId,
      ownerId,
      expect.objectContaining({ title: 'Acme Corp Non-Disclosure Agreement' }),
      expect.stringMatching(/^acme-corp-non-disclosure-agreement-[a-z0-9]+$/),
      templateContent,
      expectedHash,
    );

    expect(mockOutbox.emit).toHaveBeenCalledWith(
      mockTx,
      orgId,
      'document.created',
      'doc-new-1',
      expect.objectContaining({
        documentId: 'doc-new-1',
        versionId: 'ver-1',
      }),
    );

    expect(result.currentVersion.contentSnapshot).toEqual(templateContent);
    expect(result.currentVersion.contentHash).toBe(expectedHash);
  });

  it('initializes with default drafting template when no sourceTemplateId is provided', async () => {
    (mockDocRepo.create as jest.Mock).mockImplementation(
      (
        _orgId: string,
        _ownerId: string,
        dto: any,
        slug: string,
        initialContent: any,
        contentHash: string,
      ) => {
        return Promise.resolve({
          doc: {
            id: 'doc-blank-1',
            title: dto.title,
            slug,
            organizationId: orgId,
            status: 'draft',
          },
          version: {
            id: 'ver-1',
            versionNumber: 1,
            contentSnapshot: initialContent,
            contentHash,
          },
        });
      },
    );

    const result = await docService.createDocument(orgId, ownerId, {
      title: 'Blank Document',
      type: 'contract',
      workspaceId: 'ws-1',
      currency: 'USD',
    });

    expect(mockPrisma.template.findFirst).not.toHaveBeenCalled();

    const expectedDefaultContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start drafting...' }] }],
    };

    expect(mockDocRepo.create).toHaveBeenCalledWith(
      orgId,
      ownerId,
      expect.objectContaining({ title: 'Blank Document' }),
      expect.stringMatching(/^blank-document-[a-z0-9]+$/),
      expectedDefaultContent,
      sha256(canonicalJson(expectedDefaultContent)),
    );

    expect(result.id).toBe('doc-blank-1');
  });
});
