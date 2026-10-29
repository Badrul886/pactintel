import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { CreateWorkspaceDto, UpdateWorkspaceDto, WorkspaceRole } from '@pactintel/shared-types';

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkspace(organizationId: string, dto: CreateWorkspaceDto, creatorUserId?: string) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          id,
          organizationId,
          name: dto.name,
          slug: dto.slug.toLowerCase().trim(),
          parentWorkspaceId: dto.parentWorkspaceId || null,
          isSharedLibraryEnabled: dto.isSharedLibraryEnabled ?? false,
          brandingDefaults: dto.brandingDefaults ?? {},
        },
      });

      // Assign creator as admin in workspace_memberships if provided
      if (creatorUserId) {
        await tx.workspaceMembership.create({
          data: {
            id: generateId(),
            workspaceId: id,
            organizationId,
            userId: creatorUserId,
            role: 'admin',
            hasContentAdmin: true,
          },
        });
      }

      return workspace;
    });
  }

  async findWorkspaceById(id: string, organizationId?: string) {
    return this.prisma.workspace.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            memberships: true,
            documents: true,
          },
        },
      },
    });
  }

  async findWorkspaceBySlug(organizationId: string, slug: string) {
    return this.prisma.workspace.findFirst({
      where: {
        organizationId,
        slug: slug.toLowerCase().trim(),
        deletedAt: null,
      },
    });
  }

  async countActiveWorkspaces(organizationId: string): Promise<number> {
    return this.prisma.workspace.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
  }

  async listWorkspacesForOrg(
    organizationId: string,
    userId?: string,
    isOwnerOrAdmin: boolean = false,
  ) {
    if (isOwnerOrAdmin || !userId) {
      return this.prisma.workspace.findMany({
        where: {
          organizationId,
          deletedAt: null,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        include: {
          _count: {
            select: {
              memberships: true,
              documents: true,
            },
          },
        },
      });
    }

    // Scoped to workspaces where user has membership
    return this.prisma.workspace.findMany({
      where: {
        organizationId,
        deletedAt: null,
        memberships: {
          some: {
            userId,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: {
            memberships: true,
            documents: true,
          },
        },
      },
    });
  }

  async updateWorkspace(workspaceId: string, _organizationId: string, dto: UpdateWorkspaceDto) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.parentWorkspaceId !== undefined
          ? { parentWorkspaceId: dto.parentWorkspaceId }
          : {}),
        ...(dto.isSharedLibraryEnabled !== undefined
          ? { isSharedLibraryEnabled: dto.isSharedLibraryEnabled }
          : {}),
        ...(dto.brandingDefaults !== undefined ? { brandingDefaults: dto.brandingDefaults } : {}),
      },
    });
  }

  async softDeleteWorkspace(workspaceId: string, _organizationId: string) {
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // --- Workspace Memberships ---

  async findMembership(workspaceId: string, userId: string) {
    return this.prisma.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async listMembers(workspaceId: string, organizationId: string) {
    return this.prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMember(
    workspaceId: string,
    organizationId: string,
    userId: string,
    role: WorkspaceRole = 'member',
    hasContentAdmin: boolean = false,
  ) {
    const id = generateId();
    return this.prisma.workspaceMembership.create({
      data: {
        id,
        workspaceId,
        organizationId,
        userId,
        role,
        hasContentAdmin,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    hasContentAdmin?: boolean,
  ) {
    return this.prisma.workspaceMembership.update({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      data: {
        role,
        ...(hasContentAdmin !== undefined ? { hasContentAdmin } : {}),
      },
    });
  }

  async removeMember(workspaceId: string, userId: string) {
    return this.prisma.workspaceMembership.delete({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });
  }

  // --- Parent-Account Oversight & Analytics Rollup ---

  async getWorkspaceMetrics(workspaceId: string, organizationId: string) {
    const [
      totalDocuments,
      completedDocuments,
      pendingDocuments,
      membersCount,
      documentsWithValue,
      sharedTemplatesCount,
    ] = await Promise.all([
      this.prisma.document.count({
        where: { workspaceId, organizationId, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { workspaceId, organizationId, status: 'completed', deletedAt: null },
      }),
      this.prisma.document.count({
        where: {
          workspaceId,
          organizationId,
          status: { in: ['sent', 'viewed'] },
          deletedAt: null,
        },
      }),
      this.prisma.workspaceMembership.count({
        where: { workspaceId, organizationId },
      }),
      this.prisma.document.findMany({
        where: {
          workspaceId,
          organizationId,
          totalValue: { not: null },
          deletedAt: null,
        },
        select: {
          totalValue: true,
          currency: true,
        },
      }),
      this.prisma.template.count({
        where: {
          organizationId,
          visibility: 'organization',
          deletedAt: null,
        },
      }),
    ]);

    const totalDealValue = documentsWithValue.reduce(
      (acc, doc) => acc + (doc.totalValue ? Number(doc.totalValue) : 0),
      0,
    );

    const currency = documentsWithValue[0]?.currency || 'USD';

    return {
      totalDocuments,
      completedDocuments,
      pendingDocuments,
      totalDealValue,
      currency,
      totalMembers: membersCount,
      sharedAssetsCount: sharedTemplatesCount,
    };
  }
}
