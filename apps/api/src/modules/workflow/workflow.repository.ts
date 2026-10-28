import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import {
  CreateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDto,
  WorkflowDefinitionStatus,
  WorkflowInstanceStatus,
  WorkflowNodeExecutionStatus,
} from '@pactintel/shared-types';
import { Prisma } from '@prisma/client';

export interface WorkflowInstanceWithHistory {
  id: string;
  organizationId: string;
  workflowId: string;
  triggerPayload: Record<string, unknown>;
  currentNodeId: string | null;
  status: WorkflowInstanceStatus;
  chainDepth: number;
  visitedNodes: string[];
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  workflow?: {
    id: string;
    name: string;
  };
  nodeExecutions?: Array<{
    id: string;
    nodeId: string;
    nodeType: string;
    status: WorkflowNodeExecutionStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
}

@Injectable()
export class WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. WORKFLOW DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════

  async createDefinition(orgId: string, userId: string, dto: CreateWorkflowDefinitionDto) {
    const id = generateId();

    return this.prisma.workflowDefinition.create({
      data: {
        id,
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description || null,
        triggerEvent: dto.triggerEvent,
        dag: dto.dag as unknown as Prisma.InputJsonValue,
        status: 'draft',
        version: 1,
        maxInstances: dto.maxInstances || 1000,
        createdBy: userId,
      },
    });
  }

  async findDefinitionById(id: string, orgId?: string) {
    const where: Prisma.WorkflowDefinitionWhereInput = { id, deletedAt: null };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.workflowDefinition.findFirst({ where });
  }

  async findDefinitions(
    orgId: string,
    options: {
      workspaceId?: string;
      status?: WorkflowDefinitionStatus;
      search?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    const limit = options.limit || 20;
    const where: Prisma.WorkflowDefinitionWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (options.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    if (options.status) {
      where.status = options.status;
    }
    if (options.search) {
      where.name = { contains: options.search, mode: 'insensitive' };
    }

    const items = await this.prisma.workflowDefinition.findMany({
      where,
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      skip: options.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1].id : null;

    return {
      items: resultItems,
      nextCursor,
      hasMore,
    };
  }

  async updateDefinition(id: string, orgId: string, dto: UpdateWorkflowDefinitionDto) {
    const existing = await this.findDefinitionById(id, orgId);
    if (!existing) return null;

    return this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description !== undefined ? dto.description : undefined,
        triggerEvent: dto.triggerEvent,
        dag: dto.dag ? (dto.dag as unknown as Prisma.InputJsonValue) : undefined,
        status: dto.status,
        version: dto.dag ? existing.version + 1 : undefined,
        maxInstances: dto.maxInstances,
      },
    });
  }

  async deleteDefinition(id: string, orgId: string) {
    return this.prisma.workflowDefinition.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date(), status: 'archived' },
    });
  }

  async countActiveDefinitions(orgId: string): Promise<number> {
    return this.prisma.workflowDefinition.count({
      where: {
        organizationId: orgId,
        status: 'active',
        deletedAt: null,
      },
    });
  }

  async findActiveByTriggerEvent(orgId: string, triggerEvent: string) {
    return this.prisma.workflowDefinition.findMany({
      where: {
        organizationId: orgId,
        triggerEvent,
        status: 'active',
        deletedAt: null,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. WORKFLOW INSTANCES & EXECUTION STEPS
  // ═══════════════════════════════════════════════════════════════════════

  async createInstance(orgId: string, workflowId: string, triggerPayload: Record<string, unknown>) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.create({
        data: {
          id,
          organizationId: orgId,
          workflowId,
          triggerPayload: triggerPayload as Prisma.InputJsonValue,
          status: 'running',
          chainDepth: 0,
          visitedNodes: [] as unknown as Prisma.InputJsonValue,
        },
      });

      // Transactional Outbox (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'workflow.triggered',
          aggregateType: 'workflow_instance',
          aggregateId: id,
          payload: {
            instanceId: id,
            workflowId,
            status: 'running',
          },
        },
      });

      return instance;
    });
  }

  async findInstanceById(id: string, orgId?: string): Promise<WorkflowInstanceWithHistory | null> {
    const where: Prisma.WorkflowInstanceWhereInput = { id };
    if (orgId) {
      where.organizationId = orgId;
    }

    const inst = await this.prisma.workflowInstance.findFirst({
      where,
      include: {
        workflow: {
          select: { id: true, name: true },
        },
        nodeExecutions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!inst) return null;

    return {
      ...inst,
      triggerPayload: (inst.triggerPayload || {}) as Record<string, unknown>,
      currentNodeId: inst.currentNodeId,
      status: inst.status as WorkflowInstanceStatus,
      chainDepth: inst.chainDepth,
      visitedNodes: (inst.visitedNodes || []) as string[],
      errorMessage: inst.errorMessage,
      nodeExecutions: inst.nodeExecutions.map((ne) => ({
        ...ne,
        status: ne.status as WorkflowNodeExecutionStatus,
        input: (ne.input || {}) as Record<string, unknown>,
        output: (ne.output as Record<string, unknown>) || null,
      })),
    };
  }

  async findInstances(
    orgId: string,
    options: {
      workflowId?: string;
      status?: WorkflowInstanceStatus;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    const limit = options.limit || 20;
    const where: Prisma.WorkflowInstanceWhereInput = {
      organizationId: orgId,
    };

    if (options.workflowId) {
      where.workflowId = options.workflowId;
    }
    if (options.status) {
      where.status = options.status;
    }

    const items = await this.prisma.workflowInstance.findMany({
      where,
      take: limit + 1,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      skip: options.cursor ? 1 : 0,
      orderBy: { startedAt: 'desc' },
      include: {
        workflow: {
          select: { id: true, name: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1].id : null;

    return {
      items: resultItems.map((inst) => ({
        ...inst,
        triggerPayload: (inst.triggerPayload || {}) as Record<string, unknown>,
        status: inst.status as WorkflowInstanceStatus,
        visitedNodes: (inst.visitedNodes || []) as string[],
        workflowName: inst.workflow?.name,
      })),
      nextCursor,
      hasMore,
    };
  }

  async updateInstance(
    id: string,
    orgId: string,
    data: {
      currentNodeId?: string | null;
      status?: WorkflowInstanceStatus;
      chainDepth?: number;
      visitedNodes?: string[];
      errorMessage?: string | null;
      completedAt?: Date | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowInstance.update({
        where: { id },
        data: {
          currentNodeId: data.currentNodeId,
          status: data.status,
          chainDepth: data.chainDepth,
          visitedNodes: data.visitedNodes
            ? (data.visitedNodes as unknown as Prisma.InputJsonValue)
            : undefined,
          errorMessage: data.errorMessage,
          completedAt: data.completedAt,
        },
      });

      // Outbox event on terminal status (Invariant I-06)
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'halted') {
        const eventType = data.status === 'completed' ? 'workflow.completed' : 'workflow.failed';
        await tx.outboxEvent.create({
          data: {
            id: generateId(),
            organizationId: orgId,
            eventType,
            aggregateType: 'workflow_instance',
            aggregateId: id,
            payload: {
              instanceId: id,
              status: data.status,
              errorMessage: data.errorMessage || null,
            },
          },
        });
      }

      return updated;
    });
  }

  async createNodeExecution(
    orgId: string,
    instanceId: string,
    data: {
      nodeId: string;
      nodeType: string;
      input: Record<string, unknown>;
    },
  ) {
    const id = generateId();
    return this.prisma.workflowNodeExecution.create({
      data: {
        id,
        organizationId: orgId,
        instanceId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        input: data.input as Prisma.InputJsonValue,
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  async updateNodeExecution(
    id: string,
    _orgId: string,
    data: {
      output?: Record<string, unknown> | null;
      status: WorkflowNodeExecutionStatus;
      errorMessage?: string | null;
    },
  ) {
    return this.prisma.workflowNodeExecution.update({
      where: { id },
      data: {
        output: data.output ? (data.output as Prisma.InputJsonValue) : undefined,
        status: data.status,
        errorMessage: data.errorMessage,
        completedAt: new Date(),
      },
    });
  }

  async getExecutionMetrics(orgId: string) {
    const [totalTriggered, totalCompleted, totalFailed, totalHalted, activeWorkflowsCount] =
      await Promise.all([
        this.prisma.workflowInstance.count({ where: { organizationId: orgId } }),
        this.prisma.workflowInstance.count({
          where: { organizationId: orgId, status: 'completed' },
        }),
        this.prisma.workflowInstance.count({ where: { organizationId: orgId, status: 'failed' } }),
        this.prisma.workflowInstance.count({ where: { organizationId: orgId, status: 'halted' } }),
        this.prisma.workflowDefinition.count({
          where: { organizationId: orgId, status: 'active', deletedAt: null },
        }),
      ]);

    return {
      totalTriggered,
      totalCompleted,
      totalFailed,
      totalHalted,
      activeWorkflowsCount,
    };
  }
}
