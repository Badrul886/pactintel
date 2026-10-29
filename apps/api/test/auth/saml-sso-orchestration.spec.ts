import { Test, TestingModule } from '@nestjs/testing';
import { SamlSsoService } from '../../src/modules/auth/saml-sso.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { SessionService } from '../../src/modules/auth/session.service';
import { ApiKeyService } from '../../src/modules/auth/api-key.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigureSamlDto } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.9: SAML SSO End-to-End Orchestration & Policy Enforcement
 * Validates:
 * 1. Admin configures SAML SSO (WorkOS connection, audit log, outbox event)
 * 2. JIT user provisioning on first SAML SSO login
 * 3. Organization-level SSO policy enforcement (optional, required, required_admin_bypass)
 * 4. Multi-tenant boundary isolation (Tenant A cannot access Tenant B SAML config)
 * 5. SAML connection teardown and policy reset
 */
describe('SAML SSO Orchestration & Policy Enforcement (Sprint 3.9)', () => {
  let samlService: SamlSsoService;
  let authService: AuthService;
  let outboxEvents: any[] = [];

  const orgA = '0192a000-0000-7000-8000-000000000001';
  const orgB = '0192a000-0000-7000-8000-000000000002';

  const userOwnerA = '0192a000-0000-7000-8000-000000000010';
  const userAdminA = '0192a000-0000-7000-8000-000000000011';
  const userMemberA = '0192a000-0000-7000-8000-000000000012';

  // In-memory mock store
  const store = {
    organizations: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    users: new Map<string, any>(),
    memberships: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  beforeEach(async () => {
    store.organizations.clear();
    store.workspaces.clear();
    store.users.clear();
    store.memberships.clear();
    store.auditLogs = [];
    outboxEvents = [];

    // Seed Organization A
    const orgDataA = {
      id: orgA,
      name: 'Acme Enterprises',
      slug: 'acme-enterprises',
      ssoPolicy: 'optional',
      workosSamlConnectionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.organizations.set(orgA, orgDataA);

    // Seed Organization B
    const orgDataB = {
      id: orgB,
      name: 'Beta Global',
      slug: 'beta-global',
      ssoPolicy: 'optional',
      workosSamlConnectionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.organizations.set(orgB, orgDataB);

    // Default workspace for Org A
    const wsDefaultA = {
      id: 'ws-default-a',
      organizationId: orgA,
      name: 'General',
      isDefault: true,
      deletedAt: null,
    };
    store.workspaces.set(wsDefaultA.id, wsDefaultA);

    // Seed Users in Org A
    store.users.set(userOwnerA, {
      id: userOwnerA,
      organizationId: orgA,
      email: 'owner@acme.com',
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.users.set(userAdminA, {
      id: userAdminA,
      organizationId: orgA,
      email: 'admin@acme.com',
      role: 'admin',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    store.users.set(userMemberA, {
      id: userMemberA,
      organizationId: orgA,
      email: 'member@acme.com',
      role: 'member',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
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
        update: jest.fn(({ where, data }) => {
          const existing = store.organizations.get(where.id);
          if (!existing) throw new Error('Org not found');
          const updated = { ...existing, ...data, updatedAt: new Date() };
          store.organizations.set(where.id, updated);
          return updated;
        }),
      },
      user: {
        findFirst: jest.fn(({ where, include }) => {
          for (const u of store.users.values()) {
            if (where.id && u.id !== where.id) continue;
            if (where.email && u.email.toLowerCase() !== where.email.toLowerCase()) continue;
            if (where.organizationId && u.organizationId !== where.organizationId) continue;
            if (where.deletedAt === null && u.deletedAt !== null) continue;
            if (include?.organization) {
              return { ...u, organization: store.organizations.get(u.organizationId) };
            }
            return u;
          }
          return null;
        }),
        findUnique: jest.fn(({ where, include }) => {
          const u = store.users.get(where.id);
          if (!u) return null;
          if (include?.organization) {
            return { ...u, organization: store.organizations.get(u.organizationId) };
          }
          return u;
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
      subscription: {
        findUnique: jest.fn(() => ({ planTier: 'enterprise' })),
      },
      $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    };

    const mockSession = {
      createSession: jest.fn(async () => 'sess_test_xyz'),
      destroySession: jest.fn(),
      destroyAllUserSessions: jest.fn(),
      getSession: jest.fn(),
    };

    const mockApiKey = {
      validateApiKey: jest.fn(),
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
        SamlSsoService,
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SessionService, useValue: mockSession },
        { provide: ApiKeyService, useValue: mockApiKey },
        { provide: DocumentOutboxService, useValue: mockOutbox },
      ],
    }).compile();

    samlService = module.get<SamlSsoService>(SamlSsoService);
    authService = module.get<AuthService>(AuthService);
  });

  describe('1. SAML SSO Configuration Lifecycle', () => {
    it('allows Admin to configure SAML SSO and persists WorkOS connection', async () => {
      const dto: ConfigureSamlDto = {
        idpEntityId: 'https://idp.okta.com/exk123',
        idpSsoUrl: 'https://idp.okta.com/app/sso',
        idpCertificate: 'MIID...CERT',
        ssoPolicy: 'optional',
      };

      const config = await samlService.configureSaml(orgA, dto, userAdminA);

      expect(config.status).toBe('active');
      expect(config.connectionId).toBeDefined();
      expect(config.idpEntityId).toBe('https://idp.okta.com/exk123');

      // Verify audit trail
      expect(store.auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'saml_sso.configured',
            actorId: userAdminA,
            organizationId: orgA,
          }),
        ]),
      );

      // Verify transactional outbox event
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'saml.configured',
            organizationId: orgA,
          }),
        ]),
      );
    });

    it('rejects mandating SSO if no connection is configured', async () => {
      await expect(samlService.updateSsoPolicy(orgA, 'required', userAdminA)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. Just-In-Time (JIT) Provisioning on First SAML SSO Login', () => {
    beforeEach(async () => {
      await samlService.configureSaml(
        orgA,
        {
          idpEntityId: 'https://idp.okta.com/exk123',
          idpSsoUrl: 'https://idp.okta.com/app/sso',
          idpCertificate: 'MIID...CERT',
          ssoPolicy: 'optional',
        },
        userAdminA,
      );
    });

    it('provisions new user automatically when logging in with SAML code', async () => {
      const newEmployeeEmail = 'newhire@acme.com';

      const loginRes = await authService.handleCallback(
        'code_saml_okta_123',
        newEmployeeEmail,
        'sso',
        orgA,
      );

      expect(loginRes.user.email).toBe(newEmployeeEmail);
      expect(loginRes.user.organizationId).toBe(orgA);

      // Verify user was saved in Org A with default workspace membership
      const savedUser = store.users.get(loginRes.user.id);
      expect(savedUser).toBeDefined();
      expect(savedUser?.organizationId).toBe(orgA);
      expect(savedUser?.role).toBe('member');

      // Verify outbox emitted scim.user_provisioned
      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'scim.user_provisioned',
            organizationId: orgA,
            payload: expect.objectContaining({ email: newEmployeeEmail }),
          }),
        ]),
      );
    });
  });

  describe('3. SSO Policy Enforcement: Optional, Required, Admin Bypass', () => {
    beforeEach(async () => {
      await samlService.configureSaml(
        orgA,
        {
          idpEntityId: 'https://idp.okta.com/exk123',
          idpSsoUrl: 'https://idp.okta.com/app/sso',
          idpCertificate: 'MIID...CERT',
          ssoPolicy: 'optional',
        },
        userAdminA,
      );
    });

    it('allows password and SSO logins under policy = optional', async () => {
      // Password login for member succeeds
      const passLogin = await authService.handleCallback(
        'code_pass_1',
        'member@acme.com',
        'password',
      );
      expect(passLogin.sessionId).toBeDefined();

      // SSO login succeeds
      const ssoLogin = await authService.handleCallback('code_sso_1', 'member@acme.com', 'sso');
      expect(ssoLogin.sessionId).toBeDefined();
    });

    it('blocks password login when policy = required, throwing 403 SSO_REQUIRED', async () => {
      await samlService.updateSsoPolicy(orgA, 'required', userAdminA);

      // Password login throws 403
      await expect(
        authService.handleCallback('code_pass_2', 'member@acme.com', 'password'),
      ).rejects.toThrow(ForbiddenException);

      // SSO login continues to succeed
      const ssoLogin = await authService.handleCallback('code_sso_2', 'member@acme.com', 'sso');
      expect(ssoLogin.sessionId).toBeDefined();
    });

    it('allows Admin to bypass under policy = required_admin_bypass, but blocks standard members', async () => {
      await samlService.updateSsoPolicy(orgA, 'required_admin_bypass', userAdminA);

      // Member password login blocked
      await expect(
        authService.handleCallback('code_pass_3', 'member@acme.com', 'password'),
      ).rejects.toThrow(ForbiddenException);

      // Admin password bypass allowed
      const adminLogin = await authService.handleCallback(
        'code_admin_pass',
        'admin@acme.com',
        'password',
      );
      expect(adminLogin.sessionId).toBeDefined();

      // Owner password bypass allowed
      const ownerLogin = await authService.handleCallback(
        'code_owner_pass',
        'owner@acme.com',
        'password',
      );
      expect(ownerLogin.sessionId).toBeDefined();
    });
  });

  describe('4. Tenant Isolation & Teardown', () => {
    beforeEach(async () => {
      await samlService.configureSaml(
        orgA,
        {
          idpEntityId: 'https://idp.okta.com/exk123',
          idpSsoUrl: 'https://idp.okta.com/app/sso',
          idpCertificate: 'MIID...CERT',
          ssoPolicy: 'required',
        },
        userAdminA,
      );
    });

    it('keeps Org B isolated from Org A SAML configuration (Invariant I-03)', async () => {
      const configA = await samlService.getSamlConfig(orgA);
      const configB = await samlService.getSamlConfig(orgB);

      expect(configA.status).toBe('active');
      expect(configA.ssoPolicy).toBe('required');

      // Org B remains unconfigured and optional
      expect(configB.status).toBe('unconfigured');
      expect(configB.connectionId).toBeNull();
      expect(configB.ssoPolicy).toBe('optional');
    });

    it('removes SAML configuration and resets policy to optional', async () => {
      await samlService.removeSamlConfig(orgA, userAdminA);

      const config = await samlService.getSamlConfig(orgA);
      expect(config.status).toBe('unconfigured');
      expect(config.ssoPolicy).toBe('optional');
      expect(config.connectionId).toBeNull();

      expect(outboxEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: 'saml.removed',
            organizationId: orgA,
          }),
        ]),
      );
    });
  });
});
