import { AutomationExecutor } from '../automation.executor';
import { AutomationRepository } from '../automation.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationRuleDto } from '@pactintel/shared-types';

describe('Automation Loop Detection & Circuit Breaker (RULE WF-002)', () => {
  let executor: AutomationExecutor;
  let mockRepo: Partial<Record<keyof AutomationRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const ruleId = '0192a000-0000-7000-8000-000000000002';
  const chainId = '0192a000-0000-7000-8000-000000000003';

  const sampleRule: AutomationRuleDto = {
    id: ruleId,
    organizationId: orgId,
    workspaceId: '0192a000-0000-7000-8000-000000000004',
    name: 'Auto Tag & Notify',
    triggerEvent: 'document.signed',
    isActive: true,
    conditions: [],
    actions: [
      {
        type: 'send_notification',
        config: { title: 'Signed', message: 'Ready' },
      },
    ],
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  beforeEach(() => {
    mockRepo = {
      incrementExecutionCount: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      auditLogEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      },
    };

    executor = new AutomationExecutor(
      mockRepo as unknown as AutomationRepository,
      mockPrisma as PrismaService,
    );
  });

  it('Test 1: execution at chainDepth=5 -> skipped with loop detection warning (WF-002)', async () => {
    const result = await executor.execute(
      sampleRule,
      { documentId: 'doc-123' },
      {
        chainDepth: 5, // Depth 5 triggers loop prevention
        chainId,
        organizationId: orgId,
      },
    );

    expect(result.executed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('max_chain_depth');
    expect(mockRepo.incrementExecutionCount).not.toHaveBeenCalled();
  });

  it('Test 2: execution at chainDepth=4 -> proceeds normally', async () => {
    const result = await executor.execute(
      sampleRule,
      { documentId: 'doc-123' },
      {
        chainDepth: 4, // Below max depth of 5
        chainId,
        organizationId: orgId,
      },
    );

    expect(result.executed).toBe(true);
    expect(result.actionsExecuted).toBe(1);
    expect(mockRepo.incrementExecutionCount).toHaveBeenCalledWith(ruleId);
  });

  it('Test 3: >100 executions/min -> circuit breaker opens, executions paused 5 min (WF-002)', async () => {
    // Simulate 100 successful executions
    for (let i = 0; i < 100; i++) {
      const res = await executor.execute(
        sampleRule,
        { documentId: 'doc-123' },
        { chainDepth: 0, chainId: `chain-${i}`, organizationId: orgId },
      );
      expect(res.executed).toBe(true);
    }

    // 101st execution should trip the circuit breaker
    const tripResult = await executor.execute(
      sampleRule,
      { documentId: 'doc-123' },
      { chainDepth: 0, chainId: 'chain-101', organizationId: orgId },
    );

    expect(tripResult.executed).toBe(false);
    expect(tripResult.skipped).toBe(true);
    expect(tripResult.reason).toBe('rate_limit_exceeded');

    // Subsequent execution while circuit breaker is active should be paused
    const subsequentResult = await executor.execute(
      sampleRule,
      { documentId: 'doc-123' },
      { chainDepth: 0, chainId: 'chain-102', organizationId: orgId },
    );

    expect(subsequentResult.executed).toBe(false);
    expect(subsequentResult.skipped).toBe(true);
    expect(subsequentResult.reason).toBe('circuit_breaker_paused');
  });
});
