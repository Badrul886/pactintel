import { OrganizationService } from '../../src/modules/organization/organization.service';
import { OrganizationRepository } from '../../src/modules/organization/organization.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RULE BILL-001 / BILL-005: Strict Seat Counting and Limits', () => {
  let orgService: OrganizationService;
  let mockOrgRepo: Partial<OrganizationRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';

  beforeEach(() => {
    mockOrgRepo = {
      countActiveAndPendingSeats: jest.fn(),
      createUserInvite: jest.fn(),
      deactivateUser: jest.fn(),
    };

    mockPrisma = {
      subscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    orgService = new OrganizationService(
      mockOrgRepo as OrganizationRepository,
      mockPrisma as PrismaService,
    );
  });

  it('rejects invite with 402 SEAT_LIMIT_REACHED when full seat quota is reached', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      organizationId: orgId,
      fullSeatLimit: 3,
      fullSeatCount: 3,
      collabSeatLimit: 5,
    });

    (mockOrgRepo.countActiveAndPendingSeats as jest.Mock).mockResolvedValue(3);

    await expect(
      orgService.inviteUser(orgId, {
        email: 'newuser@example.com',
        role: 'member',
        seatType: 'full',
      }),
    ).rejects.toThrow(
      new HttpException(
        {
          code: 'SEAT_LIMIT_REACHED',
          message:
            'The full seat limit (3) has been reached. Please upgrade your plan or purchase additional seats.',
          details: { currentSeats: 3, seatLimit: 3, seatType: 'full' },
        },
        HttpStatus.PAYMENT_REQUIRED,
      ),
    );

    expect(mockOrgRepo.createUserInvite).not.toHaveBeenCalled();
    expect(mockPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it('provisions invite and immediately increments fullSeatCount when within limits', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      organizationId: orgId,
      fullSeatLimit: 5,
      fullSeatCount: 2,
      collabSeatLimit: 5,
    });

    (mockOrgRepo.countActiveAndPendingSeats as jest.Mock).mockResolvedValue(2);
    (mockOrgRepo.createUserInvite as jest.Mock).mockResolvedValue({
      id: 'user-new',
      email: 'newuser@example.com',
      status: 'pending',
      seatType: 'full',
    });

    const user = await orgService.inviteUser(orgId, {
      email: 'newuser@example.com',
      role: 'member',
      seatType: 'full',
    });

    expect(user.status).toBe('pending');
    expect(mockOrgRepo.createUserInvite).toHaveBeenCalled();
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { organizationId: orgId },
      data: {
        fullSeatCount: { increment: 1 },
        collabSeatCount: undefined,
      },
    });
  });

  it('deactivates user and immediately decrements fullSeatCount', async () => {
    (mockOrgRepo.deactivateUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      seatType: 'full',
      status: 'deactivated',
    });

    await orgService.deactivateUser(orgId, 'user-1');

    expect(mockOrgRepo.deactivateUser).toHaveBeenCalledWith(orgId, 'user-1');
    expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
      where: { organizationId: orgId },
      data: {
        fullSeatCount: { decrement: 1 },
        collabSeatCount: undefined,
      },
    });
  });
});
