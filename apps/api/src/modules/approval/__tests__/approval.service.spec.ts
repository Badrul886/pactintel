import { ApprovalService } from '../approval.service';
import { ApprovalRepository } from '../approval.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ApprovalStepDto, ApprovalChainDto } from '@pactintel/shared-types';

describe('ApprovalService Unit Tests (Rules WF-001..003 & Sprint 2.4)', () => {
  let service: ApprovalService;
  let mockRepo: Partial<Record<keyof ApprovalRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const approver1Id = '0192a000-0000-7000-8000-000000000002';
  const approver2Id = '0192a000-0000-7000-8000-000000000003';
  const nonApproverId = '0192a000-0000-7000-8000-000000000004';
  const documentId = '0192a000-0000-7000-8000-000000000005';
  const chainId = '0192a000-0000-7000-8000-000000000006';
  const step1Id = '0192a000-0000-7000-8000-000000000007';
  const step2Id = '0192a000-0000-7000-8000-000000000008';

  beforeEach(() => {
    mockRepo = {
      findStepById: jest.fn(),
      decideStep: jest.fn(),
      activateNextStep: jest.fn(),
      voidRemainingSteps: jest.fn(),
      listChains: jest.fn(),
      createDocumentApprovalSteps: jest.fn(),
    };

    mockPrisma = {
      document: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    };

    service = new ApprovalService(
      mockRepo as unknown as ApprovalRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('submitDecision', () => {
    it('Test 1: sequential promotion: step 1 approved -> step 2 promoted to pending', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: step1Id,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId: approver1Id,
        status: 'pending',
      } as ApprovalStepDto);

      mockRepo.decideStep!.mockResolvedValue({
        id: step1Id,
        status: 'approved',
        stepOrder: 1,
        decidedAt: new Date().toISOString(),
      } as ApprovalStepDto);

      mockRepo.activateNextStep!.mockResolvedValue({
        id: step2Id,
        status: 'pending',
        stepOrder: 2,
        approverId: approver2Id,
      } as ApprovalStepDto);

      const result = await service.submitDecision(orgId, approver1Id, 'member', step1Id, {
        decision: 'approved',
        comment: 'Looks good',
      });

      expect(mockRepo.decideStep).toHaveBeenCalledWith(
        step1Id,
        orgId,
        'approved',
        'Looks good',
        approver1Id,
      );
      expect(mockRepo.activateNextStep).toHaveBeenCalledWith(documentId, 2);
      expect(mockPrisma.document.update).not.toHaveBeenCalled(); // Not completed yet
      expect(result.status).toBe('approved');
    });

    it('Test 2: rejection voids chain: step 1 rejected -> document not approved, subsequent steps skipped', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: step1Id,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId: approver1Id,
        status: 'pending',
      } as ApprovalStepDto);

      mockRepo.decideStep!.mockResolvedValue({
        id: step1Id,
        status: 'rejected',
        stepOrder: 1,
        decidedAt: new Date().toISOString(),
      } as ApprovalStepDto);

      const result = await service.submitDecision(orgId, approver1Id, 'member', step1Id, {
        decision: 'rejected',
        comment: 'Budget exceeds cap',
      });

      expect(mockRepo.voidRemainingSteps).toHaveBeenCalledWith(documentId, 1);
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { status: 'approval_rejected' },
      });
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'approval.chain.rejected',
            aggregateId: documentId,
          }),
        }),
      );
      expect(result.status).toBe('rejected');
    });

    it('Test 3: complete cascade: all steps approved -> document approved', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: step2Id,
        organizationId: orgId,
        documentId,
        stepOrder: 2,
        approverId: approver2Id,
        status: 'pending',
      } as ApprovalStepDto);

      mockRepo.decideStep!.mockResolvedValue({
        id: step2Id,
        status: 'approved',
        stepOrder: 2,
        decidedAt: new Date().toISOString(),
      } as ApprovalStepDto);

      // No next step (step 2 is final)
      mockRepo.activateNextStep!.mockResolvedValue(null);

      const result = await service.submitDecision(orgId, approver2Id, 'member', step2Id, {
        decision: 'approved',
      });

      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: { status: 'approval_complete' },
      });
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'approval.chain.approved',
            aggregateId: documentId,
          }),
        }),
      );
      expect(result.status).toBe('approved');
    });

    it('Test 4: non-approver forbidden: user not on step -> 403 Forbidden', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: step1Id,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId: approver1Id,
        status: 'pending',
      } as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, nonApproverId, 'member', step1Id, {
          decision: 'approved',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });

    it('Test 5: re-decision conflict: step already decided -> 409 Conflict (WF-003)', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: step1Id,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId: approver1Id,
        status: 'approved', // already approved!
      } as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approver1Id, 'member', step1Id, {
          decision: 'rejected',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });
  });

  describe('triggerApprovalForDocument (Decimal.js comparison)', () => {
    it('Test 6: deal value < threshold: approval skipped', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: documentId,
        title: 'Small Deal NDA',
        workspaceId: '0192a000-0000-7000-8000-000000000010',
        totalValue: 5000,
      });

      mockRepo.listChains!.mockResolvedValue([
        {
          id: chainId,
          organizationId: orgId,
          workspaceId: '0192a000-0000-7000-8000-000000000010',
          name: 'High-Value Deals Chain',
          isActive: true,
          conditions: {
            triggerOn: 'document.sent',
            minDealValue: 50000, // Threshold is 50,000
          },
          steps: [],
        } as unknown as ApprovalChainDto,
      ]);

      const result = await service.triggerApprovalForDocument(
        orgId,
        documentId,
        'document.sent',
        49999.99, // Less than 50,000 threshold
      );

      expect(result.triggered).toBe(false);
      expect(mockRepo.createDocumentApprovalSteps).not.toHaveBeenCalled();
    });

    it('Test 7: deal value >= threshold: approval triggered', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: documentId,
        title: 'Enterprise Agreement',
        workspaceId: '0192a000-0000-7000-8000-000000000010',
        totalValue: 50000,
      });

      mockRepo.listChains!.mockResolvedValue([
        {
          id: chainId,
          organizationId: orgId,
          workspaceId: '0192a000-0000-7000-8000-000000000010',
          name: 'High-Value Deals Chain',
          isActive: true,
          conditions: {
            triggerOn: 'document.sent',
            minDealValue: 50000,
          },
          steps: [
            {
              stepOrder: 1,
              approverId: approver1Id,
              fallbackApproverId: null,
              timeoutHours: 168,
            },
          ],
        } as unknown as ApprovalChainDto,
      ]);

      mockRepo.createDocumentApprovalSteps!.mockResolvedValue([
        {
          id: step1Id,
          stepOrder: 1,
          approverId: approver1Id,
          status: 'pending',
        },
      ]);

      const result = await service.triggerApprovalForDocument(
        orgId,
        documentId,
        'document.sent',
        50000.0, // Exactly 50,000 threshold
      );

      expect(result.triggered).toBe(true);
      expect(mockRepo.createDocumentApprovalSteps).toHaveBeenCalled();
    });
  });
});
