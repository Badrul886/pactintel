import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDto,
  WorkflowDag,
  WorkflowDefinitionStatus,
} from '@pactintel/shared-types';

@Injectable()
export class WorkflowDefinitionService {
  private readonly logger = new Logger(WorkflowDefinitionService.name);

  constructor(
    private readonly repo: WorkflowRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createWorkflow(orgId: string, userId: string, dto: CreateWorkflowDefinitionDto) {
    this.validateDagStructure(dto.dag);

    return this.repo.createDefinition(orgId, userId, dto);
  }

  async getWorkflow(id: string, orgId?: string) {
    const wf = await this.repo.findDefinitionById(id, orgId);
    if (!wf) {
      throw new NotFoundException(`Workflow definition ${id} not found.`);
    }
    return wf;
  }

  async listWorkflows(
    orgId: string,
    options: {
      workspaceId?: string;
      status?: WorkflowDefinitionStatus;
      search?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    return this.repo.findDefinitions(orgId, options);
  }

  async updateWorkflow(id: string, orgId: string, dto: UpdateWorkflowDefinitionDto) {
    const existing = await this.getWorkflow(id, orgId);

    if (dto.dag) {
      this.validateDagStructure(dto.dag);
    }

    // Check Plan Limits before activating workflow
    if (dto.status === 'active' && existing.status !== 'active') {
      await this.enforcePlanWorkflowLimit(orgId);
    }

    const updated = await this.repo.updateDefinition(id, orgId, dto);
    if (!updated) {
      throw new NotFoundException(`Workflow definition ${id} not found.`);
    }

    return updated;
  }

  async deleteWorkflow(id: string, orgId: string) {
    const existing = await this.getWorkflow(id, orgId);
    await this.repo.deleteDefinition(existing.id, orgId);
    return { success: true, deletedId: id };
  }

  /**
   * Validates that DAG has a trigger node and contains NO directed cycles (DFS).
   */
  validateDagStructure(dag: WorkflowDag | Record<string, any>): void {
    if (!dag || !dag.nodes || !Array.isArray(dag.nodes) || dag.nodes.length === 0) {
      throw new BadRequestException('Workflow DAG must contain at least one node.');
    }

    const hasTrigger = dag.nodes.some((n: any) => n.type === 'trigger');
    if (!hasTrigger) {
      throw new BadRequestException('Workflow DAG must have at least one trigger node.');
    }

    // Cycle detection using Depth-First Search
    const adj = new Map<string, string[]>();
    for (const node of dag.nodes as any[]) {
      adj.set(node.id, []);
    }
    for (const edge of (dag.edges || []) as any[]) {
      if (adj.has(edge.source)) {
        adj.get(edge.source)!.push(edge.target);
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = adj.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of dag.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) {
          throw new BadRequestException(
            'Invalid workflow graph: Cycle detected. Workflows must be Directed Acyclic Graphs (DAG).',
          );
        }
      }
    }
  }

  /**
   * Enforces subscription plan tier limits on active workflows.
   */
  async enforcePlanWorkflowLimit(orgId: string): Promise<void> {
    const activeCount = await this.repo.countActiveDefinitions(orgId);

    const subscription = await this.prisma.subscription?.findUnique({
      where: { organizationId: orgId },
    });

    const tier = subscription?.planTier || 'free';
    let limit: number | null = 1;

    switch (tier) {
      case 'enterprise':
        limit = null; // unlimited
        break;
      case 'business':
        limit = 25;
        break;
      case 'professional':
        limit = 10;
        break;
      case 'starter':
        limit = 3;
        break;
      case 'free':
      default:
        limit = 1;
        break;
    }

    // Check add-on custom limit override if present
    const metadata = (subscription as any)?.metadata as Record<string, any> | undefined;
    if (metadata?.workflowLimit !== undefined) {
      limit = Number(metadata.workflowLimit);
    }

    if (limit !== null && activeCount >= limit) {
      this.logger.warn(
        `[WorkflowDefinitionService] Org ${orgId} reached active workflow limit (${activeCount}/${limit}) for tier ${tier}`,
      );
      throw new HttpException(
        {
          code: 'WORKFLOW_LIMIT_REACHED',
          message: `Active workflow limit (${limit}) reached for plan tier '${tier}'. Please upgrade your subscription to activate more workflows.`,
          details: {
            activeCount,
            limit,
            tier,
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}
