import { Test, TestingModule } from '@nestjs/testing';
import { SamlSsoService } from '../saml-sso.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentOutboxService } from '../../document/outbox/document-outbox.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('SamlSsoService (Sprint 3.9 — SAML SSO & Policy Engine)', () => {
  let service: SamlSsoService;
  let prisma: any;
  let outbox: jest.Mocked<DocumentOutboxService>;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const adminUserId = '0192a000-0000-7000-8000-000000000002';
  const memberUserId = '0192a000-0000-7000-8000-000000000003';

  const mockOrg = {
    id: orgId,
    name: 'Acme Corporation',
    slug: 'acme-corp',
    ssoPolicy: 'optional',
    workosSamlConnectionId: 'conn_test_123',
    createdAt: new Date(),
    updatedAt: new Date(),
    workspaces: [{ id: 'ws-default', isDefault: true, name: 'Default' }],
  };

  beforeEach(async () => {
    const mockPrisma: any = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      workspaceMembership: {
        create: jest.fn(),
      },
      auditLogEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    };

    const mockOutbox = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlSsoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentOutboxService, useValue: mockOutbox },
      ],
    }).compile();

    service = module.get<SamlSsoService>(SamlSsoService);
    prisma = module.get(PrismaService);
    outbox = module.get(DocumentOutboxService);
  });

  describe('configureSaml', () => {
    it('configures SAML connection, creates audit log and emits outbox event', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.organization.update.mockResolvedValue({
        ...mockOrg,
        workosSamlConnectionId: 'conn_new_456',
        ssoPolicy: 'optional',
      });

      const result = await service.configureSaml(
        orgId,
        {
          idpEntityId: 'https://idp.okta.com/exk123',
          idpSsoUrl: 'https://idp.okta.com/app/sso',
          idpCertificate: 'MIID...PEM',
          ssoPolicy: 'optional',
        },
        adminUserId,
      );

      expect(result.status).toBe('active');
      expect(prisma.organization.update).toHaveBeenCalled();
      expect(prisma.auditLogEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'saml_sso.configured',
            actorId: adminUserId,
          }),
        }),
      );
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'saml.configured',
        expect.any(String),
        expect.objectContaining({ idpEntityId: 'https://idp.okta.com/exk123' }),
      );
    });

    it('throws 404 if organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.configureSaml(
          'non-existent',
          {
            idpEntityId: 'https://idp.example.com',
            idpSsoUrl: 'https://idp.example.com/sso',
            idpCertificate: 'CERT',
          },
          adminUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSamlConfig', () => {
    it('returns sanitized active configuration', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);

      const config = await service.getSamlConfig(orgId);
      expect(config.status).toBe('active');
      expect(config.connectionId).toBe('conn_test_123');
      expect(config.ssoPolicy).toBe('optional');
    });

    it('returns unconfigured status when no connection ID is set', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        workosSamlConnectionId: null,
      });

      const config = await service.getSamlConfig(orgId);
      expect(config.status).toBe('unconfigured');
      expect(config.connectionId).toBeNull();
    });
  });

  describe('removeSamlConfig', () => {
    it('removes SAML connection, resets policy to optional, and emits outbox event', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.organization.update.mockResolvedValue({
        ...mockOrg,
        workosSamlConnectionId: null,
        ssoPolicy: 'optional',
      });

      const res = await service.removeSamlConfig(orgId, adminUserId);
      expect(res.success).toBe(true);
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: orgId },
        data: { workosSamlConnectionId: null, ssoPolicy: 'optional' },
      });
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'saml.removed',
        orgId,
        expect.objectContaining({ removedBy: adminUserId }),
      );
    });
  });

  describe('updateSsoPolicy', () => {
    it('updates policy to required when valid connection exists', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.organization.update.mockResolvedValue({
        ...mockOrg,
        ssoPolicy: 'required',
      });

      const updated = await service.updateSsoPolicy(orgId, 'required', adminUserId);
      expect(updated.ssoPolicy).toBe('required');
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'saml.policy_updated',
        orgId,
        expect.objectContaining({ ssoPolicy: 'required' }),
      );
    });

    it('rejects mandating SSO if no SAML connection is configured with 400 Bad Request', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        workosSamlConnectionId: null,
      });

      await expect(service.updateSsoPolicy(orgId, 'required', adminUserId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateSsoLoginPolicy', () => {
    it('allows all login methods when policy is optional', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        ssoPolicy: 'optional',
      });

      const allowed = await service.validateSsoLoginPolicy(orgId, 'password', 'member');
      expect(allowed).toBe(true);
    });

    it('blocks password login when policy is required with 403 SSO_REQUIRED', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        ssoPolicy: 'required',
      });

      await expect(service.validateSsoLoginPolicy(orgId, 'password', 'member')).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await service.validateSsoLoginPolicy(orgId, 'password', 'member');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('SSO_REQUIRED');
      }
    });

    it('allows SAML SSO login when policy is required', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        ssoPolicy: 'required',
      });

      const allowed = await service.validateSsoLoginPolicy(orgId, 'sso', 'member');
      expect(allowed).toBe(true);
    });

    it('allows admin password bypass under required_admin_bypass policy, but blocks regular members', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        ...mockOrg,
        ssoPolicy: 'required_admin_bypass',
      });

      // Admin bypass allowed
      const adminAllowed = await service.validateSsoLoginPolicy(orgId, 'password', 'admin');
      expect(adminAllowed).toBe(true);

      // Regular member blocked
      await expect(service.validateSsoLoginPolicy(orgId, 'password', 'member')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('provisionJitUser', () => {
    it('auto-provisions user on first SSO login, adds to default workspace, and emits outbox event', async () => {
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.user.create.mockResolvedValue({
        id: memberUserId,
        organizationId: orgId,
        email: 'employee@acme.com',
        role: 'member',
        status: 'active',
      });

      const created = await service.provisionJitUser(
        orgId,
        'employee@acme.com',
        'Alice Employee',
        'member',
      );

      expect(created.email).toBe('employee@acme.com');
      expect(prisma.workspaceMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: memberUserId,
            workspaceId: 'ws-default',
            role: 'member',
          }),
        }),
      );
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'scim.user_provisioned',
        memberUserId,
        expect.objectContaining({ email: 'employee@acme.com', provisioningType: 'jit_sso' }),
      );
    });
  });
});
