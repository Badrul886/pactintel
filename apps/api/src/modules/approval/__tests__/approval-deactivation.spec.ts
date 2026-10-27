import { ApprovalService } from '../approval.service';
import { ApprovalRepository } from '../approval.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('Approval Deactivation Escalation Tests (RULE WF-001)', () => {
  let service: ApprovalService;
  let mockRepo: Partial<Record<keyof ApprovalRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const departingUserId = '0192a000-0000-7000-8000-000000000002';
  const fallbackApproverId = '0192a000-0000-7000-8000-000000000003';
  const adminUserId = '0192a000-0000-7000-8000-000000000004';
  const stepId = '0192a000-0000-7000-8000-000000000005';

  beforeEach(() => {
    mockRepo = {
      reassignStep: jest.fn().mockResolvedValue({ id: stepId }),
    };

    mockPrisma = {
      approvalStep: {
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    service = new ApprovalService(
      mockRepo as unknown as ApprovalRepository,
      mockPrisma as PrismaService,
    );
  });

  it('Test 1: user deactivated -> pending steps reallocated to active fallback_approver_id (WF-001)', async () => {
    mockPrisma.approvalStep.findMany.mockResolvedValue([
      {
        id: stepId,
        organizationId: orgId,
        approverId: departingUserId,
        fallbackApproverId,
        status: 'pending',
        fallbackApprover: {
          id: fallbackApproverId,
          status: 'active',
        },
        document: {
          id: 'doc-1',
          title: 'Master Service Agreement',
          workspaceId: 'ws-1',
        },
      },
    ]);

    const count = await service.deactivateUserEscalation(orgId, departingUserId);

    expect(count).toBe(1);
    expect(mockRepo.reassignStep).toHaveBeenCalledWith(stepId, orgId, fallbackApproverId);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('Test 2: fallback also inactive -> pending steps reallocated to organization administrator', async () => {
    mockPrisma.approvalStep.findMany.mockResolvedValue([
      {
        id: stepId,
        organizationId: orgId,
        approverId: departingUserId,
        fallbackApproverId,
        status: 'pending',
        fallbackApprover: {
          id: fallbackApproverId,
          status: 'inactive', // Fallback is inactive!
        },
        document: {
          id: 'doc-1',
          title: 'Master Service Agreement',
          workspaceId: 'ws-1',
        },
      },
    ]);

    mockPrisma.user.findFirst.mockResolvedValue({
      id: adminUserId,
      role: 'admin',
      status: 'active',
    });

    const count = await service.deactivateUserEscalation(orgId, departingUserId);

    expect(count).toBe(1);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: orgId,
        role: { in: ['admin', 'owner'] },
        status: 'active',
      },
      select: { id: true },
    });
    expect(mockRepo.reassignStep).toHaveBeenCalledWith(stepId, orgId, adminUserId);
  });
});
