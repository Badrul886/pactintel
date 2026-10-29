import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from '../../src/modules/workspace/workspace.service';
import { WorkspaceRepository } from '../../src/modules/workspace/workspace.repository';
import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { CreateWorkspaceDto, AddWorkspaceMemberDto } from '@pactintel/shared-types';
import { HttpException, ForbiddenException, ConflictException } from '@nestjs/common';

/**
 * Phase 3 Sprint 3.8: Multi-Workspace & Parent-Account Oversight Orchestration Test Suite
 * Validates:
 * 1. Multi-workspace lifecycle & quota enforcement (Starter: 1, Pro: 3, Biz: 10, Ent: 100)
 * 2. Cross-workspace boundary isolation (User in WS A cannot access WS B private assets)
 * 3. Shared asset libraries (Templates and Content Blocks with visibility: 'organization' vs 'workspace')
 * 4. Parent-account oversight (Owner views roll-up analytics; Workspace manager views scoped analytics)
 * 5. RULE AUTH-003: Active workspace validation against organization context
 * 6. Transactional outbox event emission for all mutations (Invariant I-06)
 */
describe('Multi-Workspace & Parent-Account Oversight Orchestration (Sprint 3.8)', () => {
  let workspaceService: WorkspaceService;
  let workspaceRepo: WorkspaceRepository;
  let templateRepo: TemplateRepository;
  let outboxEvents: any[] = [];

  const orgA = '0192a000-0000-7000-8000-000000000001';
  const orgB = '0192a000-0000-7000-8000-000000000002';

  const userOwner = '0192a000-0000-7000-8000-000000000010';
  const userAdminA = '0192a000-0000-7000-8000-000000000020';
  const userMemberB = '0192a000-0000-7000-8000-000000000030';
  const userExternal = '0192a000-0000-7000-8000-000000000040';

  // In-memory data store for end-to-end orchestration
  const store = {
    workspaces: new Map<string, any>(),
    memberships: new Map<string, any>(),
    templates: new Map<string, any>(),
    contentBlocks: new Map<string, any>(),
    subscriptions: new Map<string, any>(),
    users: new Map<string, any>(),
    documents: new Map<string, any>(),
  };

  beforeEach(async () => {
    store.workspaces.clear();
    store.memberships.clear();
    store.templates.clear();
    store.contentBlocks.clear();
    store.subscriptions.clear();
    store.users.clear();
    store.documents.clear();
    outboxEvents = [];

    // Seed default subscription and users
    store.subscriptions.set(orgA, { organizationId: orgA, planTier: 'business' });
    store.subscriptions.set(orgB, { organizationId: orgB, planTier: 'starter' });

    store.users.set(userOwner, { id: userOwner, organizationId: orgA, role: 'owner' });
    store.users.set(userAdminA, { id: userAdminA, organizationId: orgA, role: 'member' });
    store.users.set(userMemberB, { id: userMemberB, organizationId: orgA, role: 'member' });
    store.users.set(userExternal, { id: userExternal, organizationId: orgB, role: 'owner' });

    // Seed default workspace for Org A
    const defaultWsA = {
      id: 'ws-default-a',
      organizationId: orgA,
      name: 'Default Workspace A',
      slug: 'default-a',
      isDefault: true,
      parentWorkspaceId: null,
      isSharedLibraryEnabled: true,
      brandingDefaults: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    store.workspaces.set(defaultWsA.id, defaultWsA);

    const mockPrisma: any = {
      workspace: {
        findFirst: jest.fn(({ where }) => {
          for (const ws of store.workspaces.values()) {
            if (where.deletedAt === null && ws.deletedAt !== null) continue;
            if (where.id && ws.id !== where.id) continue;
            if (where.organizationId && ws.organizationId !== where.organizationId) continue;
            if (where.slug && ws.slug !== where.slug) continue;
            return {
              ...ws,
              _count: {
                memberships: Array.from(store.memberships.values()).filter(
                  (m) => m.workspaceId === ws.id,
                ).length,
                documents: Array.from(store.documents.values()).filter(
                  (d) => d.workspaceId === ws.id,
                ).length,
              },
            };
          }
          return null;
        }),
        findMany: jest.fn(({ where }) => {
          return Array.from(store.workspaces.values()).filter((ws) => {
            if (where.deletedAt === null && ws.deletedAt !== null) return false;
            if (where.organizationId && ws.organizationId !== where.organizationId) return false;
            if (where.id?.in && !where.id.in.includes(ws.id)) return false;
            return true;
          });
        }),
        count: jest.fn(({ where }) => {
          return Array.from(store.workspaces.values()).filter((ws) => {
            if (where.deletedAt === null && ws.deletedAt !== null) return false;
            if (where.organizationId && ws.organizationId !== where.organizationId) return false;
            return true;
          }).length;
        }),
        create: jest.fn(({ data }) => {
          const ws = {
            id: data.id || `ws-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          store.workspaces.set(ws.id, ws);
          return ws;
        }),
        update: jest.fn(({ where, data }) => {
          const existing = store.workspaces.get(where.id);
          if (!existing) throw new Error('Workspace not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          store.workspaces.set(where.id, updated);
          return updated;
        }),
      },
      workspaceMembership: {
        findUnique: jest.fn(({ where }) => {
          const target = where.userId_workspaceId || where.workspaceId_userId;
          if (!target) return null;
          const key = `${target.workspaceId}:${target.userId}`;
          const mem = store.memberships.get(key);
          if (!mem) return null;
          return {
            ...mem,
            user: store.users.get(mem.userId) || {
              id: mem.userId,
              name: 'Test User',
              email: 'test@example.com',
            },
          };
        }),
        findMany: jest.fn(({ where }) => {
          return Array.from(store.memberships.values()).filter((m) => {
            if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
            if (where.userId && m.userId !== where.userId) return false;
            return true;
          });
        }),
        count: jest.fn(({ where }) => {
          return Array.from(store.memberships.values()).filter((m) => {
            if (where.workspaceId && m.workspaceId !== where.workspaceId) return false;
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            return true;
          }).length;
        }),
        create: jest.fn(({ data }) => {
          const id = data.id || `mem-${Date.now()}-${Math.random()}`;
          const mem = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          store.memberships.set(`${data.workspaceId}:${data.userId}`, mem);
          return mem;
        }),
        update: jest.fn(({ where, data }) => {
          const target = where.userId_workspaceId || where.workspaceId_userId;
          const key = `${target.workspaceId}:${target.userId}`;
          const existing = store.memberships.get(key);
          if (!existing) throw new Error('Membership not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          store.memberships.set(key, updated);
          return updated;
        }),
        delete: jest.fn(({ where }) => {
          const target = where.userId_workspaceId || where.workspaceId_userId;
          const key = `${target.workspaceId}:${target.userId}`;
          store.memberships.delete(key);
          return { success: true };
        }),
      },
      subscription: {
        findUnique: jest.fn(({ where }) => store.subscriptions.get(where.organizationId) || null),
      },
      user: {
        findFirst: jest.fn(({ where }) => {
          const u = store.users.get(where.id);
          if (u && where.organizationId && u.organizationId !== where.organizationId) return null;
          return u || null;
        }),
      },
      document: {
        count: jest.fn(({ where }) => {
          return Array.from(store.documents.values()).filter((d) => {
            if (where.workspaceId && d.workspaceId !== where.workspaceId) return false;
            if (where.organizationId && d.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && d.deletedAt !== null) return false;
            if (where.status) {
              if (typeof where.status === 'string' && d.status !== where.status) return false;
              if (where.status.in && !where.status.in.includes(d.status)) return false;
            }
            return true;
          }).length;
        }),
        findMany: jest.fn(({ where }) => {
          return Array.from(store.documents.values())
            .filter((d) => {
              if (where.workspaceId && d.workspaceId !== where.workspaceId) return false;
              if (where.organizationId && d.organizationId !== where.organizationId) return false;
              if (where.deletedAt === null && d.deletedAt !== null) return false;
              return true;
            })
            .map((d) => ({
              totalValue: d.totalValue !== undefined ? d.totalValue : 75000,
              currency: d.currency || 'USD',
            }));
        }),
        aggregate: jest.fn(() => ({
          _sum: { totalAmount: 75000 },
        })),
      },
      template: {
        findMany: jest.fn(({ where }) => {
          return Array.from(store.templates.values()).filter((t) => {
            if (where.organizationId && t.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && t.deletedAt !== null) return false;
            if (where.OR) {
              const matchesOr = where.OR.some((condition: any) => {
                if (condition.workspaceId && t.workspaceId === condition.workspaceId) return true;
                if (condition.visibility && t.visibility === condition.visibility) return true;
                return false;
              });
              if (!matchesOr) return false;
            } else if (where.workspaceId && t.workspaceId !== where.workspaceId) {
              return false;
            }
            return true;
          });
        }),
        count: jest.fn(({ where }) => {
          return Array.from(store.templates.values()).filter((t) => {
            if (where.organizationId && t.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && t.deletedAt !== null) return false;
            if (where.visibility && t.visibility !== where.visibility) return false;
            return true;
          }).length;
        }),
        create: jest.fn(({ data }) => {
          const t = { id: data.id || `tmpl-${Date.now()}`, ...data, deletedAt: null };
          store.templates.set(t.id, t);
          return t;
        }),
      },
      contentBlock: {
        findMany: jest.fn(({ where }) => {
          return Array.from(store.contentBlocks.values()).filter((b) => {
            if (where.organizationId && b.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && b.deletedAt !== null) return false;
            if (where.OR) {
              const matchesOr = where.OR.some((condition: any) => {
                if (condition.workspaceId && b.workspaceId === condition.workspaceId) return true;
                if (condition.visibility && b.visibility === condition.visibility) return true;
                return false;
              });
              if (!matchesOr) return false;
            }
            return true;
          });
        }),
        count: jest.fn(({ where }) => {
          return Array.from(store.contentBlocks.values()).filter((b) => {
            if (where.organizationId && b.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && b.deletedAt !== null) return false;
            if (where.visibility && b.visibility !== where.visibility) return false;
            return true;
          }).length;
        }),
        create: jest.fn(({ data }) => {
          const b = { id: data.id || `block-${Date.now()}`, ...data, deletedAt: null };
          store.contentBlocks.set(b.id, b);
          return b;
        }),
      },
      brandKit: {
        count: jest.fn(({ where }) => {
          return where.visibility === 'organization' ? 2 : 0;
        }),
      },
      outboxEvent: {
        create: jest.fn(({ data }) => {
          outboxEvents.push(data);
          return data;
        }),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    const mockOutbox = {
      emit: jest.fn(async (_tx, org, eventType, aggregateId, payload) => {
        const evt = {
          id: `evt-${Date.now()}`,
          organizationId: org,
          eventType,
          aggregateId,
          payload,
          createdAt: new Date(),
        };
        outboxEvents.push(evt);
        return evt;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        WorkspaceRepository,
        TemplateRepository,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentOutboxService, useValue: mockOutbox },
      ],
    }).compile();

    workspaceService = module.get<WorkspaceService>(WorkspaceService);
    workspaceRepo = module.get<WorkspaceRepository>(WorkspaceRepository);
    templateRepo = module.get<TemplateRepository>(TemplateRepository);
  });

  describe('1. Multi-Workspace Creation & Quota Enforcement', () => {
    it('creates Workspace A (NA Sales) and assigns creator as workspace admin', async () => {
      const dto: CreateWorkspaceDto = {
        name: 'North America Sales',
        slug: 'na-sales',
        isSharedLibraryEnabled: true,
        brandingDefaults: { primaryColor: '#2563EB' },
      };

      const wsA = await workspaceService.createWorkspace(orgA, dto, userAdminA);
      expect(wsA.id).toBeDefined();
      expect(wsA.name).toBe('North America Sales');
      expect(wsA.slug).toBe('na-sales');

      // Verify creator was assigned as workspace admin
      const membership = await workspaceRepo.findMembership(wsA.id, userAdminA);
      expect(membership).toBeDefined();
      expect(membership?.role).toBe('admin');
      expect(membership?.hasContentAdmin).toBe(true);

      // Verify transactional outbox event
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'workspace.created',
            aggregateId: wsA.id,
            payload: expect.objectContaining({ slug: 'na-sales' }),
          }),
        ]),
      );
    });

    it('creates Workspace B (EMEA Sales) and blocks duplicate slug', async () => {
      await workspaceService.createWorkspace(
        orgA,
        { name: 'Workspace A', slug: 'na-sales' },
        userAdminA,
      );

      // Duplicate slug in same organization
      await expect(
        workspaceService.createWorkspace(
          orgA,
          { name: 'Conflict Slug', slug: 'na-sales' },
          userMemberB,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('enforces plan tier quota (Starter allows max 1 workspace)', async () => {
      // Org B is on Starter plan and already has 1 workspace
      store.workspaces.set('ws-starter-default', {
        id: 'ws-starter-default',
        organizationId: orgB,
        name: 'Org B Default',
        slug: 'org-b-default',
        isDefault: true,
        deletedAt: null,
      });

      await expect(
        workspaceService.createWorkspace(
          orgB,
          { name: 'Org B Second', slug: 'org-b-second' },
          userExternal,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('2. Cross-Workspace Member Isolation & Access Control', () => {
    let wsAId: string;
    let wsBId: string;

    beforeEach(async () => {
      const wsA = await workspaceService.createWorkspace(
        orgA,
        { name: 'Workspace A', slug: 'ws-a' },
        userAdminA,
      );
      const wsB = await workspaceService.createWorkspace(
        orgA,
        { name: 'Workspace B', slug: 'ws-b' },
        userMemberB,
      );
      wsAId = wsA.id;
      wsBId = wsB.id;
    });

    it('allows User A to access Workspace A details, but blocks User A from Workspace B', async () => {
      // User A is admin in WS A
      const wsA = await workspaceService.getWorkspaceById(wsAId, orgA, userAdminA, 'member');
      expect(wsA.id).toBe(wsAId);

      // User A tries to access WS B without membership -> 403
      await expect(
        workspaceService.getWorkspaceById(wsBId, orgA, userAdminA, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows Account Owner to access both Workspace A and Workspace B (Parent Oversight)', async () => {
      const wsA = await workspaceService.getWorkspaceById(wsAId, orgA, userOwner, 'owner');
      const wsB = await workspaceService.getWorkspaceById(wsBId, orgA, userOwner, 'owner');
      expect(wsA.id).toBe(wsAId);
      expect(wsB.id).toBe(wsBId);
    });

    it('allows Workspace Admin to add and manage workspace members', async () => {
      const addDto: AddWorkspaceMemberDto = {
        userId: userMemberB,
        role: 'member',
        hasContentAdmin: false,
      };

      // Admin A adds Member B to WS A
      const membership = await workspaceService.addMember(
        wsAId,
        orgA,
        addDto,
        userAdminA,
        'manager',
      );
      expect(membership.userId).toBe(userMemberB);
      expect(membership.role).toBe('member');

      // Now Member B can access WS A
      const accessibleWs = await workspaceService.getWorkspaceById(
        wsAId,
        orgA,
        userMemberB,
        'member',
      );
      expect(accessibleWs.id).toBe(wsAId);

      // Update Member B to Manager
      const updated = await workspaceService.updateMemberRole(
        wsAId,
        orgA,
        userMemberB,
        { role: 'manager' },
        userAdminA,
        'manager',
      );
      expect(updated.role).toBe('manager');

      // Remove Member B
      await workspaceService.removeMember(wsAId, orgA, userMemberB, userAdminA, 'manager');
      const removedMem = await workspaceRepo.findMembership(wsAId, userMemberB);
      expect(removedMem).toBeNull();
    });
  });

  describe('3. Shared Asset Libraries vs Workspace-Private Assets', () => {
    let wsAId: string;
    let wsBId: string;

    beforeEach(async () => {
      const wsA = await workspaceService.createWorkspace(
        orgA,
        { name: 'WS Alpha', slug: 'ws-alpha' },
        userAdminA,
      );
      const wsB = await workspaceService.createWorkspace(
        orgA,
        { name: 'WS Beta', slug: 'ws-beta' },
        userMemberB,
      );
      wsAId = wsA.id;
      wsBId = wsB.id;

      // Seed templates in store:
      // 1. Private to WS A
      await templateRepo.create(orgA, {
        workspaceId: wsAId,
        title: 'Alpha Private NDA',
        category: 'Legal',
        content: { text: 'Private NDA' },
        visibility: 'workspace',
      } as any);

      // 2. Org-wide shared template
      await templateRepo.create(orgA, {
        workspaceId: wsAId,
        title: 'Master Service Agreement (Org Shared)',
        category: 'Commercial',
        content: { text: 'Shared MSA' },
        visibility: 'organization',
      } as any);

      // Seed content blocks:
      // 1. Private to WS A
      await templateRepo.createContentBlock(orgA, {
        workspaceId: wsAId,
        title: 'Alpha Boilerplate',
        type: 'clause',
        content: { text: 'Alpha terms' },
        visibility: 'workspace',
      } as any);

      // 2. Org-wide shared block
      await templateRepo.createContentBlock(orgA, {
        workspaceId: wsAId,
        title: 'Universal Confidentiality Clause',
        type: 'clause',
        content: { text: 'Confidentiality terms' },
        visibility: 'organization',
      } as any);
    });

    it('returns both workspace-private and org-wide shared templates when querying for Workspace A', async () => {
      const templatesA = await templateRepo.list(orgA, { workspaceId: wsAId });
      expect(templatesA.items).toHaveLength(2);
      const titles = templatesA.items.map((t: any) => t.title);
      expect(titles).toContain('Alpha Private NDA');
      expect(titles).toContain('Master Service Agreement (Org Shared)');
    });

    it('returns org-wide shared templates for Workspace B, but hides Workspace A private template', async () => {
      const templatesB = await templateRepo.list(orgA, { workspaceId: wsBId });
      expect(templatesB.items).toHaveLength(1);
      expect(templatesB.items[0].title).toBe('Master Service Agreement (Org Shared)');
    });

    it('returns org-wide shared content blocks for Workspace B, while hiding WS A private clause', async () => {
      const blocksB = await templateRepo.listContentBlocks(orgA, { workspaceId: wsBId });
      expect(blocksB.items).toHaveLength(1);
      expect(blocksB.items[0].title).toBe('Universal Confidentiality Clause');
    });
  });

  describe('4. Parent-Account Oversight & Cross-Workspace Analytics', () => {
    let wsAId: string;

    beforeEach(async () => {
      const wsA = await workspaceService.createWorkspace(
        orgA,
        { name: 'Revenue Operations', slug: 'rev-ops' },
        userAdminA,
      );
      wsAId = wsA.id;

      // Seed documents
      store.documents.set('doc-1', {
        id: 'doc-1',
        organizationId: orgA,
        workspaceId: wsAId,
        status: 'completed',
        totalValue: 50000,
        currency: 'USD',
        deletedAt: null,
      });
      store.documents.set('doc-2', {
        id: 'doc-2',
        organizationId: orgA,
        workspaceId: wsAId,
        status: 'sent',
        totalValue: 25000,
        currency: 'USD',
        deletedAt: null,
      });
    });

    it('allows Account Owner to view aggregated workspace overview metrics', async () => {
      const overview = await workspaceService.getWorkspaceOverview(wsAId, orgA, userOwner, 'owner');

      expect(overview.workspace.id).toBe(wsAId);
      expect(overview.workspace.slug).toBe('rev-ops');
      expect(overview.metrics.totalDocuments).toBe(2);
      expect(overview.metrics.completedDocuments).toBe(1);
      expect(overview.metrics.pendingDocuments).toBe(1);
      expect(overview.metrics.totalDealValue).toBe(75000);
      expect(overview.metrics.currency).toBe('USD');
      expect(overview.metrics.totalMembers).toBe(1); // creator
    });

    it('blocks regular member from accessing workspace overview metrics', async () => {
      await expect(
        workspaceService.getWorkspaceOverview(wsAId, orgA, userMemberB, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. RULE AUTH-003: Active Workspace Context Validation', () => {
    it('validates workspace belongs to the authenticated organization', async () => {
      const valid = await workspaceService.validateWorkspaceBelongsToOrg('ws-default-a', orgA);
      expect(valid).toBe(true);
    });

    it('rejects workspace when caller attempts cross-tenant manipulation with 403 WORKSPACE_FORBIDDEN', async () => {
      await expect(
        workspaceService.validateWorkspaceBelongsToOrg('ws-default-a', orgB),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
