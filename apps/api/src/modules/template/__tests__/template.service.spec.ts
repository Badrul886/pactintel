import { TemplateService } from '../template.service';
import { TemplateRepository } from '../template.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { sha256, canonicalJson } from '@pactintel/shared-utils';

describe('TemplateService Unit Tests', () => {
  let service: TemplateService;
  let mockRepo: Partial<TemplateRepository>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const workspaceId = '33333333-3333-7333-8333-333333333333';
  const templateId = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      incrementUsageCount: jest.fn(),
      createContentBlock: jest.fn(),
      findContentBlockById: jest.fn(),
      listContentBlocks: jest.fn(),
      updateContentBlock: jest.fn(),
      softDeleteContentBlock: jest.fn(),
      incrementContentBlockUsage: jest.fn(),
      createFolder: jest.fn(),
      findFolderById: jest.fn(),
      listFolders: jest.fn(),
      updateFolder: jest.fn(),
      softDeleteFolder: jest.fn(),
      countFolderContents: jest.fn(),
    };

    mockTx = {
      document: { create: jest.fn() },
      documentVersion: { create: jest.fn() },
      template: { update: jest.fn(), create: jest.fn() },
      outboxEvent: { create: jest.fn() },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
      document: { findFirst: jest.fn() },
      template: { findFirst: jest.fn() },
    };

    service = new TemplateService(mockRepo as TemplateRepository, mockPrisma as PrismaService);
  });

  describe('createTemplate', () => {
    it('creates a template and emits outbox event via repository', async () => {
      const dto = {
        workspaceId,
        title: 'Master Services Agreement',
        category: 'Contracts',
        industryTags: ['software', 'legal'],
        content: { type: 'doc', content: [] },
      };

      (mockRepo.create as jest.Mock).mockResolvedValue({
        id: templateId,
        organizationId: orgId,
        ...dto,
      });

      const result = await service.createTemplate(orgId, dto);
      expect(result.id).toBe(templateId);
      expect(mockRepo.create).toHaveBeenCalledWith(orgId, dto, expect.any(String));
    });
  });

  describe('createDocumentFromTemplate (RULE SIG-006)', () => {
    const rawTemplateContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Agreement between {{clientName}} and {{provider}}' }],
        },
      ],
    };

    beforeEach(() => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        id: templateId,
        organizationId: orgId,
        workspaceId,
        title: 'Variable MSA',
        content: rawTemplateContent,
        usageCount: 0,
      });

      mockTx.document.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data }));
      mockTx.documentVersion.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data }),
      );
      mockTx.template.update.mockResolvedValue({ id: templateId, usageCount: 1 });
      mockTx.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });
    });

    it('deep-copies content, substitutes variables, hashes canonical content, and increments usage', async () => {
      const result = await service.createDocumentFromTemplate(orgId, userId, templateId, {
        title: 'Customized MSA',
        variables: {
          clientName: 'Acme Corp',
          provider: 'PactIntel Inc',
        },
      });

      expect(result.document.title).toBe('Customized MSA');
      expect(result.document.sourceTemplateId).toBe(templateId);
      expect(result.document.isTemplateLinked).toBe(false); // Severed link

      // Assert variable replacement in snapshot
      const snapshot = result.version.contentSnapshot as any;
      expect(snapshot.content[0].content[0].text).toBe(
        'Agreement between Acme Corp and PactIntel Inc',
      );

      // Assert content hash matches canonical hash of substituted snapshot
      const expectedHash = sha256(canonicalJson(snapshot));
      expect(result.version.contentHash).toBe(expectedHash);

      // Assert atomic usage count increment
      expect(mockTx.template.update).toHaveBeenCalledWith({
        where: { id: templateId },
        data: { usageCount: { increment: 1 } },
      });

      // Assert outbox event creation
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'document.created_from_template',
            aggregateType: 'document',
          }),
        }),
      );
    });

    it('throws NotFoundException if template does not exist', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createDocumentFromTemplate(orgId, userId, 'non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveDocumentAsTemplate', () => {
    it('creates a new template from document snapshot without modifying the document', async () => {
      const docSnapshot = {
        type: 'doc',
        content: [{ type: 'paragraph', text: 'Snapshot clause' }],
      };

      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        organizationId: orgId,
        workspaceId,
        title: 'Executed Contract',
        versions: [{ isCurrent: true, contentSnapshot: docSnapshot }],
      });

      mockTx.template.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data }));
      mockTx.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

      const template = await service.saveDocumentAsTemplate(orgId, 'doc-1', {
        title: 'New Contract Template',
        category: 'Contracts',
      });

      expect(template.title).toBe('New Contract Template');
      expect(template.content).toEqual(docSnapshot);
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'template.created',
          }),
        }),
      );
    });
  });

  describe('deleteFolder (RULE FOLD-001)', () => {
    const folderId = 'folder-1';

    it('throws 409 FOLDER_NOT_EMPTY if folder has active templates or documents', async () => {
      (mockRepo.findFolderById as jest.Mock).mockResolvedValue({ id: folderId });
      (mockRepo.countFolderContents as jest.Mock).mockResolvedValue(3); // 3 items inside

      await expect(service.deleteFolder(orgId, folderId)).rejects.toThrow(ConflictException);
      expect(mockRepo.softDeleteFolder).not.toHaveBeenCalled();
    });

    it('soft deletes folder if it contains zero active templates and documents', async () => {
      (mockRepo.findFolderById as jest.Mock).mockResolvedValue({ id: folderId });
      (mockRepo.countFolderContents as jest.Mock).mockResolvedValue(0); // Empty folder

      const result = await service.deleteFolder(orgId, folderId);
      expect(result).toEqual({ success: true });
      expect(mockRepo.softDeleteFolder).toHaveBeenCalledWith(orgId, folderId);
    });
  });

  describe('Content Blocks', () => {
    it('atomically increments usageCount when insertContentBlock is called', async () => {
      const blockId = 'block-1';
      (mockRepo.incrementContentBlockUsage as jest.Mock).mockResolvedValue({
        id: blockId,
        usageCount: 5,
      });

      const updated = await service.insertContentBlock(orgId, blockId);
      expect(updated.usageCount).toBe(5);
      expect(mockRepo.incrementContentBlockUsage).toHaveBeenCalledWith(orgId, blockId);
    });
  });
});
