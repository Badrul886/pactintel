import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';
import { WorkflowNodeExecutor } from './workflow-node-executor';
import { Queue, Worker } from 'bullmq';
import { WorkflowDag, WorkflowEdge } from '@pactintel/shared-types';
import Redis from 'ioredis';

export const MAX_WORKFLOW_CHAIN_DEPTH = 20;
export const WORKFLOW_QUEUE_NAME = 'workflow-engine';

export interface WorkflowJobData {
  instanceId: string;
  nodeId: string;
  organizationId: string;
}

@Injectable()
export class WorkflowEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private queue: Queue<WorkflowJobData> | null = null;
  private worker: Worker<WorkflowJobData> | null = null;
  private redisClient: Redis | null = null;

  // In-memory fallback tracking for rate caps and circuit breakers (for unit tests / dev)
  private readonly rateLimits = new Map<string, { count: number; windowStart: number }>();
  private readonly circuitBreakers = new Map<string, number>(); // orgId -> pausedUntil timestamp

  constructor(
    private readonly repo: WorkflowRepository,
    private readonly nodeExecutor: WorkflowNodeExecutor,
  ) {
    if (process.env.NODE_ENV !== 'test' && process.env.REDIS_QUEUE_HOST !== 'localhost-disabled') {
      try {
        const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
        const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
        this.redisClient = new Redis({
          host,
          port,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      } catch {
        // Fallback to memory
      }
    }
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, { connection });

      this.worker = new Worker<WorkflowJobData>(
        WORKFLOW_QUEUE_NAME,
        async (job) => {
          const { instanceId, nodeId, organizationId } = job.data;
          this.logger.log(`[WorkflowQueue] Processing node ${nodeId} for instance ${instanceId}`);
          await this.processNode(instanceId, nodeId, organizationId);
        },
        { connection, concurrency: 10 },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`[WorkflowWorker] Error: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start BullMQ for workflow engine: ${err.message}. Using inline execution.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
      if (this.redisClient) await this.redisClient.quit();
    } catch {
      // ignore
    }
  }

  /**
   * Enqueues or directly executes a workflow node job.
   */
  async enqueueNode(data: WorkflowJobData, delayMs?: number): Promise<void> {
    if (this.queue) {
      try {
        await this.queue.add('ProcessWorkflowNodeJob', data, {
          delay: delayMs && delayMs > 0 ? delayMs : undefined,
          removeOnComplete: true,
          removeOnFail: false,
        });
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to enqueue job to BullMQ: ${err.message}. Executing inline.`);
      }
    }

    // Direct synchronous fallback for tests or when Redis is absent
    await this.processNode(data.instanceId, data.nodeId, data.organizationId);
  }

  /**
   * Triggers active workflows matching the given trigger event for an organization.
   */
  async triggerWorkflow(
    triggerEvent: string,
    orgId: string,
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    // 1. Check Circuit Breaker & Rate Cap (Rule WF-002)
    const isPaused = await this.isCircuitBreakerActive(orgId);
    if (isPaused) {
      this.logger.warn(
        `[WorkflowEngine] Organization ${orgId} is under 5-min circuit breaker. Dispatches paused.`,
      );
      return [];
    }

    const rateExceeded = await this.incrementAndCheckRateCap(orgId);
    if (rateExceeded) {
      this.logger.warn(
        `[WorkflowEngine] Rate cap exceeded for org ${orgId} (>100 execs/min). Activating circuit breaker for 5 mins.`,
      );
      await this.activateCircuitBreaker(orgId, 5 * 60 * 1000);
      return [];
    }

    // 2. Fetch active workflow definitions matching triggerEvent
    const definitions = await this.repo.findActiveByTriggerEvent(orgId, triggerEvent);
    if (!definitions || definitions.length === 0) {
      return [];
    }

    const instanceIds: string[] = [];

    for (const def of definitions) {
      const dag = def.dag as unknown as WorkflowDag;
      if (!dag || !dag.nodes || dag.nodes.length === 0) continue;

      const triggerNode = dag.nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) continue;

      // Create execution instance (Invariant I-06: emits workflow.triggered)
      const instance = await this.repo.createInstance(orgId, def.id, payload);
      instanceIds.push(instance.id);

      // Enqueue the trigger node
      await this.enqueueNode({
        instanceId: instance.id,
        nodeId: triggerNode.id,
        organizationId: orgId,
      });
    }

    return instanceIds;
  }

  /**
   * Processes an individual node within an instance execution graph.
   * Enforces loop detection and chain depth guard (Rule WF-002).
   */
  async processNode(instanceId: string, nodeId: string, organizationId: string): Promise<void> {
    const instance = await this.repo.findInstanceById(instanceId, organizationId);
    if (!instance) {
      this.logger.warn(`Instance ${instanceId} not found for org ${organizationId}`);
      return;
    }

    if (
      instance.status === 'halted' ||
      instance.status === 'failed' ||
      instance.status === 'completed'
    ) {
      return;
    }

    const definition = await this.repo.findDefinitionById(instance.workflowId, organizationId);
    if (!definition) {
      this.logger.warn(`Workflow definition ${instance.workflowId} not found`);
      return;
    }

    const dag = definition.dag as unknown as WorkflowDag;
    const node = dag.nodes.find((n) => n.id === nodeId);
    if (!node) {
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'failed',
        errorMessage: `Node ${nodeId} not found in workflow DAG definition`,
        completedAt: new Date(),
      });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LOOP DETECTION & CHAIN DEPTH GUARD (RULE WF-002)
    // ═══════════════════════════════════════════════════════════════════════

    // 1. Loop Detection: Check if node was already visited
    if (instance.visitedNodes.includes(nodeId)) {
      this.logger.warn(
        `[WorkflowEngine] Loop detected in instance ${instanceId}: node ${nodeId} already executed. Halting.`,
      );
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'halted',
        errorMessage: `LOOP_DETECTED: Node ${nodeId} already visited in this execution path`,
        completedAt: new Date(),
      });
      return;
    }

    // 2. Chain Depth Guard: Max depth 20
    if (instance.chainDepth >= MAX_WORKFLOW_CHAIN_DEPTH) {
      this.logger.warn(
        `[WorkflowEngine] Max chain depth (${MAX_WORKFLOW_CHAIN_DEPTH}) exceeded in instance ${instanceId}. Halting.`,
      );
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'halted',
        errorMessage: `MAX_CHAIN_DEPTH_EXCEEDED: Exceeded max allowed depth of ${MAX_WORKFLOW_CHAIN_DEPTH}`,
        completedAt: new Date(),
      });
      return;
    }

    // Advance state
    const newVisitedNodes = [...instance.visitedNodes, nodeId];
    const newChainDepth = instance.chainDepth + 1;

    await this.repo.updateInstance(instanceId, organizationId, {
      currentNodeId: nodeId,
      visitedNodes: newVisitedNodes,
      chainDepth: newChainDepth,
    });

    // Record node execution start
    const execution = await this.repo.createNodeExecution(organizationId, instanceId, {
      nodeId,
      nodeType: node.type,
      input: instance.triggerPayload,
    });

    // Execute the node logic
    const result = await this.nodeExecutor.executeNode({
      instanceId,
      organizationId,
      triggerPayload: instance.triggerPayload,
      node,
    });

    // Update node execution record
    await this.repo.updateNodeExecution(execution.id, organizationId, {
      status: result.status,
      output: result.output,
      errorMessage: result.errorMessage,
    });

    if (result.status === 'failed') {
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'failed',
        errorMessage: result.errorMessage || `Node ${nodeId} execution failed`,
        completedAt: new Date(),
      });
      return;
    }

    // Determine next downstream node(s) in DAG
    const outgoingEdges = (dag.edges || []).filter((e) => e.source === nodeId);

    if (node.type === 'end' || outgoingEdges.length === 0) {
      // Flow reached completion
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'completed',
        completedAt: new Date(),
      });
      return;
    }

    let nextEdges: WorkflowEdge[] = [];

    if (node.type === 'condition') {
      const conditionResult = Boolean(result.output.result);
      const targetHandle = conditionResult ? 'true' : 'false';

      // Prefer edge with matching sourceHandle
      const matching = outgoingEdges.filter(
        (e) =>
          e.sourceHandle === targetHandle ||
          (conditionResult && e.label?.toLowerCase() === 'yes') ||
          (!conditionResult && e.label?.toLowerCase() === 'no'),
      );

      nextEdges =
        matching.length > 0
          ? matching
          : outgoingEdges.filter((e) => !e.sourceHandle || e.sourceHandle === 'default');
    } else {
      nextEdges = outgoingEdges;
    }

    if (nextEdges.length === 0) {
      await this.repo.updateInstance(instanceId, organizationId, {
        status: 'completed',
        completedAt: new Date(),
      });
      return;
    }

    // Enqueue each downstream node
    for (const edge of nextEdges) {
      await this.enqueueNode(
        {
          instanceId,
          nodeId: edge.target,
          organizationId,
        },
        result.delayMs,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RATE LIMITING & CIRCUIT BREAKER (RULE WF-002)
  // ═══════════════════════════════════════════════════════════════════════

  private async isCircuitBreakerActive(orgId: string): Promise<boolean> {
    if (this.redisClient) {
      try {
        const key = `cb:workflow:${orgId}`;
        const paused = await this.redisClient.get(key);
        return Boolean(paused);
      } catch {
        // Fallback to memory
      }
    }

    const pausedUntil = this.circuitBreakers.get(orgId);
    if (!pausedUntil) return false;
    if (Date.now() > pausedUntil) {
      this.circuitBreakers.delete(orgId);
      return false;
    }
    return true;
  }

  private async incrementAndCheckRateCap(orgId: string): Promise<boolean> {
    const limit = 100; // 100 executions per minute per org

    if (this.redisClient) {
      try {
        const key = `ratelimit:workflow:${orgId}`;
        const count = await this.redisClient.incr(key);
        if (count === 1) {
          await this.redisClient.expire(key, 60);
        }
        return count > limit;
      } catch {
        // Fallback to memory
      }
    }

    const now = Date.now();
    const entry = this.rateLimits.get(orgId) || { count: 0, windowStart: now };

    if (now - entry.windowStart > 60000) {
      entry.count = 1;
      entry.windowStart = now;
      this.rateLimits.set(orgId, entry);
      return false;
    }

    entry.count += 1;
    this.rateLimits.set(orgId, entry);
    return entry.count > limit;
  }

  private async activateCircuitBreaker(orgId: string, durationMs: number): Promise<void> {
    if (this.redisClient) {
      try {
        const key = `cb:workflow:${orgId}`;
        await this.redisClient.set(key, '1', 'PX', durationMs);
        return;
      } catch {
        // Fallback to memory
      }
    }

    this.circuitBreakers.set(orgId, Date.now() + durationMs);
  }
}
