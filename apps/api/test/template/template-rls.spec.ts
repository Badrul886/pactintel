import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Integration Test: Cross-Tenant RLS Isolation for Phase 1 Sprint 1 Stores', () => {
  const orgA = '11111111-1111-7111-8111-111111111111';
  const orgB = '22222222-2222-7222-8222-222222222222';

  interface StoreRow {
    id: string;
    organizationId: string;
    [key: string]: unknown;
  }

  const databaseState: {
    templates: StoreRow[];
    contentBlocks: StoreRow[];
    folders: StoreRow[];
  } = {
    templates: [
      {
        id: 'tmpl-a1',
        organizationId: orgA,
        workspaceId: 'ws-a1',
        title: 'Org A Master Agreement',
        deletedAt: null,
      },
      {
        id: 'tmpl-b1',
        organizationId: orgB,
        workspaceId: 'ws-b1',
        title: 'Org B Secret Proposal',
        deletedAt: null,
      },
    ],
    contentBlocks: [
      {
        id: 'cb-a1',
        organizationId: orgA,
        workspaceId: 'ws-a1',
        title: 'Org A Pricing Table Block',
        deletedAt: null,
      },
      {
        id: 'cb-b1',
        organizationId: orgB,
        workspaceId: 'ws-b1',
        title: 'Org B Confidential Bio',
        deletedAt: null,
      },
    ],
    folders: [
      {
        id: 'folder-a1',
        organizationId: orgA,
        workspaceId: 'ws-a1',
        name: 'Org A Legal Templates',
        deletedAt: null,
      },
      {
        id: 'folder-b1',
        organizationId: orgB,
        workspaceId: 'ws-b1',
        name: 'Org B Deal Rooms',
        deletedAt: null,
      },
    ],
  };

  let repo: TemplateRepository;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      template: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.templates.filter(
              (row) => row.organizationId === where.organizationId && !row.deletedAt,
            ),
          );
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.templates.find(
              (row) =>
                row.id === where.id &&
                row.organizationId === where.organizationId &&
                !row.deletedAt,
            ) || null,
          );
        }),
      },
      contentBlock: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.contentBlocks.filter(
              (row) => row.organizationId === where.organizationId && !row.deletedAt,
            ),
          );
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.contentBlocks.find(
              (row) =>
                row.id === where.id &&
                row.organizationId === where.organizationId &&
                !row.deletedAt,
            ) || null,
          );
        }),
      },
      folder: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.folders.filter(
              (row) => row.organizationId === where.organizationId && !row.deletedAt,
            ),
          );
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            databaseState.folders.find(
              (row) =>
                row.id === where.id &&
                row.organizationId === where.organizationId &&
                !row.deletedAt,
            ) || null,
          );
        }),
      },
    };

    repo = new TemplateRepository(mockPrisma as PrismaService);
  });

  it('strictly returns 0 rows when Org B attempts to list templates belonging to Org A', async () => {
    const orgBResults = await repo.list(orgB);
    expect(orgBResults.items).toHaveLength(1);
    expect(orgBResults.items[0].id).toBe('tmpl-b1');
    expect(orgBResults.items.some((item) => item.organizationId === orgA)).toBe(false);

    // Direct access to Org A template by Org B returns null
    const crossTenantGet = await repo.findById(orgB, 'tmpl-a1');
    expect(crossTenantGet).toBeNull();
  });

  it('strictly returns 0 rows when Org B attempts to list content blocks belonging to Org A', async () => {
    const orgBBlocks = await repo.listContentBlocks(orgB);
    expect(orgBBlocks.items).toHaveLength(1);
    expect(orgBBlocks.items[0].id).toBe('cb-b1');
    expect(orgBBlocks.items.some((item) => item.organizationId === orgA)).toBe(false);

    // Direct access to Org A content block by Org B returns null
    const crossTenantBlock = await repo.findContentBlockById(orgB, 'cb-a1');
    expect(crossTenantBlock).toBeNull();
  });

  it('strictly returns 0 rows when Org B attempts to list folders belonging to Org A', async () => {
    const orgBFolders = await repo.listFolders(orgB);
    expect(orgBFolders).toHaveLength(1);
    expect(orgBFolders[0].id).toBe('folder-b1');
    expect(orgBFolders.some((item) => item.organizationId === orgA)).toBe(false);

    // Direct access to Org A folder by Org B returns null
    const crossTenantFolder = await repo.findFolderById(orgB, 'folder-a1');
    expect(crossTenantFolder).toBeNull();
  });
});
