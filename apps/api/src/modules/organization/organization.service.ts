import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto, InviteUserDto, UserRole, SeatType } from '@pactintel/shared-types';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly orgRepo: OrganizationRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createOrganization(dto: CreateOrganizationDto) {
    return this.orgRepo.createOrganization(dto);
  }

  async getOrganization(id: string) {
    return this.orgRepo.findById(id);
  }

  async updateOrganization(id: string, data: { name?: string; slug?: string }) {
    return this.orgRepo.updateOrganization(id, data);
  }

  async listUsers(organizationId: string, cursor?: string, limit?: number) {
    return this.orgRepo.listUsers(organizationId, cursor, limit);
  }

  /**
   * Invites a user to the organization.
   * Enforces strict seat counting: status IN ('pending', 'active') counts toward quota (RULE BILL-001).
   */
  async inviteUser(organizationId: string, dto: InviteUserDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!subscription) {
      throw new HttpException(
        { code: 'SUBSCRIPTION_NOT_FOUND', message: 'No active subscription found for tenant.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const currentSeats = await this.orgRepo.countActiveAndPendingSeats(
      organizationId,
      dto.seatType,
    );

    const seatLimit =
      dto.seatType === 'full' ? subscription.fullSeatLimit : subscription.collabSeatLimit;

    if (currentSeats >= seatLimit) {
      // RULE BILL-001: 402 SEAT_LIMIT_REACHED
      throw new HttpException(
        {
          code: 'SEAT_LIMIT_REACHED',
          message: `The ${dto.seatType} seat limit (${seatLimit}) has been reached. Please upgrade your plan or purchase additional seats.`,
          details: { currentSeats, seatLimit, seatType: dto.seatType },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const user = await this.orgRepo.createUserInvite(organizationId, dto);

    // Increment cached seat count immediately (RULE BILL-001)
    await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        fullSeatCount: dto.seatType === 'full' ? { increment: 1 } : undefined,
        collabSeatCount: dto.seatType === 'collab' ? { increment: 1 } : undefined,
      },
    });

    return user;
  }

  async updateUser(
    organizationId: string,
    userId: string,
    data: { role?: UserRole; seatType?: SeatType; status?: string },
  ) {
    return this.orgRepo.updateUser(organizationId, userId, data);
  }

  async deactivateUser(organizationId: string, userId: string) {
    const user = await this.orgRepo.deactivateUser(organizationId, userId);

    // Decrement cached seat count immediately (RULE BILL-001)
    await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        fullSeatCount: user.seatType === 'full' ? { decrement: 1 } : undefined,
        collabSeatCount: user.seatType === 'collab' ? { decrement: 1 } : undefined,
      },
    });

    return user;
  }

  async listWorkspaces(organizationId: string) {
    return this.orgRepo.listWorkspaces(organizationId);
  }

  async createWorkspace(organizationId: string, name: string, slug: string) {
    return this.orgRepo.createWorkspace(organizationId, name, slug);
  }
}
