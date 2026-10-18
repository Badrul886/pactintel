import { TemplateService } from '../../src/modules/template/template.service';
import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('Integration Test: Folder Deletion Safety (RULE FOLD-001)', () => {
  let service: TemplateService;
  let mockRepo: Partial<TemplateRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const folderWithTemplates = 'folder-has-templates';
  const folderWithDocuments = 'folder-has-documents';
  const emptyFolder = 'folder-empty';

  let deletedFolders: string[] = [];

  beforeEach(() => {
    deletedFolders = [];

    mockRepo = {
      findFolderById: jest.fn().mockImplementation((org, id) => {
        if (org === orgId) {
          return Promise.resolve({ id, organizationId: org, name: `Folder ${id}` });
        }
        return Promise.resolve(null);
      }),
      countFolderContents: jest.fn().mockImplementation((_org, id) => {
        if (id === folderWithTemplates) return Promise.resolve(2); // 2 templates inside
        if (id === folderWithDocuments) return Promise.resolve(5); // 5 documents inside
        if (id === emptyFolder) return Promise.resolve(0); // 0 items
        return Promise.resolve(0);
      }),
      softDeleteFolder: jest.fn().mockImplementation((_org, id) => {
        deletedFolders.push(id);
        return Promise.resolve({ count: 1 });
      }),
    };

    mockPrisma = {};

    service = new TemplateService(mockRepo as TemplateRepository, mockPrisma as PrismaService);
  });

  it('prohibits deletion with 409 FOLDER_NOT_EMPTY when active templates exist inside the folder', async () => {
    await expect(service.deleteFolder(orgId, folderWithTemplates)).rejects.toThrow(
      ConflictException,
    );
    expect(deletedFolders).not.toContain(folderWithTemplates);
  });

  it('prohibits deletion with 409 FOLDER_NOT_EMPTY when active documents exist inside the folder', async () => {
    await expect(service.deleteFolder(orgId, folderWithDocuments)).rejects.toThrow(
      ConflictException,
    );
    expect(deletedFolders).not.toContain(folderWithDocuments);
  });

  it('permits deletion when folder is completely empty of active templates and documents', async () => {
    const result = await service.deleteFolder(orgId, emptyFolder);
    expect(result).toEqual({ success: true });
    expect(deletedFolders).toContain(emptyFolder);
  });
});
