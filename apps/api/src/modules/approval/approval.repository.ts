import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import { CreateApprovalChainDto, ApprovalChainDto, ApprovalStepDto } from '@pactintel/shared-types';

@Injectable()
export class ApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an ApprovalChain template with its configured steps.
   * Emits transactional outbox event 'approval.chain.created'.
   */
  async createChain(
    organizationId: string,
    dto: CreateApprovalChainDto,
    chainId: string = generateId(),
  ): Promise<ApprovalChainDto> {
    return this.prisma.$transaction(async (tx) => {
      const chain = await tx.approvalChain.create({
        data: {
          id: chainId,
          organizationId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          conditions: dto.conditions as unknown as Prisma.InputJsonValue,
          isActive: true,
          steps: {
            create: dto.steps.map((step) => ({
              id: generateId(),
              organizationId,
              stepOrder: step.stepOrder,
              approverId: step.approverId ?? null,
              fallbackApproverId: step.fallbackApproverId ?? null,
              timeoutHours: step.timeoutHours ?? 168,
              status: 'pending',
            })),
          },
        },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' },
            include: {
              approver: { select: { id: true, name: true, email: true } },
              fallbackApprover: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'approval.chain.created',
          aggregateType: 'ApprovalChain',
          aggregateId: chain.id,
          payload: {
            chainId: chain.id,
            workspaceId: chain.workspaceId,
            name: chain.name,
            conditions: chain.conditions,
            stepCount: chain.steps.length,
          } as Prisma.InputJsonValue,
        },
      });

      return this.mapChainToDto(chain);
    });
  }

  async findChainById(id: string, organizationId?: string): Promise<ApprovalChainDto | null> {
    const chain = await this.prisma.approvalChain.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approver: { select: { id: true, name: true, email: true } },
            fallbackApprover: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return chain ? this.mapChainToDto(chain) : null;
  }

  async listChains(organizationId: string, workspaceId?: string): Promise<ApprovalChainDto[]> {
    const chains = await this.prisma.approvalChain.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approver: { select: { id: true, name: true, email: true } },
            fallbackApprover: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return chains.map((c) => this.mapChainToDto(c));
  }

  async updateChain(
    id: string,
    organizationId: string,
    data: { name?: string; isActive?: boolean; conditions?: any },
  ): Promise<ApprovalChainDto> {
    const existing = await this.findChainById(id, organizationId);
    if (!existing) {
      throw new Error(`Approval chain ${id} not found`);
    }

    const updated = await this.prisma.approvalChain.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.conditions ? { conditions: data.conditions as Prisma.InputJsonValue } : {}),
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approver: { select: { id: true, name: true, email: true } },
            fallbackApprover: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return this.mapChainToDto(updated);
  }

  async softDeleteChain(id: string, organizationId: string): Promise<void> {
    const existing = await this.findChainById(id, organizationId);
    if (!existing) {
      return;
    }

    await this.prisma.approvalChain.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Instantiates approval steps for a specific document.
   */
  async createDocumentApprovalSteps(
    organizationId: string,
    documentId: string,
    chainId: string,
    steps: Array<{
      stepOrder: number;
      approverId?: string | null;
      fallbackApproverId?: string | null;
      timeoutHours?: number;
    }>,
  ): Promise<ApprovalStepDto[]> {
    return this.prisma.$transaction(async (tx) => {
      const createdSteps = await Promise.all(
        steps.map((s, idx) =>
          tx.approvalStep.create({
            data: {
              id: generateId(),
              approvalChainId: chainId,
              organizationId,
              documentId,
              stepOrder: s.stepOrder,
              approverId: s.approverId ?? null,
              fallbackApproverId: s.fallbackApproverId ?? null,
              timeoutHours: s.timeoutHours ?? 168,
              status: idx === 0 ? 'pending' : 'pending',
            },
            include: {
              approver: { select: { id: true, name: true, email: true } },
              fallbackApprover: { select: { id: true, name: true, email: true } },
            },
          }),
        ),
      );

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'approval.chain.triggered',
          aggregateType: 'Document',
          aggregateId: documentId,
          payload: {
            documentId,
            chainId,
            stepCount: createdSteps.length,
            firstApproverId: createdSteps[0]?.approverId,
          } as Prisma.InputJsonValue,
        },
      });

      return createdSteps.map((step) => this.mapStepToDto(step));
    });
  }

  async findStepById(id: string, organizationId?: string) {
    return this.prisma.approvalStep.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        approvalChain: true,
        document: {
          select: { id: true, title: true, ownerId: true, status: true, workspaceId: true },
        },
        approver: { select: { id: true, name: true, email: true } },
        fallbackApprover: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findPendingStepsForUser(
    organizationId: string,
    userId: string,
  ): Promise<ApprovalStepDto[]> {
    const steps = await this.prisma.approvalStep.findMany({
      where: {
        organizationId,
        approverId: userId,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        approver: { select: { id: true, name: true, email: true } },
        fallbackApprover: { select: { id: true, name: true, email: true } },
      },
    });

    return steps.map((s) => this.mapStepToDto(s));
  }

  async findStepsByDocumentId(
    organizationId: string,
    documentId: string,
  ): Promise<ApprovalStepDto[]> {
    const steps = await this.prisma.approvalStep.findMany({
      where: {
        organizationId,
        documentId,
      },
      orderBy: { stepOrder: 'asc' },
      include: {
        approver: { select: { id: true, name: true, email: true } },
        fallbackApprover: { select: { id: true, name: true, email: true } },
      },
    });

    return steps.map((s) => this.mapStepToDto(s));
  }

  /**
   * Identifies stalled steps where now > createdAt + timeout_hours.
   */
  async findStalledSteps(): Promise<any[]> {
    return this.prisma.approvalStep.findMany({
      where: {
        status: 'pending',
        documentId: { not: null },
      },
      include: {
        approvalChain: true,
        document: { select: { id: true, title: true, ownerId: true, workspaceId: true } },
        fallbackApprover: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Atomically records an approval decision in a transaction.
   * RULE WF-003: Step decision is permanent.
   */
  async decideStep(
    stepId: string,
    organizationId: string,
    decision: 'approved' | 'rejected',
    comment: string | null,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const step = await tx.approvalStep.update({
        where: { id: stepId },
        data: {
          status: decision,
          decidedAt: new Date(),
          comment,
        },
        include: {
          approver: { select: { id: true, name: true, email: true } },
          fallbackApprover: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          actorId,
          actorType: 'user',
          action: 'approval.decided',
          resourceType: 'ApprovalStep',
          resourceId: stepId,
          changes: { decision, comment } as Prisma.InputJsonValue,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'approval.step.decided',
          aggregateType: 'ApprovalStep',
          aggregateId: stepId,
          payload: {
            stepId,
            documentId: step.documentId,
            decision,
            comment,
            decidedAt: step.decidedAt?.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return this.mapStepToDto(step);
    });
  }

  /**
   * Reassigns a pending approval step to a new approver.
   * Emits outbox event and audit log entry.
   */
  async reassignStep(
    stepId: string,
    organizationId: string,
    newApproverId: string,
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.approvalStep.update({
        where: { id: stepId },
        data: { approverId: newApproverId },
        include: {
          approver: { select: { id: true, name: true, email: true } },
          fallbackApprover: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          actorId: actorId ?? null,
          actorType: actorId ? 'user' : 'system',
          action: 'approval.step.auto_reassigned',
          resourceType: 'ApprovalStep',
          resourceId: stepId,
          changes: { newApproverId } as Prisma.InputJsonValue,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'approval.step.auto_reassigned',
          aggregateType: 'ApprovalStep',
          aggregateId: stepId,
          payload: {
            stepId,
            documentId: updated.documentId,
            newApproverId,
          } as Prisma.InputJsonValue,
        },
      });

      return this.mapStepToDto(updated);
    });
  }

  async voidRemainingSteps(documentId: string, afterStepOrder: number): Promise<void> {
    await this.prisma.approvalStep.updateMany({
      where: {
        documentId,
        stepOrder: { gt: afterStepOrder },
        status: 'pending',
      },
      data: { status: 'skipped' },
    });
  }

  async activateNextStep(
    documentId: string,
    nextStepOrder: number,
  ): Promise<ApprovalStepDto | null> {
    const nextStep = await this.prisma.approvalStep.findFirst({
      where: {
        documentId,
        stepOrder: nextStepOrder,
      },
      include: {
        approver: { select: { id: true, name: true, email: true } },
        fallbackApprover: { select: { id: true, name: true, email: true } },
      },
    });

    return nextStep ? this.mapStepToDto(nextStep) : null;
  }

  private mapChainToDto(chain: any): ApprovalChainDto {
    return {
      id: chain.id,
      organizationId: chain.organizationId,
      workspaceId: chain.workspaceId,
      name: chain.name,
      conditions: chain.conditions as any,
      isActive: chain.isActive,
      createdAt: chain.createdAt.toISOString(),
      updatedAt: chain.updatedAt.toISOString(),
      deletedAt: chain.deletedAt ? chain.deletedAt.toISOString() : null,
      steps: chain.steps ? chain.steps.map((s: any) => this.mapStepToDto(s)) : [],
    };
  }

  private mapStepToDto(step: any): ApprovalStepDto {
    return {
      id: step.id,
      approvalChainId: step.approvalChainId,
      organizationId: step.organizationId,
      documentId: step.documentId,
      stepOrder: step.stepOrder,
      approverId: step.approverId,
      approver: step.approver,
      fallbackApproverId: step.fallbackApproverId,
      fallbackApprover: step.fallbackApprover,
      status: step.status as any,
      timeoutHours: step.timeoutHours,
      decidedAt: step.decidedAt ? step.decidedAt.toISOString() : null,
      comment: step.comment,
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString(),
    };
  }
}
