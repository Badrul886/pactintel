import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowInstanceStatus, WorkflowDag } from '@pactintel/shared-types';

@Injectable()
export class WorkflowInstanceService {
  private readonly logger = new Logger(WorkflowInstanceService.name);

  constructor(
    private readonly repo: WorkflowRepository,
    private readonly engine: WorkflowEngineService,
  ) {}

  async listInstances(
    orgId: string,
    options: {
      workflowId?: string;
      status?: WorkflowInstanceStatus;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    return this.repo.findInstances(orgId, options);
  }

  async getInstance(id: string, orgId?: string) {
    const inst = await this.repo.findInstanceById(id, orgId);
    if (!inst) {
      throw new NotFoundException(`Workflow instance ${id} not found.`);
    }
    return inst;
  }

  async getMetrics(orgId: string) {
    return this.repo.getExecutionMetrics(orgId);
  }

  async resumeInstance(id: string, orgId: string) {
    const inst = await this.getInstance(id, orgId);

    if (inst.status !== 'failed' && inst.status !== 'halted' && inst.status !== 'paused') {
      throw new BadRequestException(
        `Cannot resume instance with status '${inst.status}'. Only failed, halted, or paused instances can be resumed.`,
      );
    }

    if (!inst.currentNodeId) {
      throw new BadRequestException('Instance has no recorded currentNodeId to resume from.');
    }

    this.logger.log(
      `[WorkflowInstanceService] Resuming instance ${id} from node ${inst.currentNodeId}`,
    );

    // When resuming from a halted/failed node, remove it from visitedNodes to allow safe re-entry
    const visitedNodes = inst.visitedNodes.filter((n) => n !== inst.currentNodeId);

    // Update status to running
    await this.repo.updateInstance(id, orgId, {
      status: 'running',
      errorMessage: null,
      visitedNodes,
    });

    // Re-enqueue current node
    await this.engine.enqueueNode({
      instanceId: id,
      nodeId: inst.currentNodeId,
      organizationId: orgId,
    });

    return { success: true, message: `Instance ${id} resumed at node ${inst.currentNodeId}` };
  }

  async haltInstance(id: string, orgId: string) {
    const inst = await this.getInstance(id, orgId);

    if (inst.status !== 'running') {
      throw new BadRequestException(`Cannot halt instance with status '${inst.status}'.`);
    }

    await this.repo.updateInstance(id, orgId, {
      status: 'halted',
      errorMessage: 'Manually halted by administrator',
      completedAt: new Date(),
    });

    return { success: true, message: `Instance ${id} halted.` };
  }

  async skipNode(id: string, orgId: string, nodeId: string) {
    const inst = await this.getInstance(id, orgId);
    const def = await this.repo.findDefinitionById(inst.workflowId, orgId);
    if (!def) {
      throw new NotFoundException(`Workflow definition ${inst.workflowId} not found.`);
    }

    const dag = def.dag as unknown as WorkflowDag;
    const outgoing = (dag.edges || []).filter((e) => e.source === nodeId);

    // Record node as skipped
    const execution = await this.repo.createNodeExecution(orgId, id, {
      nodeId,
      nodeType: 'skipped',
      input: { manualSkip: true },
    });

    await this.repo.updateNodeExecution(execution.id, orgId, {
      status: 'skipped',
      output: { skippedByAdmin: true },
    });

    if (outgoing.length === 0) {
      await this.repo.updateInstance(id, orgId, {
        status: 'completed',
        completedAt: new Date(),
      });
      return { success: true, message: `Node ${nodeId} skipped. Workflow reached completion.` };
    }

    // Advance to next nodes
    for (const edge of outgoing) {
      await this.engine.enqueueNode({
        instanceId: id,
        nodeId: edge.target,
        organizationId: orgId,
      });
    }

    return { success: true, message: `Node ${nodeId} skipped. Downstream nodes enqueued.` };
  }
}
