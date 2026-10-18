import { TemplateController } from '../template.controller';
import { TemplateService } from '../template.service';
import { ClsService } from 'nestjs-cls';

describe('TemplateController Unit Tests', () => {
  let controller: TemplateController;
  let mockService: Partial<TemplateService>;
  let mockCls: Partial<ClsService>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const workspaceId = '33333333-3333-7333-8333-333333333333';
  const templateId = '44444444-4444-7444-8444-444444444444';

  beforeEach(() => {
    mockService = {
      createTemplate: jest.fn(),
      getTemplate: jest.fn(),
      listTemplates: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
      createDocumentFromTemplate: jest.fn(),
      saveDocumentAsTemplate: jest.fn(),
      createContentBlock: jest.fn(),
      getContentBlock: jest.fn(),
      listContentBlocks: jest.fn(),
      updateContentBlock: jest.fn(),
      deleteContentBlock: jest.fn(),
      insertContentBlock: jest.fn(),
      createFolder: jest.fn(),
      getFolder: jest.fn(),
      listFolders: jest.fn(),
      updateFolder: jest.fn(),
      deleteFolder: jest.fn(),
    };

    mockCls = {
      get: jest.fn().mockImplementation((key?: any) => {
        if (key === 'organizationId') return orgId;
        if (key === 'userId') return userId;
        return undefined;
      }) as any,
    };

    controller = new TemplateController(mockService as TemplateService, mockCls as ClsService);
  });

  it('createTemplate delegates with orgId from CLS', async () => {
    const dto = {
      workspaceId,
      title: 'Consulting Agreement',
      content: { type: 'doc' },
    };
    (mockService.createTemplate as jest.Mock).mockResolvedValue({ id: templateId, ...dto });

    const result = await controller.createTemplate(dto as any);
    expect(result.id).toBe(templateId);
    expect(mockService.createTemplate).toHaveBeenCalledWith(orgId, dto);
  });

  it('listTemplates passes query options correctly', async () => {
    (mockService.listTemplates as jest.Mock).mockResolvedValue({ items: [], nextCursor: null });

    await controller.listTemplates(workspaceId, 'Contracts', undefined, 'MSA', 'cursor123', '10');
    expect(mockService.listTemplates).toHaveBeenCalledWith(orgId, {
      workspaceId,
      category: 'Contracts',
      folderId: undefined,
      search: 'MSA',
      cursor: 'cursor123',
      limit: 10,
    });
  });

  it('createDocumentFromTemplate passes orgId, userId, templateId, and dto', async () => {
    const dto = { title: 'Client Doc', variables: { key: 'value' } };
    (mockService.createDocumentFromTemplate as jest.Mock).mockResolvedValue({
      document: { id: 'doc-1' },
    });

    const result = await controller.createDocumentFromTemplate(templateId, dto);
    expect(result).toEqual({ document: { id: 'doc-1' } });
    expect(mockService.createDocumentFromTemplate).toHaveBeenCalledWith(
      orgId,
      userId,
      templateId,
      dto,
    );
  });

  it('saveDocumentAsTemplate delegates with orgId, docId, and dto', async () => {
    const dto = { title: 'From Doc Template' };
    (mockService.saveDocumentAsTemplate as jest.Mock).mockResolvedValue({ id: 'tmpl-new' });

    const result = await controller.saveDocumentAsTemplate('doc-1', dto);
    expect(result).toEqual({ id: 'tmpl-new' });
    expect(mockService.saveDocumentAsTemplate).toHaveBeenCalledWith(orgId, 'doc-1', dto);
  });

  it('insertContentBlock delegates with orgId and blockId', async () => {
    (mockService.insertContentBlock as jest.Mock).mockResolvedValue({
      id: 'block-1',
      usageCount: 2,
    });

    const result = await controller.insertContentBlock('block-1');
    expect(result.usageCount).toBe(2);
    expect(mockService.insertContentBlock).toHaveBeenCalledWith(orgId, 'block-1');
  });

  it('deleteFolder delegates with orgId and folderId', async () => {
    (mockService.deleteFolder as jest.Mock).mockResolvedValue({ success: true });

    const result = await controller.deleteFolder('folder-1');
    expect(result).toEqual({ success: true });
    expect(mockService.deleteFolder).toHaveBeenCalledWith(orgId, 'folder-1');
  });
});
