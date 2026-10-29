import { Test, TestingModule } from '@nestjs/testing';
import { ScimService } from '../scim.service';
import { SessionService } from '../session.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentOutboxService } from '../../document/outbox/document-outbox.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ScimService (Sprint 3.9 — SCIM 2.0 User Sync & RULE AUTH-001)', () => {
  let service: ScimService;
  let prisma: any;
  let sessionService: jest.Mocked<SessionService>;
  let outbox: jest.Mocked<DocumentOutboxService>;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const userId = '0192a000-0000-7000-8000-000000000010';

  const mockUser = {
    id: userId,
    organizationId: orgId,
    email: 'alice@enterprise.com',
    name: 'Alice Smith',
    role: 'member',
    status: 'active',
    seatType: 'full',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockOrg = {
    id: orgId,
    name: 'Enterprise Corp',
    workspaces: [{ id: 'ws-main', isDefault: true }],
  };

  beforeEach(async () => {
    const mockPrisma: any = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
      },
      workspaceMembership: {
        create: jest.fn(),
      },
      auditLogEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    };

    const mockSession = {
      destroyAllUserSessions: jest.fn(),
    };

    const mockOutbox = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScimService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SessionService, useValue: mockSession },
        { provide: DocumentOutboxService, useValue: mockOutbox },
      ],
    }).compile();

    service = module.get<ScimService>(ScimService);
    prisma = module.get(PrismaService);
    sessionService = module.get(SessionService);
    outbox = module.get(DocumentOutboxService);
  });

  describe('listUsers (RFC 7644)', () => {
    it('returns users in SCIM 2.0 ListResponse format with 1-based indexing', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const response = await service.listUsers(orgId, 1, 20);

      expect(response.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(response.totalResults).toBe(1);
      expect(response.startIndex).toBe(1);
      expect(response.itemsPerPage).toBe(1);
      expect(response.Resources[0].userName).toBe('alice@enterprise.com');
      expect(response.Resources[0].name?.familyName).toBe('Smith');
      expect(response.Resources[0].active).toBe(true);
    });
  });

  describe('getUser', () => {
    it('returns single user resource in SCIM format', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const user = await service.getUser(orgId, userId);
      expect(user.id).toBe(userId);
      expect(user.userName).toBe('alice@enterprise.com');
    });

    it('throws SCIM 404 Error when user not found in organization', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getUser(orgId, 'missing-id')).rejects.toThrow(HttpException);

      try {
        await service.getUser(orgId, 'missing-id');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(err.getResponse().schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
      }
    });
  });

  describe('createUser', () => {
    it('provisions new user into organization and default workspace, emitting outbox event', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.user.create.mockResolvedValue(mockUser);

      const created = await service.createUser(orgId, {
        userName: 'alice@enterprise.com',
        name: { formatted: 'Alice Smith', givenName: 'Alice', familyName: 'Smith' },
        active: true,
      });

      expect(created.id).toBe(userId);
      expect(prisma.workspaceMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            workspaceId: 'ws-main',
            role: 'member',
          }),
        }),
      );
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'scim.user_provisioned',
        mockUser.id,
        expect.objectContaining({ email: 'alice@enterprise.com' }),
      );
    });

    it('throws SCIM 409 Conflict with scimType uniqueness if user already exists and active', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.createUser(orgId, {
          userName: 'alice@enterprise.com',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.createUser(orgId, { userName: 'alice@enterprise.com' });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
        expect(err.getResponse().scimType).toBe('uniqueness');
      }
    });
  });

  describe('deprovisionUser (RULE AUTH-001 & SOC 2 Immutability)', () => {
    it('soft-deactivates user, immediately destroys all sessions in Redis, and preserves contract history', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await service.deprovisionUser(orgId, userId);

      // 1. Verifies soft-deactivation (does NOT delete user)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: 'deactivated' },
      });

      // 2. RULE AUTH-001: Verifies immediate Redis session destruction
      expect(sessionService.destroyAllUserSessions).toHaveBeenCalledWith(userId);

      // 3. Verifies immutable audit log entry
      expect(prisma.auditLogEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'scim.user_deactivated',
            actorId: userId,
            resourceType: 'User',
            resourceId: userId,
          }),
        }),
      );

      // 4. Verifies outbox event emission
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'scim.user_deactivated',
        userId,
        expect.objectContaining({ userId, email: mockUser.email }),
      );
    });
  });

  describe('patchUser', () => {
    it('triggers deprovisioning flow when patch operation sets active = false', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'deactivated',
      });

      const res = await service.patchUser(orgId, userId, {
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

      expect(res.active).toBe(false);
      expect(sessionService.destroyAllUserSessions).toHaveBeenCalledWith(userId);
    });

    it('updates name when patch operation modifies name', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        name: 'Alice Johnson',
      });

      const res = await service.patchUser(orgId, userId, {
        Operations: [{ op: 'replace', path: 'name.formatted', value: 'Alice Johnson' }],
      });

      expect(res.name?.formatted).toBe('Alice Johnson');
    });
  });
});
