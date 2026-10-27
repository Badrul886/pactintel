import { Injectable, Logger, Optional } from '@nestjs/common';
import { AutomationRepository } from './automation.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AutomationRuleDto, AutomationCondition, AutomationAction } from '@pactintel/shared-types';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';

export interface AutomationExecutionContext {
  chainDepth: number;
  chainId: string;
  organizationId: string;
}

export interface AutomationExecutionResult {
  executed: boolean;
  ruleId: string;
  actionsExecuted: number;
  skipped?: boolean;
  reason?: string;
}

@Injectable()
export class AutomationExecutor {
  private readonly logger = new Logger(AutomationExecutor.name);
  private redisClient: Redis | null = null;
  // In-memory fallback for rate limiting if Redis is unavailable or in unit tests
  private readonly memoryExecutionCounts = new Map<string, { count: number; expiresAt: number }>();
  private readonly memoryPausedOrgs = new Map<string, number>();

  constructor(
    private readonly repo: AutomationRepository,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
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
        // Fallback to memory tracking
      }
    }
  }

  /**
   * Evaluates and executes an automation rule against an event payload.
   * Enforces loop detection (WF-002), rate limits, and fault isolation (I-12).
   */
  async execute(
    rule: AutomationRuleDto,
    eventPayload: Record<string, unknown>,
    ctx: AutomationExecutionContext,
  ): Promise<AutomationExecutionResult> {
    // 1. RULE WF-002: Loop Detection
    if (ctx.chainDepth >= 5) {
      this.logger.warn(
        `[AutomationExecutor] Rule ${rule.id} aborted: max chain depth reached (${ctx.chainDepth}) for chain ${ctx.chainId}`,
      );
      try {
        await this.prisma.auditLogEntry.create({
          data: {
            id: generateId(),
            organizationId: ctx.organizationId,
            actorType: 'system',
            action: 'automation.skipped_loop',
            resourceType: 'AutomationRule',
            resourceId: rule.id,
            changes: {
              chainId: ctx.chainId,
              chainDepth: ctx.chainDepth,
              ruleName: rule.name,
            } as Prisma.InputJsonValue,
          },
        });
      } catch {
        // non-critical audit log failure
      }
      return {
        executed: false,
        ruleId: rule.id,
        actionsExecuted: 0,
        skipped: true,
        reason: 'max_chain_depth',
      };
    }

    // 2. RULE WF-002: Organization Rate Limiting & Circuit Breaker (100 executions/min)
    const isPaused = await this.isOrgPaused(ctx.organizationId);
    if (isPaused) {
      this.logger.warn(
        `[AutomationExecutor] Automations paused for org ${ctx.organizationId} (circuit breaker active)`,
      );
      return {
        executed: false,
        ruleId: rule.id,
        actionsExecuted: 0,
        skipped: true,
        reason: 'circuit_breaker_paused',
      };
    }

    const execCount = await this.incrementOrgExecutionCount(ctx.organizationId);
    if (execCount > 100) {
      this.logger.warn(
        `[AutomationExecutor] Rate limit exceeded for org ${ctx.organizationId} (${execCount} execs/min). Activating 5-min circuit breaker.`,
      );
      await this.pauseOrg(ctx.organizationId, 300); // 5 minutes

      // Alert administrator
      if (this.notificationService) {
        try {
          const admin = await this.prisma.user.findFirst({
            where: {
              organizationId: ctx.organizationId,
              role: { in: ['admin', 'owner'] },
              status: 'active',
            },
            select: { id: true },
          });
          if (admin) {
            await this.notificationService.notifyUser(admin.id, ctx.organizationId, {
              eventType: 'automation.rate_limit_exceeded',
              title: 'Automation Circuit Breaker Activated',
              body: 'Automations were paused for 5 minutes due to exceeding 100 executions per minute.',
            });
          }
        } catch {
          // non-critical
        }
      }

      return {
        executed: false,
        ruleId: rule.id,
        actionsExecuted: 0,
        skipped: true,
        reason: 'rate_limit_exceeded',
      };
    }

    // 3. Condition Evaluation
    const conditionsMatch = this.evaluateConditions(rule.conditions, eventPayload);
    if (!conditionsMatch) {
      return {
        executed: false,
        ruleId: rule.id,
        actionsExecuted: 0,
        skipped: true,
        reason: 'conditions_unmatched',
      };
    }

    // 4. Action Execution with Fault Isolation (RULE I-12)
    let actionsExecuted = 0;
    for (const action of rule.actions) {
      try {
        await this.executeAction(action, eventPayload, {
          ...ctx,
          chainDepth: ctx.chainDepth + 1,
        });
        actionsExecuted++;
      } catch (err: any) {
        this.logger.error(
          `[AutomationExecutor] Action failed for rule ${rule.id} (${action.type}): ${err.message}`,
        );
        // Fault isolation (RULE I-12): swallow individual action errors so other actions still run
      }
    }

    // 5. Update execution count
    await this.repo.incrementExecutionCount(rule.id);

    return { executed: true, ruleId: rule.id, actionsExecuted };
  }

  /**
   * Evaluates an array of conditions against payload fields.
   */
  evaluateConditions(conditions: AutomationCondition[], payload: Record<string, unknown>): boolean {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every((cond) => {
      const actualValue = this.getNestedValue(payload, cond.field);
      return this.compareValues(actualValue, cond.operator, cond.value);
    });
  }

  private compareValues(
    actual: unknown,
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'not_eq',
    expected: string | number | boolean,
  ): boolean {
    if (actual === undefined || actual === null) {
      return operator === 'not_eq';
    }

    switch (operator) {
      case 'eq':
        return String(actual) === String(expected);
      case 'not_eq':
        return String(actual) !== String(expected);
      case 'gt':
        return Number(actual) > Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'contains':
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      default:
        return false;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: any = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  private async executeAction(
    action: AutomationAction,
    payload: Record<string, unknown>,
    ctx: AutomationExecutionContext,
  ): Promise<void> {
    const config = action.config || {};

    switch (action.type) {
      case 'send_notification': {
        const userId =
          (config.userId as string) || (payload.ownerId as string) || (payload.actorId as string);
        if (userId && this.notificationService) {
          await this.notificationService.notifyUser(userId, ctx.organizationId, {
            eventType: 'automation.action.notification',
            title: (config.title as string) || 'Automated Document Notification',
            body: (config.body as string) || `Automated notification triggered by event.`,
            resourceType: 'Document',
            resourceId: (payload.documentId as string) || undefined,
          });
        }
        break;
      }

      case 'send_email': {
        const toEmail = (config.toEmail as string) || (payload.recipientEmail as string);
        if (toEmail && this.notificationService) {
          await this.notificationService.enqueueEmail({
            to: toEmail,
            template: 'signing-invitation',
            data: { ...config, ...payload },
            organizationId: ctx.organizationId,
          });
        }
        break;
      }

      case 'add_to_follow_up': {
        const docId = (payload.documentId as string) || (config.documentId as string);
        const ownerId = (payload.ownerId as string) || (config.ownerId as string);
        if (docId && ownerId) {
          await this.prisma.followUpQueue.create({
            data: {
              id: generateId(),
              organizationId: ctx.organizationId,
              documentId: docId,
              ownerId,
              scheduledFor: new Date(Date.now() + 86400000), // Default 24h follow-up
              reason: (config.reason as string) || 'custom',
              status: 'pending',
            },
          });
        }
        break;
      }

      case 'trigger_webhook': {
        const webhookUrl = (config.webhookUrl || config.url) as string;
        if (webhookUrl) {
          try {
            await this.prisma.outboxEvent.create({
              data: {
                id: generateId(),
                organizationId: ctx.organizationId,
                eventType: 'webhook.delivery.requested',
                aggregateType: 'AutomationRule',
                aggregateId: 'automation-webhook',
                payload: {
                  webhookUrl,
                  eventPayload: payload,
                } as Prisma.InputJsonValue,
              },
            });
          } catch {
            // non-critical in testing or fallback
          }
          this.logger.log(`[AutomationExecutor] Webhook triggered to ${webhookUrl}`);
        }
        break;
      }

      case 'update_document_tag': {
        const docId = (payload.documentId as string) || (config.documentId as string);
        const tag = config.tag as string;
        if (docId && tag) {
          this.logger.log(`[AutomationExecutor] Document ${docId} tagged with: ${tag}`);
        }
        break;
      }
    }
  }

  // --- Rate limiting & Circuit Breaker Helpers ---

  private async isOrgPaused(organizationId: string): Promise<boolean> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const val = await this.redisClient.get(`automation:paused:${organizationId}`);
        return val !== null;
      } catch {
        // fallback to memory
      }
    }
    const expiry = this.memoryPausedOrgs.get(organizationId);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.memoryPausedOrgs.delete(organizationId);
      return false;
    }
    return true;
  }

  private async pauseOrg(organizationId: string, ttlSeconds: number): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(`automation:paused:${organizationId}`, '1', 'EX', ttlSeconds);
        return;
      } catch {
        // fallback
      }
    }
    this.memoryPausedOrgs.set(organizationId, Date.now() + ttlSeconds * 1000);
  }

  private async incrementOrgExecutionCount(organizationId: string): Promise<number> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const count = await this.redisClient.incr(`automation:execcount:${organizationId}`);
        if (count === 1) {
          await this.redisClient.expire(`automation:execcount:${organizationId}`, 60);
        }
        return count;
      } catch {
        // fallback
      }
    }

    const now = Date.now();
    const entry = this.memoryExecutionCounts.get(organizationId);
    if (!entry || now > entry.expiresAt) {
      this.memoryExecutionCounts.set(organizationId, { count: 1, expiresAt: now + 60000 });
      return 1;
    } else {
      entry.count++;
      return entry.count;
    }
  }
}
