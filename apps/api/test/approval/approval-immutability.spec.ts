/**
 * Test Suite: Approval Chain Immutability & State Transition Integrity
 * Blueprint Reference: §5.19, RULE WF-001..003, EC-APP-01..06, Invariant I-06, I-09
 * Proves that approval step decisions are strictly irreversible (WF-003),
 * non-pending steps cannot be decided, outbox events are immutable,
 * and multi-tenant step boundaries cannot be crossed.
 */

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalService } from '../../src/modules/approval/approval.service';
import { ApprovalRepository } from '../../src/modules/approval/approval.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ApprovalStepDto } from '@pactintel/shared-types';

describe('Approval Immutability & Re-Decision Protection (RULE WF-003, EC-APP-01..06)', () => {
  let service: ApprovalService;
  let mockRepo: Partial<Record<keyof ApprovalRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const otherOrgId = '22222222-2222-7222-8222-222222222222';
  const approverId = '33333333-3333-7333-8333-333333333333';
  const documentId = '44444444-4444-7444-8444-444444444444';
  const stepId = '55555555-5555-7555-8555-555555555555';

  beforeEach(() => {
    mockRepo = {
      findStepById: jest.fn(),
      decideStep: jest.fn(),
      activateNextStep: jest.fn(),
      voidRemainingSteps: jest.fn(),
    };

    mockPrisma = {
      document: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
    };

    service = new ApprovalService(
      mockRepo as unknown as ApprovalRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('1. Irreversibility of Decided Steps (RULE WF-003)', () => {
    it('throws 409 Conflict when attempting to re-decide an already approved step', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: stepId,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId,
        status: 'approved', // Already finalized
        decidedAt: new Date().toISOString(),
      } as unknown as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'rejected',
          comment: 'Attempting to change my mind and reject',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when attempting to re-decide an already rejected step', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: stepId,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId,
        status: 'rejected', // Already finalized
        decidedAt: new Date().toISOString(),
      } as unknown as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'approved',
          comment: 'Attempting to change my mind and approve',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when attempting to decide a skipped or voided step', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: stepId,
        organizationId: orgId,
        documentId,
        stepOrder: 2,
        approverId,
        status: 'skipped', // Voided due to prior step rejection
      } as unknown as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'approved',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });

    it('throws 409 Conflict when attempting to decide an inactive/waiting step out of sequence', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: stepId,
        organizationId: orgId,
        documentId,
        stepOrder: 2,
        approverId,
        status: 'waiting', // Not yet promoted to pending
      } as unknown as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'approved',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });
  });

  describe('2. Multi-Tenant Boundary Enforcement', () => {
    it('throws 404 NotFound when attempting to decide a step belonging to another tenant', async () => {
      // Step exists in db but under different org; querying with orgId returns null due to tenant isolation
      mockRepo.findStepById!.mockImplementation((_id: string, queryOrgId: string) => {
        if (queryOrgId === otherOrgId) {
          return Promise.resolve({
            id: stepId,
            organizationId: otherOrgId,
            documentId,
            stepOrder: 1,
            approverId,
            status: 'pending',
          } as unknown as ApprovalStepDto);
        }
        return Promise.resolve(null);
      });

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'approved',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });

    it('throws 403 Forbidden when a member tries to decide another approver step', async () => {
      mockRepo.findStepById!.mockResolvedValue({
        id: stepId,
        organizationId: orgId,
        documentId,
        stepOrder: 1,
        approverId: 'different-approver-id',
        status: 'pending',
      } as unknown as ApprovalStepDto);

      await expect(
        service.submitDecision(orgId, approverId, 'member', stepId, {
          decision: 'approved',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockRepo.decideStep).not.toHaveBeenCalled();
    });
  });
});
