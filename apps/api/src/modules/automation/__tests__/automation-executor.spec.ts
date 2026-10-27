import { AutomationExecutor } from '../automation.executor';
import { AutomationRepository } from '../automation.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationRuleDto } from '@pactintel/shared-types';

describe('AutomationExecutor Unit Tests (Conditions, Fault Isolation I-12, & Webhooks)', () => {
  let executor: AutomationExecutor;
  let mockRepo: Partial<Record<keyof AutomationRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const ruleId = '0192a000-0000-7000-8000-000000000002';

  beforeEach(() => {
    mockRepo = {
      incrementExecutionCount: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      auditLogEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      },
      followUpQueue: {
        create: jest.fn().mockResolvedValue({ id: 'follow-1' }),
      },
    };

    executor = new AutomationExecutor(
      mockRepo as unknown as AutomationRepository,
      mockPrisma as PrismaService,
    );
  });

  it('Test 1: conditions evaluated: matching condition executes actions, non-matching does not', async () => {
    const conditionalRule: AutomationRuleDto = {
      id: ruleId,
      organizationId: orgId,
      workspaceId: 'ws-1',
      name: 'High Deal Value Filter',
      triggerEvent: 'document.signed',
      isActive: true,
      conditions: [{ field: 'dealValue', operator: 'gt', value: 10000 }],
      actions: [{ type: 'update_document_tag', config: { tag: 'vip-deal' } }],
      executionCount: 0,
      lastExecutedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    // Case 1A: Non-matching payload (dealValue = 5000 <= 10000)
    const nonMatchingResult = await executor.execute(
      conditionalRule,
      { documentId: 'doc-1', dealValue: 5000 },
      { chainDepth: 0, chainId: 'chain-1', organizationId: orgId },
    );

    expect(nonMatchingResult.executed).toBe(false);
    expect(nonMatchingResult.reason).toBe('conditions_unmatched');
    expect(mockRepo.incrementExecutionCount).not.toHaveBeenCalled();

    // Case 1B: Matching payload (dealValue = 25000 > 10000)
    const matchingResult = await executor.execute(
      conditionalRule,
      { documentId: 'doc-1', dealValue: 25000 },
      { chainDepth: 0, chainId: 'chain-2', organizationId: orgId },
    );

    expect(matchingResult.executed).toBe(true);
    expect(matchingResult.actionsExecuted).toBe(1);
    expect(mockRepo.incrementExecutionCount).toHaveBeenCalledWith(ruleId);
  });

  it('Test 2: action 2 throws -> action 3 still runs (fault isolation, Invariant I-12)', async () => {
    // We spy on executeAction to make action #2 throw
    const executeActionSpy = jest.spyOn(executor as any, 'executeAction');
    executeActionSpy
      .mockResolvedValueOnce(undefined) // Action 1 succeeds
      .mockRejectedValueOnce(new Error('Downstream webhook timeout')) // Action 2 fails!
      .mockResolvedValueOnce(undefined); // Action 3 succeeds

    const multiActionRule: AutomationRuleDto = {
      id: ruleId,
      organizationId: orgId,
      workspaceId: 'ws-1',
      name: 'Multi-Step Pipeline',
      triggerEvent: 'document.signed',
      isActive: true,
      conditions: [],
      actions: [
        { type: 'update_document_tag', config: { tag: 'step-1' } },
        { type: 'trigger_webhook', config: { url: 'https://flaky-service.com/api' } },
        { type: 'update_document_tag', config: { tag: 'step-3' } },
      ],
      executionCount: 0,
      lastExecutedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    const result = await executor.execute(
      multiActionRule,
      { documentId: 'doc-1' },
      { chainDepth: 0, chainId: 'chain-3', organizationId: orgId },
    );

    // Rule completes execution, 2 out of 3 actions succeeded
    expect(result.executed).toBe(true);
    expect(result.actionsExecuted).toBe(2);
    expect(executeActionSpy).toHaveBeenCalledTimes(3); // All 3 actions were invoked
    expect(mockRepo.incrementExecutionCount).toHaveBeenCalledWith(ruleId);
  });

  it('Test 3: document.signed event -> triggers configured webhook action (Invariant I-06)', async () => {
    const webhookRule: AutomationRuleDto = {
      id: ruleId,
      organizationId: orgId,
      workspaceId: 'ws-1',
      name: 'Webhook Dispatcher',
      triggerEvent: 'document.signed',
      isActive: true,
      conditions: [],
      actions: [
        {
          type: 'trigger_webhook',
          config: { url: 'https://enterprise-crm.com/webhooks/signed' },
        },
      ],
      executionCount: 0,
      lastExecutedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    const payload = {
      documentId: 'doc-enterprise-1',
      signedAt: '2026-10-24T18:00:00Z',
      recipientEmail: 'ceo@partner.com',
    };

    const result = await executor.execute(webhookRule, payload, {
      chainDepth: 0,
      chainId: 'chain-4',
      organizationId: orgId,
    });

    expect(result.executed).toBe(true);
    expect(result.actionsExecuted).toBe(1);
    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgId,
          eventType: 'webhook.delivery.requested',
          payload: expect.objectContaining({
            webhookUrl: 'https://enterprise-crm.com/webhooks/signed',
            eventPayload: payload,
          }),
        }),
      }),
    );
  });
});
