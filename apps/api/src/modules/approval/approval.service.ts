import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ApprovalRepository } from './approval.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateApprovalChainDto,
  SubmitApprovalDecisionDto,
  ApprovalChainDto,
  ApprovalStepDto,
  UserRole,
} from '@pactintel/shared-types';
import Decimal from 'decimal.js';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly repo: ApprovalRepository,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async createChain(
    organizationId: string,
    dto: CreateApprovalChainDto,
  ): Promise<ApprovalChainDto> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: dto.workspaceId, organizationId, deletedAt: null },
    });
    if (!workspace) {
      throw new NotFoundException(`Workspace ${dto.workspaceId} not found`);
    }

    return this.repo.createChain(organizationId, dto);
  }

  async getChain(organizationId: string, id: string): Promise<ApprovalChainDto> {
    const chain = await this.repo.findChainById(id, organizationId);
    if (!chain) {
      throw new NotFoundException(`Approval chain ${id} not found`);
    }
    return chain;
  }

  async listChains(organizationId: string, workspaceId?: string): Promise<ApprovalChainDto[]> {
    return this.repo.listChains(organizationId, workspaceId);
  }

  async updateChain(
    organizationId: string,
    id: string,
    data: { name?: string; isActive?: boolean; conditions?: any },
  ): Promise<ApprovalChainDto> {
    await this.getChain(organizationId, id);
    return this.repo.updateChain(id, organizationId, data);
  }

  async deleteChain(organizationId: string, id: string): Promise<{ success: boolean }> {
    await this.getChain(organizationId, id);
    await this.repo.softDeleteChain(id, organizationId);
    return { success: true };
  }

  /**
   * Evaluates matching approval chains for a document and instantiates steps.
   * All deal value evaluations MUST use Decimal.js (RULE: never native JS floats).
   */
  async triggerApprovalForDocument(
    organizationId: string,
    documentId: string,
    triggerEvent: 'document.sent' | 'document.signed' | 'manual',
    dealValue?: number | string | null,
  ): Promise<{ triggered: boolean; steps?: ApprovalStepDto[] }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      select: { id: true, title: true, workspaceId: true, totalValue: true },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const chains = await this.repo.listChains(organizationId, doc.workspaceId);
    const activeChains = chains.filter((c) => c.isActive);

    const effectiveValue =
      dealValue !== undefined && dealValue !== null
        ? new Decimal(dealValue)
        : new Decimal(doc.totalValue ? Number(doc.totalValue) : 0);

    for (const chain of activeChains) {
      const conditions = chain.conditions;

      // Check trigger event match
      if (conditions.triggerOn !== triggerEvent) {
        continue;
      }

      // Check minDealValue threshold with Decimal.js
      if (conditions.minDealValue !== undefined && conditions.minDealValue !== null) {
        const threshold = new Decimal(conditions.minDealValue);
        if (effectiveValue.lessThan(threshold)) {
          this.logger.log(
            `[Approval] Document ${documentId} value ${effectiveValue} < threshold ${threshold}. Skipping chain ${chain.id}`,
          );
          continue;
        }
      }

      // Chain matches! Instantiate steps
      const steps = await this.repo.createDocumentApprovalSteps(
        organizationId,
        documentId,
        chain.id,
        chain.steps.map((s) => ({
          stepOrder: s.stepOrder,
          approverId: s.approverId,
          fallbackApproverId: s.fallbackApproverId,
          timeoutHours: s.timeoutHours,
        })),
      );

      // Notify first approver
      const firstStep = steps[0];
      if (firstStep && firstStep.approverId && this.notificationService) {
        await this.notificationService.notifyUser(firstStep.approverId, organizationId, {
          eventType: 'approval.step.pending',
          title: 'Approval Required',
          body: `Document "${doc.title}" requires your approval.`,
          resourceType: 'Document',
          resourceId: documentId,
        });
      }

      return { triggered: true, steps };
    }

    return { triggered: false };
  }

  /**
   * Submits an approval or rejection decision on an approval step.
   * RULE WF-003: Step decision is strictly immutable once recorded.
   */
  async submitDecision(
    organizationId: string,
    userId: string,
    userRole: UserRole,
    stepId: string,
    dto: SubmitApprovalDecisionDto,
  ): Promise<ApprovalStepDto> {
    const step = await this.repo.findStepById(stepId, organizationId);
    if (!step) {
      throw new NotFoundException(`Approval step ${stepId} not found`);
    }

    // RULE WF-003: Verify step is still pending
    if (step.status !== 'pending') {
      throw new ConflictException({
        code: 'STEP_ALREADY_DECIDED',
        message: `Approval step ${stepId} is already ${step.status} and cannot be modified (RULE WF-003)`,
      });
    }

    // CASL / Ownership check: approver or admin/owner/manager
    const isApprover = step.approverId === userId;
    const isPrivileged = userRole === 'admin' || userRole === 'owner' || userRole === 'manager';
    if (!isApprover && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to decide this approval step');
    }

    // Record decision transactionally
    const decidedStep = await this.repo.decideStep(
      stepId,
      organizationId,
      dto.decision,
      dto.comment ?? null,
      userId,
    );

    const documentId = step.documentId;

    if (dto.decision === 'rejected') {
      // Void remaining steps (status: 'skipped')
      if (documentId) {
        await this.repo.voidRemainingSteps(documentId, step.stepOrder);

        // Update document status to approval_rejected
        await this.prisma.document.update({
          where: { id: documentId },
          data: { status: 'approval_rejected' as any },
        });

        // Outbox event
        await this.prisma.outboxEvent.create({
          data: {
            id: generateId(),
            organizationId,
            eventType: 'approval.chain.rejected',
            aggregateType: 'Document',
            aggregateId: documentId,
            payload: {
              documentId,
              rejectedByStepId: stepId,
              rejectedById: userId,
              comment: dto.comment,
            } as Prisma.InputJsonValue,
          },
        });
      }
    } else if (dto.decision === 'approved') {
      if (documentId) {
        // Check for next step
        const nextStep = await this.repo.activateNextStep(documentId, step.stepOrder + 1);

        if (nextStep) {
          // Promote next step to pending and notify next approver
          if (nextStep.approverId && this.notificationService) {
            await this.notificationService.notifyUser(nextStep.approverId, organizationId, {
              eventType: 'approval.step.pending',
              title: 'Approval Required',
              body: `Document "${step.document?.title || 'Contract'}" requires your approval.`,
              resourceType: 'Document',
              resourceId: documentId,
            });
          }
        } else {
          // Final step approved! Update document status to approval_complete
          await this.prisma.document.update({
            where: { id: documentId },
            data: { status: 'approval_complete' as any },
          });

          await this.prisma.outboxEvent.create({
            data: {
              id: generateId(),
              organizationId,
              eventType: 'approval.chain.approved',
              aggregateType: 'Document',
              aggregateId: documentId,
              payload: {
                documentId,
                completedAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    return decidedStep;
  }

  /**
   * Deactivates an approver and escalates all pending steps (RULE WF-001).
   * Reassigns to fallbackApproverId if active, or to the workspace administrator.
   */
  async deactivateUserEscalation(organizationId: string, userId: string): Promise<number> {
    const pendingSteps = await this.prisma.approvalStep.findMany({
      where: {
        organizationId,
        approverId: userId,
        status: 'pending',
      },
      include: {
        document: { select: { id: true, title: true, ownerId: true, workspaceId: true } },
        fallbackApprover: { select: { id: true, name: true, status: true } },
      },
    });

    let reallocatedCount = 0;

    for (const step of pendingSteps) {
      let targetApproverId: string | null = null;

      // 1. Fallback approver if active
      if (step.fallbackApproverId && step.fallbackApprover?.status === 'active') {
        targetApproverId = step.fallbackApproverId;
      } else {
        // 2. Workspace admin fallback
        const adminUser = await this.prisma.user.findFirst({
          where: {
            organizationId,
            role: { in: ['admin', 'owner'] },
            status: 'active',
          },
          select: { id: true },
        });
        targetApproverId = adminUser ? adminUser.id : null;
      }

      if (targetApproverId) {
        await this.repo.reassignStep(step.id, organizationId, targetApproverId);
        reallocatedCount++;

        // Notify new approver and document owner
        if (this.notificationService) {
          await this.notificationService.notifyUser(targetApproverId, organizationId, {
            eventType: 'approval.step.reassigned',
            title: 'Approval Reassigned to You',
            body: `An approval step has been automatically reassigned to you.`,
            resourceType: 'Document',
            resourceId: step.documentId ?? undefined,
          });

          if (step.document?.ownerId) {
            await this.notificationService.notifyUser(step.document.ownerId, organizationId, {
              eventType: 'approval.approver_changed',
              title: 'Approver Updated',
              body: `Approver for document "${step.document.title}" was automatically updated.`,
              resourceType: 'Document',
              resourceId: step.document.id,
            });
          }
        }
      }
    }

    return reallocatedCount;
  }

  /**
   * Checks stalled approval steps exceeding timeoutHours and escalates them (Invariant I-07).
   */
  async checkApprovalTimeouts(): Promise<number> {
    const stalledSteps = await this.repo.findStalledSteps();
    const now = Date.now();
    let escalatedCount = 0;

    for (const step of stalledSteps) {
      const timeoutMs = (step.timeoutHours || 168) * 3600 * 1000;
      const createdAtMs = new Date(step.createdAt).getTime();

      if (now - createdAtMs > timeoutMs) {
        // Stalled step! Escalate to fallback or admin
        const targetApproverId =
          step.fallbackApproverId ||
          (
            await this.prisma.user.findFirst({
              where: {
                organizationId: step.organizationId,
                role: { in: ['admin', 'owner'] },
                status: 'active',
              },
              select: { id: true },
            })
          )?.id;

        if (targetApproverId && targetApproverId !== step.approverId) {
          await this.repo.reassignStep(step.id, step.organizationId, targetApproverId);
          escalatedCount++;
          this.logger.warn(
            `Stalled approval step ${step.id} automatically escalated to ${targetApproverId}`,
          );
        }
      }
    }

    return escalatedCount;
  }

  async listPendingStepsForUser(
    organizationId: string,
    userId: string,
  ): Promise<ApprovalStepDto[]> {
    return this.repo.findPendingStepsForUser(organizationId, userId);
  }

  async listStepsForDocument(
    organizationId: string,
    documentId: string,
  ): Promise<ApprovalStepDto[]> {
    return this.repo.findStepsByDocumentId(organizationId, documentId);
  }
}
