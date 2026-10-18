import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, buildCursorPage, decodeCursor } from '@pactintel/shared-utils';
import { CreateOrganizationDto, InviteUserDto, UserRole, SeatType } from '@pactintel/shared-types';

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(dto: CreateOrganizationDto) {
    const orgId = generateId();
    const workspaceId = generateId();

    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          id: orgId,
          name: dto.name,
          slug: dto.slug,
          cellId: process.env.CELL_ID || 'gcp-us1',
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          organizationId: orgId,
          name: 'General',
          slug: 'general',
          isDefault: true,
        },
      });

      // Default Free plan subscription initialized
      await tx.subscription.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          planTier: 'free',
          status: 'active',
          fullSeatLimit: 1,
          fullSeatCount: 1,
          collabSeatLimit: 0,
          collabSeatCount: 0,
          documentLimit: 5,
        },
      });

      return { org, workspace };
    });
  }

  async findById(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
      include: { workspaces: true, subscription: true },
    });
  }

  async updateOrganization(id: string, data: { name?: string; slug?: string }) {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async listUsers(organizationId: string, cursor?: string, limit = 20) {
    const decoded = decodeCursor(cursor);
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });

    return buildCursorPage(users, limit);
  }

  async createUserInvite(organizationId: string, dto: InviteUserDto) {
    const userId = generateId();
    return this.prisma.user.create({
      data: {
        id: userId,
        organizationId,
        email: dto.email,
        role: dto.role,
        seatType: dto.seatType,
        status: 'pending',
      },
    });
  }

  async countActiveAndPendingSeats(organizationId: string, seatType: string) {
    return this.prisma.user.count({
      where: {
        organizationId,
        seatType,
        status: { in: ['pending', 'active'] },
        deletedAt: null,
      },
    });
  }

  async updateUser(
    organizationId: string,
    userId: string,
    data: { role?: UserRole; seatType?: SeatType; status?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId, organizationId },
      data,
    });
  }

  async deactivateUser(organizationId: string, userId: string) {
    return this.prisma.user.update({
      where: { id: userId, organizationId },
      data: {
        status: 'deactivated',
        deletedAt: new Date(),
      },
    });
  }

  async listWorkspaces(organizationId: string) {
    return this.prisma.workspace.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createWorkspace(organizationId: string, name: string, slug: string) {
    return this.prisma.workspace.create({
      data: {
        id: generateId(),
        organizationId,
        name,
        slug,
      },
    });
  }
}
