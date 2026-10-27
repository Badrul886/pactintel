import { ApprovalService } from '../approval.service';
import { ApprovalRepository } from '../approval.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('Approval Timeout Escalation Tests (JOB-001 & Invariant I-07)', () => {
  let service: ApprovalService;
  let mockRepo: Partial<Record<keyof ApprovalRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const approverId = '0192a000-0000-7000-8000-000000000002';
  const fallbackId = '0192a000-0000-7000-8000-000000000003';
  const adminId = '0192a000-0000-7000-8000-000000000004';
  const stalledStepId = '0192a000-0000-7000-8000-000000000005';
  const recentStepId = '0192a000-0000-7000-8000-000000000006';

  beforeEach(() => {
    mockRepo = {
      findStalledSteps: jest.fn(),
      reassignStep: jest.fn().mockResolvedValue({ id: stalledStepId }),
    };

    mockPrisma = {
      user: {
        findFirst: jest.fn(),
      },
    };

    service = new ApprovalService(
      mockRepo as unknown as ApprovalRepository,
      mockPrisma as PrismaService,
    );
  });

  it('Test 1: step pending >168 hours -> timeout escalated to fallback approver (JOB-001)', async () => {
    // 170 hours ago
    const olderThan168h = new Date(Date.now() - 170 * 3600 * 1000).toISOString();

    mockRepo.findStalledSteps!.mockResolvedValue([
      {
        id: stalledStepId,
        organizationId: orgId,
        approverId,
        fallbackApproverId: fallbackId,
        timeoutHours: 168,
        createdAt: olderThan168h,
      },
    ]);

    const count = await service.checkApprovalTimeouts();

    expect(count).toBe(1);
    expect(mockRepo.reassignStep).toHaveBeenCalledWith(stalledStepId, orgId, fallbackId);
  });

  it('Test 2: step pending >168 hours without fallback -> escalated to admin (JOB-001)', async () => {
    const olderThan168h = new Date(Date.now() - 170 * 3600 * 1000).toISOString();

    mockRepo.findStalledSteps!.mockResolvedValue([
      {
        id: stalledStepId,
        organizationId: orgId,
        approverId,
        fallbackApproverId: null, // No fallback configured
        timeoutHours: 168,
        createdAt: olderThan168h,
      },
    ]);

    mockPrisma.user.findFirst.mockResolvedValue({
      id: adminId,
      role: 'admin',
      status: 'active',
    });

    const count = await service.checkApprovalTimeouts();

    expect(count).toBe(1);
    expect(mockRepo.reassignStep).toHaveBeenCalledWith(stalledStepId, orgId, adminId);
  });

  it('Test 3: step pending <168 hours -> not escalated', async () => {
    // 24 hours ago
    const recentTime = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    mockRepo.findStalledSteps!.mockResolvedValue([
      {
        id: recentStepId,
        organizationId: orgId,
        approverId,
        fallbackApproverId: fallbackId,
        timeoutHours: 168,
        createdAt: recentTime,
      },
    ]);

    const count = await service.checkApprovalTimeouts();

    expect(count).toBe(0);
    expect(mockRepo.reassignStep).not.toHaveBeenCalled();
  });
});
