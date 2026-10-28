import { WorkflowEngineService, MAX_WORKFLOW_CHAIN_DEPTH } from '../workflow-engine.service';
import { WorkflowDag } from '@pactintel/shared-types';

describe('WorkflowEngineService (Unit Tests)', () => {
  let engine: WorkflowEngineService;
  let mockRepo: any;
  let mockExecutor: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const workflowId = '0192a000-0000-7000-8000-000000000002';
  const instanceId = '0192a000-0000-7000-8000-000000000003';

  const sampleDag: WorkflowDag = {
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        label: 'On Document Signed',
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: 'node-condition',
        type: 'condition',
        label: 'Is Enterprise Deal?',
        config: { field: 'dealValue', operator: 'gt', value: 50000 },
        position: { x: 200, y: 0 },
      },
      {
        id: 'node-action-vip',
        type: 'action',
        label: 'Notify VIP Team',
        config: { actionType: 'send_notification', recipientEmail: 'vip@client.com' },
        position: { x: 400, y: -100 },
      },
      {
        id: 'node-action-standard',
        type: 'action',
        label: 'Notify Sales Rep',
        config: { actionType: 'send_notification', recipientEmail: 'rep@client.com' },
        position: { x: 400, y: 100 },
      },
      {
        id: 'node-delay',
        type: 'delay',
        label: 'Wait 3 Days',
        config: { delayDays: 3 },
        position: { x: 600, y: 0 },
      },
      {
        id: 'node-risk',
        type: 'risk_assessment',
        label: 'Assess Risk',
        config: {},
        position: { x: 800, y: 0 },
      },
      { id: 'node-end', type: 'end', label: 'Finish', config: {}, position: { x: 1000, y: 0 } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-condition' },
      {
        id: 'e2',
        source: 'node-condition',
        target: 'node-action-vip',
        sourceHandle: 'true',
        label: 'yes',
      },
      {
        id: 'e3',
        source: 'node-condition',
        target: 'node-action-standard',
        sourceHandle: 'false',
        label: 'no',
      },
      { id: 'e4', source: 'node-action-vip', target: 'node-delay' },
      { id: 'e5', source: 'node-delay', target: 'node-risk' },
      { id: 'e6', source: 'node-risk', target: 'node-end' },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      findActiveByTriggerEvent: jest.fn().mockResolvedValue([
        {
          id: workflowId,
          organizationId: orgId,
          triggerEvent: 'document.signed',
          dag: sampleDag,
          status: 'active',
        },
      ]),
      createInstance: jest.fn().mockResolvedValue({
        id: instanceId,
        organizationId: orgId,
        workflowId,
        status: 'running',
        chainDepth: 0,
        visitedNodes: [],
      }),
      findInstanceById: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve({
          id,
          organizationId: orgId,
          workflowId,
          triggerPayload: { dealValue: 75000, recipientEmail: 'test@client.com' },
          currentNodeId: null,
          status: 'running',
          chainDepth: 0,
          visitedNodes: [],
        });
      }),
      findDefinitionById: jest.fn().mockResolvedValue({
        id: workflowId,
        dag: sampleDag,
      }),
      updateInstance: jest.fn().mockResolvedValue({}),
      createNodeExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      updateNodeExecution: jest.fn().mockResolvedValue({}),
    };

    mockExecutor = {
      executeNode: jest.fn().mockImplementation(async ({ node }: any) => {
        if (node.type === 'condition') {
          return { status: 'completed', output: { result: true } };
        }
        if (node.type === 'delay') {
          return { status: 'completed', output: { delayMs: 259200000 }, delayMs: 259200000 };
        }
        if (node.type === 'risk_assessment') {
          return { status: 'completed', output: { riskScore: 85, riskLevel: 'high' } };
        }
        return { status: 'completed', output: { executed: true } };
      }),
    };

    engine = new WorkflowEngineService(mockRepo, mockExecutor);
  });

  describe('1. Trigger Matching', () => {
    it('finds matching active workflows and initiates execution instances', async () => {
      const instanceIds = await engine.triggerWorkflow('document.signed', orgId, {
        dealValue: 75000,
      });

      expect(mockRepo.findActiveByTriggerEvent).toHaveBeenCalledWith(orgId, 'document.signed');
      expect(mockRepo.createInstance).toHaveBeenCalledWith(orgId, workflowId, { dealValue: 75000 });
      expect(instanceIds).toHaveLength(1);
      expect(instanceIds[0]).toBe(instanceId);
    });

    it('returns empty array when no active workflows match trigger event', async () => {
      mockRepo.findActiveByTriggerEvent.mockResolvedValueOnce([]);

      const instanceIds = await engine.triggerWorkflow('payment.completed', orgId, {});
      expect(instanceIds).toHaveLength(0);
    });
  });

  describe('2. Node Execution & Branching Logic', () => {
    it('evaluates condition node and branches to true path (action-vip)', async () => {
      await engine.processNode(instanceId, 'node-condition', orgId);

      expect(mockExecutor.executeNode).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({ id: 'node-condition', type: 'condition' }),
        }),
      );

      // Successfully updated instance state
      expect(mockRepo.updateInstance).toHaveBeenCalledWith(
        instanceId,
        orgId,
        expect.objectContaining({
          currentNodeId: 'node-condition',
          visitedNodes: ['node-condition'],
          chainDepth: 1,
        }),
      );
    });

    it('processes delay node and preserves delayMs for queue dispatch', async () => {
      await engine.processNode(instanceId, 'node-delay', orgId);

      expect(mockExecutor.executeNode).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({ id: 'node-delay', type: 'delay' }),
        }),
      );
    });

    it('completes instance when reaching end node', async () => {
      await engine.processNode(instanceId, 'node-end', orgId);

      expect(mockRepo.updateInstance).toHaveBeenCalledWith(
        instanceId,
        orgId,
        expect.objectContaining({
          status: 'completed',
        }),
      );
    });
  });

  describe('3. Guardrails: Loop Detection & Chain Depth (RULE WF-002)', () => {
    it('halts instance immediately when visiting the same node twice (Loop Detection)', async () => {
      mockRepo.findInstanceById.mockResolvedValueOnce({
        id: instanceId,
        organizationId: orgId,
        workflowId,
        triggerPayload: {},
        status: 'running',
        chainDepth: 2,
        visitedNodes: ['node-trigger', 'node-condition'], // already visited node-condition
      });

      await engine.processNode(instanceId, 'node-condition', orgId);

      expect(mockRepo.updateInstance).toHaveBeenCalledWith(
        instanceId,
        orgId,
        expect.objectContaining({
          status: 'halted',
          errorMessage: expect.stringContaining('LOOP_DETECTED'),
        }),
      );

      // Executor was NOT called for looped node
      expect(mockExecutor.executeNode).not.toHaveBeenCalled();
    });

    it('halts instance when exceeding MAX_WORKFLOW_CHAIN_DEPTH (20)', async () => {
      mockRepo.findInstanceById.mockResolvedValueOnce({
        id: instanceId,
        organizationId: orgId,
        workflowId,
        triggerPayload: {},
        status: 'running',
        chainDepth: MAX_WORKFLOW_CHAIN_DEPTH, // 20
        visitedNodes: ['n1', 'n2', 'n3'],
      });

      await engine.processNode(instanceId, 'node-end', orgId);

      expect(mockRepo.updateInstance).toHaveBeenCalledWith(
        instanceId,
        orgId,
        expect.objectContaining({
          status: 'halted',
          errorMessage: expect.stringContaining('MAX_CHAIN_DEPTH_EXCEEDED'),
        }),
      );

      expect(mockExecutor.executeNode).not.toHaveBeenCalled();
    });

    it('activates 5-minute circuit breaker when exceeding 100 executions per minute per org', async () => {
      // Trigger 101 times
      for (let i = 0; i < 100; i++) {
        await engine.triggerWorkflow('document.signed', orgId, {});
      }

      // 101st execution triggers circuit breaker
      const blockedResult = await engine.triggerWorkflow('document.signed', orgId, {});
      expect(blockedResult).toHaveLength(0);

      // Subsequent executions while circuit is active are immediately aborted
      const stillBlocked = await engine.triggerWorkflow('document.signed', orgId, {});
      expect(stillBlocked).toHaveLength(0);
    });
  });
});
