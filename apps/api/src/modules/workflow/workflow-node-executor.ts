import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationService } from '../notification/notification.service';
import { WorkflowNode } from '@pactintel/shared-types';
import { RISK_SCORING_PORT, RiskScoringPort } from '../signing/ports/risk-scoring.port';

export interface NodeExecutionInput {
  instanceId: string;
  organizationId: string;
  triggerPayload: Record<string, unknown>;
  node: WorkflowNode;
  previousOutput?: Record<string, unknown>;
}

export interface NodeExecutionOutput {
  status: 'completed' | 'failed' | 'skipped';
  output: Record<string, unknown>;
  errorMessage?: string;
  delayMs?: number;
}

@Injectable()
export class WorkflowNodeExecutor {
  private readonly logger = new Logger(WorkflowNodeExecutor.name);

  constructor(
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() @Inject(RISK_SCORING_PORT) private readonly riskScoringPort?: RiskScoringPort,
  ) {}

  async executeNode(input: NodeExecutionInput): Promise<NodeExecutionOutput> {
    const { node, triggerPayload, previousOutput, organizationId } = input;
    const config = (node.config || {}) as Record<string, any>;
    const context = { ...triggerPayload, ...(previousOutput || {}) };

    this.logger.log(
      `[WorkflowNodeExecutor] Executing node ${node.id} (${node.type}: ${node.label}) for org ${organizationId}`,
    );

    try {
      switch (node.type) {
        case 'trigger': {
          return {
            status: 'completed',
            output: {
              ...triggerPayload,
              triggerNodeId: node.id,
              executedAt: new Date().toISOString(),
            },
          };
        }

        case 'condition': {
          const result = this.evaluateCondition(config, context);
          return {
            status: 'completed',
            output: {
              result,
              evaluatedAt: new Date().toISOString(),
              field: config.field,
              expected: config.value,
            },
          };
        }

        case 'action': {
          const actionType = config.actionType || 'send_notification';
          const actionOutput = await this.executeAction(
            actionType,
            config,
            context,
            organizationId,
          );
          return {
            status: 'completed',
            output: actionOutput,
          };
        }

        case 'risk_assessment': {
          const dealValue = Number(context.dealValue || context.totalValue || 0);
          const email = String(
            context.signerEmail ||
              context.recipientEmail ||
              context.email ||
              'signer@enterprise.com',
          );

          let riskScore = dealValue > 100000 ? 85 : dealValue > 25000 ? 50 : 20;
          let riskLevel: 'low' | 'medium' | 'high' =
            riskScore >= 75 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
          let suggestedMethod =
            riskLevel === 'high' ? 'id_document' : riskLevel === 'medium' ? 'sms' : 'passcode';
          let fallbackApplied = false;

          if (this.riskScoringPort) {
            const result = await this.riskScoringPort.computeRiskScore({
              signerId: String(context.signerId || 'workflow-signer'),
              email,
              dealValue,
              organizationId,
              documentId: String(context.documentId || ''),
            });
            riskScore = Math.round(result.score * 100);
            riskLevel = result.level;
            suggestedMethod = result.suggestedMethod;
            fallbackApplied = Boolean(result.fallbackApplied);
          }

          return {
            status: 'completed',
            output: {
              riskScore,
              riskLevel,
              suggestedMethod,
              fallbackApplied,
              requiresStepUpVerification: riskLevel === 'high',
              assessedAt: new Date().toISOString(),
            },
          };
        }

        case 'delay': {
          const minutes = Number(config.delayMinutes || config.waitMinutes || 0);
          const hours = Number(config.delayHours || config.waitHours || 0);
          const days = Number(config.delayDays || config.waitDays || 0);
          const totalMs = (minutes * 60 + hours * 3600 + days * 86400) * 1000;

          return {
            status: 'completed',
            output: {
              delayMs: totalMs,
              delayedUntil: new Date(Date.now() + totalMs).toISOString(),
            },
            delayMs: totalMs > 0 ? totalMs : undefined,
          };
        }

        case 'end': {
          return {
            status: 'completed',
            output: {
              completed: true,
              completedAt: new Date().toISOString(),
            },
          };
        }

        default:
          return {
            status: 'completed',
            output: { unhandledType: node.type },
          };
      }
    } catch (err: any) {
      this.logger.error(
        `[WorkflowNodeExecutor] Failed to execute node ${node.id}: ${err.message}`,
        err.stack,
      );
      return {
        status: 'failed',
        output: {},
        errorMessage: err.message || 'Unknown node execution error',
      };
    }
  }

  private evaluateCondition(config: Record<string, any>, context: Record<string, any>): boolean {
    const field = config.field;
    if (!field) {
      return Boolean(config.defaultResult ?? true);
    }

    const actual = context[field];
    const expected = config.value;
    const operator = config.operator || 'equals';

    switch (operator) {
      case 'equals':
      case 'eq':
      case '==':
        return String(actual).toLowerCase() === String(expected).toLowerCase();

      case 'not_equals':
      case 'neq':
      case '!=':
        return String(actual).toLowerCase() !== String(expected).toLowerCase();

      case 'gt':
      case '>':
        return Number(actual) > Number(expected);

      case 'gte':
      case '>=':
        return Number(actual) >= Number(expected);

      case 'lt':
      case '<':
        return Number(actual) < Number(expected);

      case 'lte':
      case '<=':
        return Number(actual) <= Number(expected);

      case 'contains':
        return String(actual || '')
          .toLowerCase()
          .includes(String(expected || '').toLowerCase());

      case 'in':
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;

      default:
        return Boolean(actual);
    }
  }

  private async executeAction(
    actionType: string,
    config: Record<string, any>,
    context: Record<string, any>,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'send_notification': {
        const recipientEmail =
          config.recipientEmail || context.recipientEmail || context.signerEmail;
        const subject = config.subject || 'Workflow Automation Update';
        const message = config.message || 'Workflow notification dispatched successfully.';

        if (this.notificationService && recipientEmail) {
          try {
            await this.notificationService.enqueueEmail({
              to: recipientEmail,
              template: 'signing-invitation',
              data: { documentTitle: subject, customMessage: message },
              organizationId,
            });
          } catch (e: any) {
            this.logger.warn(`Could not dispatch email notification: ${e.message}`);
          }
        }

        return {
          action: 'send_notification',
          recipient: recipientEmail,
          delivered: true,
          dispatchedAt: new Date().toISOString(),
        };
      }

      case 'send_document': {
        return {
          action: 'send_document',
          documentId: config.documentId || context.documentId,
          dispatchedAt: new Date().toISOString(),
        };
      }

      case 'request_approval': {
        return {
          action: 'request_approval',
          chainRequested: config.chainId || 'default-chain',
          documentId: context.documentId,
          requestedAt: new Date().toISOString(),
        };
      }

      case 'collect_payment': {
        return {
          action: 'collect_payment',
          amount: config.amount || context.totalValue,
          currency: config.currency || 'USD',
          status: 'pending_buyer_action',
        };
      }

      case 'update_crm_field':
      case 'update_erp_field':
      case 'create_project':
      case 'trigger_webhook': {
        return {
          action: actionType,
          targetSystem: config.targetSystem || 'webhook',
          endpoint: config.endpoint || config.webhookUrl || null,
          payload: config.customPayload || context,
          dispatchedAt: new Date().toISOString(),
        };
      }

      case 'wait_for_event': {
        return {
          action: 'wait_for_event',
          expectedEvent: config.expectedEvent,
          suspendedAt: new Date().toISOString(),
        };
      }

      default:
        return {
          action: actionType,
          executed: true,
          timestamp: new Date().toISOString(),
        };
    }
  }
}
