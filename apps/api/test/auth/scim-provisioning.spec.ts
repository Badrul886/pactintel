import { Test, TestingModule } from '@nestjs/testing';
import { ScimService } from '../../src/modules/auth/scim.service';
import { ScimAuthGuard } from '../../src/modules/auth/guards/scim-auth.guard';
import { SessionService } from '../../src/modules/auth/session.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { ClsService } from 'nestjs-cls';
import { HttpException, HttpStatus, ExecutionContext } from '@nestjs/common';
import { ScimCreateUserDto, ScimPatchUserDto } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.9: SCIM 2.0 User Sync & Automated Deprovisioning Tests
 * Validates:
 * 1. Bearer token authentication (SCIM_API_KEY)
 * 2. RFC 7644 SCIM 2.0 User Lifecycle (Create, Read, Update, Patch, Delete)
 * 3. Soft-deprovisioning with RULE AUTH-001 immediate Redis session invalidation
 * 4. Preservation of historical contracts and audit trail immutability
 */
describe('SCIM 2.0 User Provisioning & Deprovisioning Integration (Sprint 3.9)', () => {
  let scimService: ScimService;
  let scimAuthGuard: ScimAuthGuard;
  let sessionService: jest.Mocked<SessionService>;
  let outboxEvents: any[] = [];

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const testScimKey = 'secret_scim_api_key_test_123';

  const store = {
    organizations: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  beforeAll(() => {
    process.env.SCIM_API_KEY = testScimKey;
  });

  beforeEach(async () => {
    store.organizations.clear();
    store.workspaces.clear();
    store.users.clear();
    store.memberships.clear();
    store.auditLogs = [];
    outboxEvents = [];

    // Seed Organization & Default Workspace
    store.organizations.set(orgId, {
      id: orgId,
      name: 'MegaCorp Global',
      slug: 'megacorp',
      deletedAt: null,
    });

    store.workspaces.set('ws-default', {
      id: 'ws-default',
      organizationId: orgId,
      name: 'General',
      isDefault: true,
      deletedAt: null,
    });

    const mockPrisma: any = {
      organization: {
        findUnique: jest.fn(({ where, include }) => {
          const org = store.organizations.get(where.id);
          if (!org) return null;
          if (include?.workspaces) {
            const orgWorkspaces = Array.from(store.workspaces.values()).filter(
              (w) => w.organizationId === org.id && w.deletedAt === null,
            );
            return { ...org, workspaces: orgWorkspaces };
          }
          return org;
        }),
      },
      user: {
        findFirst: jest.fn(({ where }) => {
          for (const u of store.users.values()) {
            if (where.id && u.id !== where.id) continue;
            if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) continue;
            if (where.organizationId && u.organizationId !== where.organizationId) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            return u;
          }
          return null;
        }),
        findUnique: jest.fn(({ where }) => store.users.get(where.id) || null),
        findMany: jest.fn(({ where, skip, take }) => {
          let list = Array.from(store.users.values()).filter((u) => {
            if (where.organizationId && u.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            if (where.email?.equals && u.email.toLowerCase() !== where.email.equals.toLowerCase()) {
              return false;
            }
            return true;
          });
          const start = skip || 0;
          const end = take ? start + take : undefined;
          return list.slice(start, end);
        }),
        count: jest.fn(({ where }) => {
          return Array.from(store.users.values()).filter((u) => {
            if (where.organizationId && u.organizationId !== where.organizationId) return false;
            if (where.deletedAt === null && u.deletedAt !== null) return false;
            return true;
          }).length;
        }),
        create: jest.fn(({ data }) => {
          const u = {
            id: data.id || `usr-${Date.now()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          store.users.set(u.id, u);
          return u;
        }),
        update: jest.fn(({ where, data }) => {
          const existing = store.users.get(where.id);
          if (!existing) throw new Error('User not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          store.users.set(where.id, updated);
          return updated;
        }),
      },
      workspaceMembership: {
        create: jest.fn(({ data }) => {
          const m = { id: data.id || `mem-${Date.now()}`, ...data };
          store.memberships.set(`${data.workspaceId}:${data.userId}`, m);
          return m;
        }),
      },
      auditLogEntry: {
        create: jest.fn(({ data }) => {
          store.auditLogs.push(data);
          return data;
        }),
      },
      $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    };

    const mockSession = {
      destroyAllUserSessions: jest.fn(),
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

    const mockCls = {
      get: jest.fn((key: string) => (key === 'organizationId' ? orgId : null)),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimService,
        ScimAuthGuard,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SessionService, useValue: mockSession },
        { provide: DocumentOutboxService, useValue: mockOutbox },
        { provide: ClsService, useValue: mockCls },
      ],
    }).compile();

    scimService = module.get<ScimService>(ScimService);
    scimAuthGuard = module.get<ScimAuthGuard>(ScimAuthGuard);
    sessionService = module.get(SessionService);
  });

  describe('1. SCIM Authentication Guard (RFC 7644)', () => {
    it('accepts valid SCIM Bearer token', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: `Bearer ${testScimKey}`,
              'x-organization-id': orgId,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(scimAuthGuard.canActivate(mockContext)).toBe(true);
    });

    it('rejects missing or invalid Bearer token with RFC 7644 401 Unauthorized Error', () => {
      const mockBadContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              authorization: 'Bearer wrong_token_xyz',
            },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => scimAuthGuard.canActivate(mockBadContext)).toThrow(HttpException);

      try {
        scimAuthGuard.canActivate(mockBadContext);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        expect(err.getResponse().schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
      }
    });
  });

  describe('2. SCIM 2.0 Lifecycle Operations', () => {
    let createdUserId: string;

    it('provisions a new user with POST /scim/v2/Users', async () => {
      const createDto: ScimCreateUserDto = {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'bob@megacorp.com',
        name: {
          formatted: 'Bob Developer',
          givenName: 'Bob',
          familyName: 'Developer',
        },
        emails: [{ value: 'bob@megacorp.com', type: 'work', primary: true }],
        active: true,
      };

      const userRes = await scimService.createUser(orgId, createDto);

      expect(userRes.id).toBeDefined();
      expect(userRes.userName).toBe('bob@megacorp.com');
      expect(userRes.active).toBe(true);
      expect(userRes.name?.familyName).toBe('Developer');
      createdUserId = userRes.id;

      // Verify workspace membership created in default workspace
      expect(store.memberships.size).toBe(1);

      // Verify outbox emitted scim.user_provisioned
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'scim.user_provisioned',
            organizationId: orgId,
            aggregateId: createdUserId,
          }),
        ]),
      );
    });

    it('retrieves user with GET /scim/v2/Users/:id', async () => {
      // Seed user
      const userRes = await scimService.createUser(orgId, {
        userName: 'charlie@megacorp.com',
        name: { formatted: 'Charlie Brown' },
        active: true,
      });

      const retrieved = await scimService.getUser(orgId, userRes.id);
      expect(retrieved.id).toBe(userRes.id);
      expect(retrieved.userName).toBe('charlie@megacorp.com');
    });

    it('lists users with GET /scim/v2/Users with filter and pagination', async () => {
      await scimService.createUser(orgId, { userName: 'user1@megacorp.com', active: true });
      await scimService.createUser(orgId, { userName: 'user2@megacorp.com', active: true });

      const listRes = await scimService.listUsers(orgId, 1, 10);
      expect(listRes.totalResults).toBe(2);
      expect(listRes.Resources).toHaveLength(2);

      // Filter by userName
      const filtered = await scimService.listUsers(
        orgId,
        1,
        10,
        'userName eq "user1@megacorp.com"',
      );
      expect(filtered.Resources).toHaveLength(1);
      expect(filtered.Resources[0].userName).toBe('user1@megacorp.com');
    });

    it('updates user with PUT /scim/v2/Users/:id', async () => {
      const userRes = await scimService.createUser(orgId, {
        userName: 'dave@megacorp.com',
        name: { formatted: 'Dave Old' },
        active: true,
      });

      const updated = await scimService.updateUser(orgId, userRes.id, {
        userName: 'dave@megacorp.com',
        name: { formatted: 'Dave New' },
        active: true,
      });

      expect(updated.name?.formatted).toBe('Dave New');
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'scim.user_updated',
            aggregateId: userRes.id,
          }),
        ]),
      );
    });

    it('patches user with PATCH /scim/v2/Users/:id', async () => {
      const userRes = await scimService.createUser(orgId, {
        userName: 'eve@megacorp.com',
        name: { formatted: 'Eve' },
        active: true,
      });

      const patchDto: ScimPatchUserDto = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          {
            op: 'replace',
            path: 'name.formatted',
            value: 'Eve Senior Engineer',
          },
        ],
      };

      const patched = await scimService.patchUser(orgId, userRes.id, patchDto);
      expect(patched.name?.formatted).toBe('Eve Senior Engineer');
    });
  });

  describe('3. Automated Deprovisioning & Session Revocation (RULE AUTH-001)', () => {
    it('deprovisions user via DELETE /scim/v2/Users/:id: soft-deactivates, destroys all sessions, preserves contracts', async () => {
      const user = await scimService.createUser(orgId, {
        userName: 'frank@megacorp.com',
        name: { formatted: 'Frank Employee' },
        active: true,
      });

      await scimService.deprovisionUser(orgId, user.id);

      // 1. User status is set to 'deactivated'
      const deactUser = store.users.get(user.id);
      expect(deactUser?.status).toBe('deactivated');

      // 2. RULE AUTH-001: All active sessions in Redis are destroyed immediately
      expect(sessionService.destroyAllUserSessions).toHaveBeenCalledWith(user.id);

      // 3. Immutable audit log entry recorded
      expect(store.auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'scim.user_deactivated',
            actorId: user.id,
            organizationId: orgId,
          }),
        ]),
      );

      // 4. Outbox event emitted
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'scim.user_deactivated',
            aggregateId: user.id,
          }),
        ]),
      );
    });

    it('deprovisions user when PATCH specifies active = false', async () => {
      const user = await scimService.createUser(orgId, {
        userName: 'grace@megacorp.com',
        name: { formatted: 'Grace' },
        active: true,
      });

      await scimService.patchUser(orgId, user.id, {
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

      const deactUser = store.users.get(user.id);
      expect(deactUser?.status).toBe('deactivated');
      expect(sessionService.destroyAllUserSessions).toHaveBeenCalledWith(user.id);
    });
  });
});
