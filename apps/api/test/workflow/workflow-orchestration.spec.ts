import { WorkflowDefinitionService } from '../../src/modules/workflow/workflow-definition.service';
import { WorkflowInstanceService } from '../../src/modules/workflow/workflow-instance.service';
import { WorkflowEngineService } from '../../src/modules/workflow/workflow-engine.service';
import { WorkflowRepository } from '../../src/modules/workflow/workflow.repository';
import { WorkflowNodeExecutor } from '../../src/modules/workflow/workflow-node-executor';
import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkflowDag } from '@pactintel/shared-types';

describe('Integration Test: Phase 3 Sprint 3.2 Visual Workflow Orchestration Suite', () => {
  let definitionService: WorkflowDefinitionService;
  let instanceService: WorkflowInstanceService;
  let engineService: WorkflowEngineService;
  let mockRepo: Partial<Record<keyof WorkflowRepository, jest.Mock>>;
  let nodeExecutor: WorkflowNodeExecutor;

  const orgA = '0192a000-0000-7000-8000-000000000001';
  const orgB = '0192a000-0000-7000-8000-000000000002';
  const workspaceA = '0192a000-0000-7000-8000-000000000003';
  const workflowA = '0192a000-0000-7000-8000-000000000004';
  const instanceA = '0192a000-0000-7000-8000-000000000005';
  const instanceB = '0192a000-0000-7000-8000-000000000006';

  const fullDag: WorkflowDag = {
    nodes: [
      {
        id: 't-1',
        type: 'trigger',
        label: 'Document Created',
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: 'c-1',
        type: 'condition',
        label: 'Value > 10000',
        config: { field: 'totalValue', operator: 'gt', value: 10000 },
        position: { x: 200, y: 0 },
      },
      {
        id: 'a-vip',
        type: 'action',
        label: 'VIP Notification',
        config: { actionType: 'send_notification', recipientEmail: 'manager@org.com' },
        position: { x: 400, y: -50 },
      },
      { id: 'e-1', type: 'end', label: 'Done', config: {}, position: { x: 600, y: 0 } },
    ],
    edges: [
      { id: 'e1', source: 't-1', target: 'c-1' },
      { id: 'e2', source: 'c-1', target: 'a-vip', sourceHandle: 'true', label: 'yes' },
      { id: 'e3', source: 'a-vip', target: 'e-1' },
    ],
  };

  let inMemoryDefinitions: any[] = [];
  let inMemoryInstances: any[] = [];
  let inMemoryExecutions: any[] = [];

  beforeEach(() => {
    inMemoryDefinitions = [
      {
        id: workflowA,
        organizationId: orgA,
        workspaceId: workspaceA,
        name: 'Enterprise Contract Approval Flow',
        triggerEvent: 'document.created',
        dag: fullDag,
        status: 'active',
        version: 1,
        maxInstances: 1000,
        createdBy: 'user-admin-1',
      },
    ];

    inMemoryInstances = [
      {
        id: instanceA,
        organizationId: orgA,
        workflowId: workflowA,
        triggerPayload: { documentId: 'doc-1', totalValue: 50000 },
        currentNodeId: 'c-1',
        status: 'running',
        chainDepth: 1,
        visitedNodes: ['t-1', 'c-1'],
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
      {
        id: instanceB,
        organizationId: orgB,
        workflowId: 'wf-org-b',
        triggerPayload: { documentId: 'doc-org-b' },
        currentNodeId: 't-1',
        status: 'running',
        chainDepth: 0,
        visitedNodes: ['t-1'],
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
    ];

    inMemoryExecutions = [];

    mockRepo = {
      createDefinition: jest.fn().mockImplementation((orgId, userId, dto) => {
        const def = {
          id: 'wf-new-1',
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          triggerEvent: dto.triggerEvent,
          dag: dto.dag,
          status: 'draft',
          version: 1,
          maxInstances: dto.maxInstances || 1000,
          createdBy: userId,
        };
        inMemoryDefinitions.push(def);
        return Promise.resolve(def);
      }),
      findDefinitionById: jest.fn().mockImplementation((id, orgId) => {
        const found = inMemoryDefinitions.find(
          (d) => d.id === id && (!orgId || d.organizationId === orgId),
        );
        return Promise.resolve(found || null);
      }),
      findDefinitions: jest.fn().mockImplementation((orgId, _options) => {
        const filtered = inMemoryDefinitions.filter((d) => d.organizationId === orgId);
        return Promise.resolve({ items: filtered, nextCursor: null, hasMore: false });
      }),
      findActiveByTriggerEvent: jest.fn().mockImplementation((orgId, triggerEvent) => {
        const matching = inMemoryDefinitions.filter(
          (d) =>
            d.organizationId === orgId && d.triggerEvent === triggerEvent && d.status === 'active',
        );
        return Promise.resolve(matching);
      }),
      createInstance: jest.fn().mockImplementation((orgId, workflowId, payload) => {
        const inst = {
          id: 'inst-new-' + inMemoryInstances.length,
          organizationId: orgId,
          workflowId,
          triggerPayload: payload,
          currentNodeId: null,
          status: 'running',
          chainDepth: 0,
          visitedNodes: [],
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
        };
        inMemoryInstances.push(inst);
        return Promise.resolve(inst);
      }),
      findInstanceById: jest.fn().mockImplementation((id, orgId) => {
        const found = inMemoryInstances.find(
          (i) => i.id === id && (!orgId || i.organizationId === orgId),
        );
        if (!found) return Promise.resolve(null);
        return Promise.resolve({
          ...found,
          nodeExecutions: inMemoryExecutions.filter((ne) => ne.instanceId === id),
        });
      }),
      findInstances: jest.fn().mockImplementation((orgId, _options) => {
        const filtered = inMemoryInstances.filter((i) => i.organizationId === orgId);
        return Promise.resolve({ items: filtered, nextCursor: null, hasMore: false });
      }),
      updateInstance: jest.fn().mockImplementation((id, orgId, data) => {
        const found = inMemoryInstances.find(
          (i) => i.id === id && (!orgId || i.organizationId === orgId),
        );
        if (found) {
          Object.assign(found, data);
        }
        return Promise.resolve(found);
      }),
      createNodeExecution: jest.fn().mockImplementation((orgId, instanceId, data) => {
        const ne = {
          id: 'exec-' + inMemoryExecutions.length,
          organizationId: orgId,
          instanceId,
          nodeId: data.nodeId,
          nodeType: data.nodeType,
          input: data.input,
          status: 'running',
          createdAt: new Date(),
        };
        inMemoryExecutions.push(ne);
        return Promise.resolve(ne);
      }),
      updateNodeExecution: jest.fn().mockImplementation((id, _orgId, data) => {
        const found = inMemoryExecutions.find((ne) => ne.id === id);
        if (found) {
          Object.assign(found, data);
        }
        return Promise.resolve(found);
      }),
      countActiveDefinitions: jest.fn().mockResolvedValue(1),
      getExecutionMetrics: jest.fn().mockImplementation((orgId) => {
        const orgInstances = inMemoryInstances.filter((i) => i.organizationId === orgId);
        return Promise.resolve({
          totalTriggered: orgInstances.length,
          totalCompleted: orgInstances.filter((i) => i.status === 'completed').length,
          totalFailed: orgInstances.filter((i) => i.status === 'failed').length,
          totalHalted: orgInstances.filter((i) => i.status === 'halted').length,
          activeWorkflowsCount: inMemoryDefinitions.filter(
            (d) => d.organizationId === orgId && d.status === 'active',
          ).length,
        });
      }),
    };

    nodeExecutor = new WorkflowNodeExecutor();
    engineService = new WorkflowEngineService(
      mockRepo as unknown as WorkflowRepository,
      nodeExecutor,
    );
    const mockPrisma: any = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: orgA, planTier: 'enterprise' }),
      },
    };
    definitionService = new WorkflowDefinitionService(
      mockRepo as unknown as WorkflowRepository,
      mockPrisma,
    );
    instanceService = new WorkflowInstanceService(
      mockRepo as unknown as WorkflowRepository,
      engineService,
    );
  });

  describe('1. Role-Based Access Control (CASL Matrix)', () => {
    it('Admin can manage WorkflowDefinition and WorkflowInstance', async () => {
      const ability = AbilityFactory.createForUser('admin', { id: 'admin-1' });
      expect(ability.can('create', 'WorkflowDefinition')).toBe(true);
      expect(ability.can('manage', 'WorkflowDefinition')).toBe(true);
      expect(ability.can('manage', 'WorkflowInstance')).toBe(true);

      const created = await definitionService.createWorkflow(orgA, 'admin-1', {
        workspaceId: workspaceA,
        name: 'New Admin Flow',
        triggerEvent: 'document.signed',
        dag: fullDag,
      });
      expect(created.id).toBe('wf-new-1');
    });

    it('Member CANNOT create or manage WorkflowDefinition (403 boundary)', () => {
      const ability = AbilityFactory.createForUser('member', { id: 'member-1' });
      expect(ability.can('create', 'WorkflowDefinition')).toBe(false);
      expect(ability.can('manage', 'WorkflowDefinition')).toBe(false);
      expect(ability.can('read', 'WorkflowDefinition')).toBe(true);
      expect(ability.can('execute', 'WorkflowDefinition')).toBe(true);
      expect(ability.can('read', 'WorkflowInstance')).toBe(true);
    });

    it('Collaborator CANNOT read, execute, or manage workflows', () => {
      const ability = AbilityFactory.createForUser('collaborator', { id: 'collab-1' });
      expect(ability.can('read', 'WorkflowDefinition')).toBe(false);
      expect(ability.can('execute', 'WorkflowDefinition')).toBe(false);
      expect(ability.can('manage', 'WorkflowDefinition')).toBe(false);
      expect(ability.can('read', 'WorkflowInstance')).toBe(false);
    });
  });

  describe('2. Multi-Tenant RLS Isolation (Invariants I-02 & I-03)', () => {
    it('Org B cannot list or access workflow instances belonging to Org A', async () => {
      const resOrgB = await instanceService.listInstances(orgB);
      expect(resOrgB.items).toHaveLength(1);
      expect(resOrgB.items[0].id).toBe(instanceB);

      const resOrgA = await instanceService.listInstances(orgA);
      expect(resOrgA.items).toHaveLength(1);
      expect(resOrgA.items[0].id).toBe(instanceA);
    });

    it('Org B querying instance of Org A throws NotFoundException', async () => {
      await expect(instanceService.getInstance(instanceA, orgB)).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. End-to-End DAG Execution Flow', () => {
    it('triggers workflow, processes condition, executes action, and completes instance', async () => {
      const triggeredIds = await engineService.triggerWorkflow('document.created', orgA, {
        documentId: 'doc-e2e',
        totalValue: 75000,
        recipientEmail: 'vip@client.com',
      });

      expect(triggeredIds).toHaveLength(1);
      const newInstId = triggeredIds[0];

      // Process trigger node -> moves to c-1
      await engineService.processNode(newInstId, 't-1', orgA);

      // Process condition node (totalValue: 75000 > 10000 -> true) -> moves to a-vip
      await engineService.processNode(newInstId, 'c-1', orgA);

      // Process action node -> moves to e-1
      await engineService.processNode(newInstId, 'a-vip', orgA);

      // Process end node -> marks completed
      await engineService.processNode(newInstId, 'e-1', orgA);

      const finishedInstance = await instanceService.getInstance(newInstId, orgA);
      expect(finishedInstance.status).toBe('completed');
    });

    it('sets instance status to failed when unhandled node error occurs', async () => {
      // Missing node in DAG
      await engineService.processNode(instanceA, 'non-existent-node', orgA);

      const updated = await instanceService.getInstance(instanceA, orgA);
      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toContain('not found in workflow DAG');
    });
  });

  describe('4. Administrative Interventions: Resume, Halt, Skip', () => {
    it('halts a running instance when requested by administrator', async () => {
      const result = await instanceService.haltInstance(instanceA, orgA);
      expect(result.success).toBe(true);

      const updated = await instanceService.getInstance(instanceA, orgA);
      expect(updated.status).toBe('halted');
      expect(updated.errorMessage).toContain('Manually halted');
    });

    it('resumes a halted instance from its current node', async () => {
      // First halt the running instance
      await instanceService.haltInstance(instanceA, orgA);

      const resumeResult = await instanceService.resumeInstance(instanceA, orgA);
      expect(resumeResult.success).toBe(true);

      const updated = await instanceService.getInstance(instanceA, orgA);
      // In inline execution, resuming executes to completion
      expect(['running', 'completed']).toContain(updated.status);
    });

    it('skips a stuck node and continues to downstream nodes', async () => {
      const skipResult = await instanceService.skipNode(instanceA, orgA, 'c-1');
      expect(skipResult.success).toBe(true);
      expect(skipResult.message).toContain('Downstream nodes enqueued');
    });

    it('throws BadRequestException when attempting to resume an already running instance', async () => {
      // instanceA is currently running
      await expect(instanceService.resumeInstance(instanceA, orgA)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('5. Visibility Dashboard Metrics', () => {
    it('returns aggregated metrics for organization workflows', async () => {
      const metrics = await instanceService.getMetrics(orgA);
      expect(metrics.totalTriggered).toBeGreaterThanOrEqual(1);
      expect(metrics.activeWorkflowsCount).toBe(1);
    });
  });
});
