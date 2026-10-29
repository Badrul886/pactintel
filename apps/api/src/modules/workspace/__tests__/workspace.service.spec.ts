import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from '../workspace.service';
import { WorkspaceRepository } from '../workspace.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentOutboxService } from '../../document/outbox/document-outbox.service';
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

describe('WorkspaceService (Sprint 3.8 — Multi-Workspace & Parent-Account Oversight)', () => {
  let service: WorkspaceService;
  let repo: jest.Mocked<WorkspaceRepository>;
  let prisma: any;
  let outbox: jest.Mocked<DocumentOutboxService>;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const userId = '0192a000-0000-7000-8000-000000000002';
  const otherUserId = '0192a000-0000-7000-8000-000000000003';
  const workspaceId = '0192a000-0000-7000-8000-000000000010';

  const mockWorkspace = {
    id: workspaceId,
    organizationId: orgId,
    name: 'North America Enterprise',
    slug: 'na-enterprise',
    isDefault: false,
    parentWorkspaceId: null,
    isSharedLibraryEnabled: true,
    brandingDefaults: { primaryColor: '#2563EB' },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    _count: {
      memberships: 5,
      documents: 12,
    },
  };

  beforeEach(async () => {
    const mockRepo = {
      countActiveWorkspaces: jest.fn(),
      findWorkspaceBySlug: jest.fn(),
      createWorkspace: jest.fn(),
      findWorkspaceById: jest.fn(),
      listWorkspacesForOrg: jest.fn(),
      updateWorkspace: jest.fn(),
      softDeleteWorkspace: jest.fn(),
      findMembership: jest.fn(),
      listMembers: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      getWorkspaceMetrics: jest.fn(),
    };

    const mockPrisma: any = {
      subscription: {
        findUnique: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: any) => any) => callback(mockPrisma)),
    };

    const mockOutbox = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: WorkspaceRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentOutboxService, useValue: mockOutbox },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
    repo = module.get(WorkspaceRepository);
    prisma = module.get(PrismaService);
    outbox = module.get(DocumentOutboxService);
  });

  describe('createWorkspace (Plan Quotas & Invariant I-06)', () => {
    it('enforces starter plan limit of 1 workspace', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ planTier: 'starter' });
      repo.countActiveWorkspaces.mockResolvedValue(1);

      await expect(
        service.createWorkspace(orgId, {
          name: 'Second WS',
          slug: 'second-ws',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.createWorkspace(orgId, {
          name: 'Second WS',
          slug: 'second-ws',
        });
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect(err.getResponse().code).toBe('PLAN_LIMIT_EXCEEDED');
      }
    });

    it('allows creation up to plan tier limits (professional = 3, business = 10, enterprise = 100)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ planTier: 'professional' });
      repo.countActiveWorkspaces.mockResolvedValue(2);
      repo.findWorkspaceBySlug.mockResolvedValue(null);
      repo.createWorkspace.mockResolvedValue(mockWorkspace as any);

      const created = await service.createWorkspace(
        orgId,
        { name: 'Third WS', slug: 'third-ws' },
        userId,
      );

      expect(created).toBeDefined();
      expect(repo.createWorkspace).toHaveBeenCalledWith(
        orgId,
        { name: 'Third WS', slug: 'third-ws' },
        userId,
      );
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.created',
        mockWorkspace.id,
        expect.objectContaining({ slug: mockWorkspace.slug }),
      );
    });

    it('rejects duplicate slug within organization with 409 Conflict', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ planTier: 'enterprise' });
      repo.countActiveWorkspaces.mockResolvedValue(2);
      repo.findWorkspaceBySlug.mockResolvedValue(mockWorkspace as any);

      await expect(
        service.createWorkspace(orgId, {
          name: 'Duplicate Slug',
          slug: mockWorkspace.slug,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listWorkspaces (Parent-Account Oversight)', () => {
    it('allows organization owner/admin to view all workspaces', async () => {
      repo.listWorkspacesForOrg.mockResolvedValue([mockWorkspace as any]);

      const result = await service.listWorkspaces(orgId, userId, 'owner');
      expect(result).toHaveLength(1);
      expect(repo.listWorkspacesForOrg).toHaveBeenCalledWith(orgId, userId, true);
    });

    it('restricts standard member to only workspaces they belong to', async () => {
      repo.listWorkspacesForOrg.mockResolvedValue([mockWorkspace as any]);

      const result = await service.listWorkspaces(orgId, userId, 'member');
      expect(result).toHaveLength(1);
      expect(repo.listWorkspacesForOrg).toHaveBeenCalledWith(orgId, userId, false);
    });
  });

  describe('getWorkspaceById', () => {
    it('returns workspace for org owner regardless of membership', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);

      const result = await service.getWorkspaceById(workspaceId, orgId, userId, 'owner');
      expect(result.id).toBe(workspaceId);
      expect(repo.findMembership).not.toHaveBeenCalled();
    });

    it('returns workspace for member when membership exists', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue({
        id: 'mem-1',
        workspaceId,
        userId,
        role: 'member',
      } as any);

      const result = await service.getWorkspaceById(workspaceId, orgId, userId, 'member');
      expect(result.id).toBe(workspaceId);
    });

    it('throws 403 when user is not a member of the workspace', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue(null);

      await expect(service.getWorkspaceById(workspaceId, orgId, userId, 'member')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 404 when workspace not found', async () => {
      repo.findWorkspaceById.mockResolvedValue(null);

      await expect(
        service.getWorkspaceById('non-existent', orgId, userId, 'owner'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateWorkspace', () => {
    it('allows workspace admin to update workspace branding and shared library toggle', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue({
        id: 'mem-1',
        workspaceId,
        userId,
        role: 'admin',
      } as any);
      repo.updateWorkspace.mockResolvedValue({
        ...mockWorkspace,
        isSharedLibraryEnabled: false,
      } as any);

      const updated = await service.updateWorkspace(
        workspaceId,
        orgId,
        { isSharedLibraryEnabled: false },
        userId,
        'manager',
      );

      expect(updated.isSharedLibraryEnabled).toBe(false);
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.updated',
        workspaceId,
        expect.objectContaining({ updatedFields: ['isSharedLibraryEnabled'] }),
      );
    });

    it('rejects update if user is not workspace admin', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue({
        id: 'mem-1',
        workspaceId,
        userId,
        role: 'member',
      } as any);

      await expect(
        service.updateWorkspace(workspaceId, orgId, { name: 'New Name' }, userId, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteWorkspace', () => {
    it('blocks deletion of the default workspace with 400 Bad Request', async () => {
      repo.findWorkspaceById.mockResolvedValue({
        ...mockWorkspace,
        isDefault: true,
      } as any);

      await expect(service.deleteWorkspace(workspaceId, orgId, userId, 'owner')).rejects.toThrow(
        HttpException,
      );
    });

    it('soft-deletes non-default workspace and emits outbox event', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.softDeleteWorkspace.mockResolvedValue({
        ...mockWorkspace,
        deletedAt: new Date(),
      } as any);

      const deleted = await service.deleteWorkspace(workspaceId, orgId, userId, 'owner');
      expect(deleted.deletedAt).toBeDefined();
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.deleted',
        workspaceId,
        expect.objectContaining({ workspaceId }),
      );
    });
  });

  describe('member management', () => {
    it('adds member if user belongs to same org', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      prisma.user.findFirst.mockResolvedValue({ id: otherUserId, organizationId: orgId });
      repo.findMembership.mockResolvedValue(null);
      repo.addMember.mockResolvedValue({
        id: 'mem-2',
        workspaceId,
        userId: otherUserId,
        role: 'member',
      } as any);

      const mem = await service.addMember(
        workspaceId,
        orgId,
        { userId: otherUserId, role: 'member' },
        userId,
        'owner',
      );

      expect(mem.userId).toBe(otherUserId);
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.member_added',
        workspaceId,
        expect.objectContaining({ userId: otherUserId, role: 'member' }),
      );
    });

    it('rejects adding member from outside the organization with 404', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.addMember(
          workspaceId,
          orgId,
          { userId: otherUserId, role: 'member' },
          userId,
          'owner',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate membership with 409 Conflict', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      prisma.user.findFirst.mockResolvedValue({ id: otherUserId, organizationId: orgId });
      repo.findMembership.mockResolvedValue({ id: 'existing-mem' } as any);

      await expect(
        service.addMember(
          workspaceId,
          orgId,
          { userId: otherUserId, role: 'member' },
          userId,
          'owner',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('updates member role and emits outbox event', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue({ id: 'mem-2', role: 'member' } as any);
      repo.updateMemberRole.mockResolvedValue({ id: 'mem-2', role: 'manager' } as any);

      const updated = await service.updateMemberRole(
        workspaceId,
        orgId,
        otherUserId,
        { role: 'manager' },
        userId,
        'owner',
      );

      expect(updated.role).toBe('manager');
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.member_updated',
        workspaceId,
        expect.objectContaining({ newRole: 'manager' }),
      );
    });

    it('removes member and emits outbox event', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.findMembership.mockResolvedValue({ id: 'mem-2' } as any);
      repo.removeMember.mockResolvedValue({} as any);

      const result = await service.removeMember(workspaceId, orgId, otherUserId, userId, 'owner');

      expect(result.success).toBe(true);
      expect(outbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgId,
        'workspace.member_removed',
        workspaceId,
        expect.objectContaining({ userId: otherUserId }),
      );
    });
  });

  describe('getWorkspaceOverview (Cross-Workspace Roll-up Metrics)', () => {
    it('aggregates metrics for account owner', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      repo.getWorkspaceMetrics.mockResolvedValue({
        totalDocuments: 12,
        completedDocuments: 8,
        pendingDocuments: 4,
        totalDealValue: 50000,
        currency: 'USD',
        totalMembers: 5,
        sharedAssetsCount: 14,
      });

      const overview = await service.getWorkspaceOverview(workspaceId, orgId, userId, 'owner');

      expect(overview.workspace.id).toBe(workspaceId);
      expect(overview.metrics.totalDealValue).toBe(50000);
      expect(overview.metrics.completedDocuments).toBe(8);
      expect(overview.metrics.sharedAssetsCount).toBe(14);
    });

    it('rejects regular workspace member from viewing overview analytics', async () => {
      repo.findMembership.mockResolvedValue({
        id: 'mem-1',
        workspaceId,
        userId,
        role: 'member',
      } as any);

      await expect(
        service.getWorkspaceOverview(workspaceId, orgId, userId, 'member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('RULE AUTH-003: validateWorkspaceBelongsToOrg', () => {
    it('returns true if workspace belongs to authenticated organization', async () => {
      repo.findWorkspaceById.mockResolvedValue(mockWorkspace as any);
      const valid = await service.validateWorkspaceBelongsToOrg(workspaceId, orgId);
      expect(valid).toBe(true);
    });

    it('throws 403 WORKSPACE_FORBIDDEN if workspace does not belong to organization', async () => {
      repo.findWorkspaceById.mockResolvedValue(null);
      await expect(
        service.validateWorkspaceBelongsToOrg(workspaceId, 'different-org-id'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
