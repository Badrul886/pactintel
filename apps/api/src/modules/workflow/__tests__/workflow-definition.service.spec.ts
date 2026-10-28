import { WorkflowDefinitionService } from '../workflow-definition.service';
import { WorkflowRepository } from '../workflow.repository';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { WorkflowDag } from '@pactintel/shared-types';

describe('WorkflowDefinitionService (Unit Tests)', () => {
  let service: WorkflowDefinitionService;
  let mockRepo: any;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const userId = '0192a000-0000-7000-8000-000000000002';
  const workspaceId = '0192a000-0000-7000-8000-000000000003';
  const workflowId = '0192a000-0000-7000-8000-000000000004';

  const validDag: WorkflowDag = {
    nodes: [
      { id: 't1', type: 'trigger', label: 'Trigger', config: {}, position: { x: 0, y: 0 } },
      { id: 'a1', type: 'action', label: 'Action', config: {}, position: { x: 200, y: 0 } },
      { id: 'e1', type: 'end', label: 'End', config: {}, position: { x: 400, y: 0 } },
    ],
    edges: [
      { id: 'edge-1', source: 't1', target: 'a1' },
      { id: 'edge-2', source: 'a1', target: 'e1' },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      createDefinition: jest.fn().mockImplementation((_orgId, _userId, dto) => {
        return Promise.resolve({
          id: workflowId,
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          triggerEvent: dto.triggerEvent,
          dag: dto.dag,
          status: 'draft',
          version: 1,
        });
      }),
      findDefinitionById: jest.fn().mockResolvedValue({
        id: workflowId,
        organizationId: orgId,
        workspaceId,
        name: 'Standard Agreement Flow',
        triggerEvent: 'document.signed',
        dag: validDag,
        status: 'draft',
        version: 1,
      }),
      updateDefinition: jest.fn().mockImplementation((id, _orgId, dto) => {
        return Promise.resolve({
          id,
          ...dto,
        });
      }),
      deleteDefinition: jest.fn().mockResolvedValue({ count: 1 }),
      countActiveDefinitions: jest.fn().mockResolvedValue(1),
    };

    mockPrisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: orgId,
          planTier: 'starter', // Starter tier: max 3 active workflows
        }),
      },
    };

    service = new WorkflowDefinitionService(mockRepo as unknown as WorkflowRepository, mockPrisma);
  });

  describe('1. DAG Validation & Cycle Detection', () => {
    it('creates workflow when DAG is valid and acyclic', async () => {
      const result = await service.createWorkflow(orgId, userId, {
        workspaceId,
        name: 'Valid Workflow',
        triggerEvent: 'document.signed',
        dag: validDag,
      });

      expect(mockRepo.createDefinition).toHaveBeenCalled();
      expect(result.id).toBe(workflowId);
    });

    it('rejects DAG creation when no trigger node is present', async () => {
      const noTriggerDag: WorkflowDag = {
        nodes: [
          { id: 'a1', type: 'action', label: 'Action', config: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      };

      await expect(
        service.createWorkflow(orgId, userId, {
          workspaceId,
          name: 'Invalid Workflow',
          triggerEvent: 'document.signed',
          dag: noTriggerDag,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects DAG creation when cycle exists (e.g. A -> B -> C -> A)', async () => {
      const cyclicDag: WorkflowDag = {
        nodes: [
          { id: 't1', type: 'trigger', label: 'Trigger', config: {}, position: { x: 0, y: 0 } },
          { id: 'n1', type: 'condition', label: 'Check 1', config: {}, position: { x: 100, y: 0 } },
          { id: 'n2', type: 'action', label: 'Action 1', config: {}, position: { x: 200, y: 0 } },
          { id: 'n3', type: 'action', label: 'Action 2', config: {}, position: { x: 300, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'n1' },
          { id: 'e2', source: 'n1', target: 'n2' },
          { id: 'e3', source: 'n2', target: 'n3' },
          { id: 'e4', source: 'n3', target: 'n1' }, // Circular edge back to n1!
        ],
      };

      await expect(
        service.createWorkflow(orgId, userId, {
          workspaceId,
          name: 'Cyclic Workflow',
          triggerEvent: 'document.signed',
          dag: cyclicDag,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Subscription Plan Limits on Activation', () => {
    it('allows workflow activation when active count is below plan limit', async () => {
      mockRepo.countActiveDefinitions.mockResolvedValueOnce(2); // 2 < 3 (starter tier limit)

      const updated = await service.updateWorkflow(workflowId, orgId, {
        status: 'active',
      });

      expect(updated.status).toBe('active');
    });

    it('rejects workflow activation with 402 WORKFLOW_LIMIT_REACHED when at limit', async () => {
      mockRepo.countActiveDefinitions.mockResolvedValue(3); // 3 >= 3 (starter limit reached!)

      await expect(
        service.updateWorkflow(workflowId, orgId, {
          status: 'active',
        }),
      ).rejects.toThrow(HttpException);

      await expect(
        service.updateWorkflow(workflowId, orgId, {
          status: 'active',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.PAYMENT_REQUIRED,
        }),
      );
    });
  });
});
