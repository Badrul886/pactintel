import {
  Injectable,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { WorkspaceRepository } from './workspace.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddWorkspaceMemberDto,
  UpdateWorkspaceMemberDto,
  UserRole,
  WorkspaceOverviewResponse,
} from '@pactintel/shared-types';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  // Subscription plan limits on workspaces (Blueprint §7, Product Blueprint §5.16)
  private readonly PLAN_WORKSPACE_LIMITS: Record<string, number> = {
    starter: 1,
    professional: 3,
    business: 10,
    enterprise: 100, // Effectively unbounded
  };

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly prisma: PrismaService,
    private readonly outbox: DocumentOutboxService,
  ) {}

  /**
   * Creates a new workspace with slug uniqueness validation and plan quota enforcement.
   */
  async createWorkspace(organizationId: string, dto: CreateWorkspaceDto, creatorUserId?: string) {
    // 1. Enforce subscription tier workspace limit
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    const planTier = (subscription?.planTier?.toLowerCase() || 'starter') as string;
    const maxAllowed = this.PLAN_WORKSPACE_LIMITS[planTier] || 1;
    const currentCount = await this.workspaceRepo.countActiveWorkspaces(organizationId);

    if (currentCount >= maxAllowed) {
      throw new HttpException(
        {
          code: 'PLAN_LIMIT_EXCEEDED',
          message: `Workspace limit (${maxAllowed}) reached for plan tier ${planTier}. Please upgrade your subscription to create additional workspaces.`,
          details: { currentCount, maxAllowed, planTier },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Validate slug uniqueness within organization
    const existing = await this.workspaceRepo.findWorkspaceBySlug(organizationId, dto.slug);
    if (existing) {
      throw new ConflictException({
        code: 'SLUG_ALREADY_EXISTS',
        message: `Workspace slug '${dto.slug}' already exists in this organization.`,
      });
    }

    // 3. Create workspace and assign creator
    const workspace = await this.workspaceRepo.createWorkspace(organizationId, dto, creatorUserId);

    // 4. Emit transactional outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.created', workspace.id, {
        workspaceId: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdBy: creatorUserId,
      });
    });

    this.logger.log(
      `Created workspace ${workspace.id} (${workspace.slug}) for org ${organizationId}`,
    );
    return workspace;
  }

  /**
   * Lists workspaces for an organization.
   * Organization Owner/Admin sees all workspaces (parent-account oversight).
   * Managers and members see only workspaces they belong to.
   */
  async listWorkspaces(organizationId: string, userId?: string, userRole?: UserRole) {
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    return this.workspaceRepo.listWorkspacesForOrg(organizationId, userId, isOwnerOrAdmin);
  }

  /**
   * Retrieves single workspace details.
   */
  async getWorkspaceById(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    const workspace = await this.workspaceRepo.findWorkspaceById(workspaceId, organizationId);
    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace not found.',
      });
    }

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    if (!isOwnerOrAdmin && userId) {
      const membership = await this.workspaceRepo.findMembership(workspaceId, userId);
      if (!membership) {
        throw new ForbiddenException({
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'You are not a member of this workspace.',
        });
      }
    }

    return workspace;
  }

  /**
   * Updates workspace configuration, branding defaults, or shared library toggle.
   */
  async updateWorkspace(
    workspaceId: string,
    organizationId: string,
    dto: UpdateWorkspaceDto,
    userId?: string,
    userRole?: UserRole,
  ) {
    await this.assertWorkspaceAdminAccess(workspaceId, organizationId, userId, userRole);

    const updated = await this.workspaceRepo.updateWorkspace(workspaceId, organizationId, dto);

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.updated', workspaceId, {
        workspaceId,
        updatedFields: Object.keys(dto),
      });
    });

    return updated;
  }

  /**
   * Soft-deletes a workspace. Default workspace cannot be deleted.
   */
  async deleteWorkspace(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    const workspace = await this.workspaceRepo.findWorkspaceById(workspaceId, organizationId);
    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace not found.',
      });
    }

    if (workspace.isDefault) {
      throw new HttpException(
        {
          code: 'CANNOT_DELETE_DEFAULT_WORKSPACE',
          message: 'The default organization workspace cannot be deleted.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.assertWorkspaceAdminAccess(workspaceId, organizationId, userId, userRole);

    const deleted = await this.workspaceRepo.softDeleteWorkspace(workspaceId, organizationId);

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.deleted', workspaceId, {
        workspaceId,
      });
    });

    return deleted;
  }

  // --- Member Management ---

  async listMembers(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    await this.assertWorkspaceAccess(workspaceId, organizationId, userId, userRole);
    return this.workspaceRepo.listMembers(workspaceId, organizationId);
  }

  async addMember(
    workspaceId: string,
    organizationId: string,
    dto: AddWorkspaceMemberDto,
    requesterUserId?: string,
    requesterUserRole?: UserRole,
  ) {
    await this.assertWorkspaceAdminAccess(
      workspaceId,
      organizationId,
      requesterUserId,
      requesterUserRole,
    );

    // Verify user belongs to the same organization
    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId },
    });
    if (!targetUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User does not belong to this organization.',
      });
    }

    // Check if membership already exists
    const existing = await this.workspaceRepo.findMembership(workspaceId, dto.userId);
    if (existing) {
      throw new ConflictException({
        code: 'MEMBERSHIP_ALREADY_EXISTS',
        message: 'User is already a member of this workspace.',
      });
    }

    const membership = await this.workspaceRepo.addMember(
      workspaceId,
      organizationId,
      dto.userId,
      dto.role,
      dto.hasContentAdmin,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.member_added', workspaceId, {
        workspaceId,
        userId: dto.userId,
        role: dto.role,
      });
    });

    return membership;
  }

  async updateMemberRole(
    workspaceId: string,
    organizationId: string,
    userId: string,
    dto: UpdateWorkspaceMemberDto,
    requesterUserId?: string,
    requesterUserRole?: UserRole,
  ) {
    await this.assertWorkspaceAdminAccess(
      workspaceId,
      organizationId,
      requesterUserId,
      requesterUserRole,
    );

    const existing = await this.workspaceRepo.findMembership(workspaceId, userId);
    if (!existing) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Workspace membership not found.',
      });
    }

    const updated = await this.workspaceRepo.updateMemberRole(
      workspaceId,
      userId,
      dto.role,
      dto.hasContentAdmin,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.member_updated', workspaceId, {
        workspaceId,
        userId,
        newRole: dto.role,
      });
    });

    return updated;
  }

  async removeMember(
    workspaceId: string,
    organizationId: string,
    userId: string,
    requesterUserId?: string,
    requesterUserRole?: UserRole,
  ) {
    await this.assertWorkspaceAdminAccess(
      workspaceId,
      organizationId,
      requesterUserId,
      requesterUserRole,
    );

    const existing = await this.workspaceRepo.findMembership(workspaceId, userId);
    if (!existing) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Workspace membership not found.',
      });
    }

    await this.workspaceRepo.removeMember(workspaceId, userId);

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'workspace.member_removed', workspaceId, {
        workspaceId,
        userId,
      });
    });

    return { success: true };
  }

  // --- Parent-Account Oversight & Cross-Workspace Analytics ---

  /**
   * Retrieves roll-up metrics for a specific workspace.
   * Account Owner and Admin have global access.
   */
  async getWorkspaceOverview(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ): Promise<WorkspaceOverviewResponse> {
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    if (!isOwnerOrAdmin && userId) {
      const membership = await this.workspaceRepo.findMembership(workspaceId, userId);
      if (!membership || (membership.role !== 'admin' && membership.role !== 'manager')) {
        throw new ForbiddenException({
          code: 'OVERVIEW_ACCESS_DENIED',
          message:
            'Only organization owners, admins, and workspace managers may view workspace analytics.',
        });
      }
    }

    const workspace = await this.workspaceRepo.findWorkspaceById(workspaceId, organizationId);
    if (!workspace) {
      throw new NotFoundException({
        code: 'WORKSPACE_NOT_FOUND',
        message: 'Workspace not found.',
      });
    }

    const metrics = await this.workspaceRepo.getWorkspaceMetrics(workspaceId, organizationId);

    return {
      workspace: {
        id: workspace.id,
        organizationId: workspace.organizationId,
        name: workspace.name,
        slug: workspace.slug,
        isDefault: workspace.isDefault,
        parentWorkspaceId: workspace.parentWorkspaceId,
        isSharedLibraryEnabled: workspace.isSharedLibraryEnabled,
        brandingDefaults: workspace.brandingDefaults as Record<string, any>,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        memberCount: workspace._count?.memberships || 0,
        documentCount: workspace._count?.documents || 0,
      },
      metrics,
    };
  }

  /**
   * RULE AUTH-003: Validates that the active workspace belongs to the organization context.
   */
  async validateWorkspaceBelongsToOrg(
    workspaceId: string,
    organizationId: string,
  ): Promise<boolean> {
    const ws = await this.workspaceRepo.findWorkspaceById(workspaceId, organizationId);
    if (!ws) {
      throw new ForbiddenException({
        code: 'WORKSPACE_FORBIDDEN',
        message: 'Active workspace does not belong to the authenticated organization.',
      });
    }
    return true;
  }

  // --- Helper Guard Assertions ---

  private async assertWorkspaceAccess(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    await this.validateWorkspaceBelongsToOrg(workspaceId, organizationId);

    if (userRole === 'owner' || userRole === 'admin') return;

    if (!userId) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_WORKSPACE_ACCESS',
        message: 'Authentication required for workspace access.',
      });
    }

    const membership = await this.workspaceRepo.findMembership(workspaceId, userId);
    if (!membership) {
      throw new ForbiddenException({
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'User is not a member of this workspace.',
      });
    }
  }

  private async assertWorkspaceAdminAccess(
    workspaceId: string,
    organizationId: string,
    userId?: string,
    userRole?: UserRole,
  ) {
    await this.validateWorkspaceBelongsToOrg(workspaceId, organizationId);

    if (userRole === 'owner' || userRole === 'admin') return;

    if (!userId) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED_WORKSPACE_ACCESS',
        message: 'Authentication required for workspace administration.',
      });
    }

    const membership = await this.workspaceRepo.findMembership(workspaceId, userId);
    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException({
        code: 'WORKSPACE_ADMIN_REQUIRED',
        message: 'Workspace admin or organization owner role required.',
      });
    }
  }
}
