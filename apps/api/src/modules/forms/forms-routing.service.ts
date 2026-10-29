import { Injectable, Logger } from '@nestjs/common';
import { FormsRepository } from './forms.repository';
import { FormsMagicLinkService } from './forms-magic-link.service';
import { NotificationService } from '../notification/notification.service';
import { FormRoleDefinition, FormRoutingRule } from '@pactintel/shared-types';

@Injectable()
export class FormsRoutingService {
  private readonly logger = new Logger(FormsRoutingService.name);

  constructor(
    private readonly formsRepo: FormsRepository,
    private readonly magicLinkService: FormsMagicLinkService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Evaluates answer-based routing rules AST against submission answers.
   */
  async evaluateRoutingRules(
    organizationId: string,
    rules: FormRoutingRule[] = [],
    data: Record<string, unknown>,
    formName: string,
  ): Promise<{ triggeredCount: number; matchedActions: string[] }> {
    const matchedActions: string[] = [];

    for (const rule of rules) {
      const fieldValue = data[rule.condition.fieldId];
      const targetValue = rule.condition.value;
      let matched = false;

      switch (rule.condition.operator) {
        case 'equals':
          matched = String(fieldValue) === String(targetValue);
          break;
        case 'not_equals':
          matched = String(fieldValue) !== String(targetValue);
          break;
        case 'contains':
          matched =
            typeof fieldValue === 'string' &&
            fieldValue.toLowerCase().includes(String(targetValue).toLowerCase());
          break;
        case 'greater_than':
          matched = Number(fieldValue) > Number(targetValue);
          break;
        case 'less_than':
          matched = Number(fieldValue) < Number(targetValue);
          break;
      }

      if (matched) {
        matchedActions.push(`${rule.action.type}:${rule.action.target}`);
        this.logger.log(
          `Routing rule triggered: ${rule.id} -> ${rule.action.type}:${rule.action.target}`,
        );

        if (rule.action.type === 'notify_email') {
          try {
            await this.notificationService.notifyUser(rule.action.target, organizationId, {
              title: `Form Routing Alert: ${formName}`,
              body: `A submission matched routing rule ${rule.id}.`,
              eventType: 'form_routing_alert',
            });
          } catch (err: any) {
            this.logger.warn(`Failed to dispatch routing notification email: ${err.message}`);
          }
        }
      }
    }

    return { triggeredCount: matchedActions.length, matchedActions };
  }

  /**
   * Advances multi-role form workflow.
   * If further roles exist, creates magic link and notifies next role.
   * If final role, marks complete.
   */
  async advanceRole(params: {
    organizationId: string;
    form: {
      id: string;
      name: string;
      slug: string;
      roles?: FormRoleDefinition[];
      definition?: any;
    };
    submission: {
      id: string;
      currentRole?: string | null;
      data: any;
      submitterEmail?: string | null;
    };
    newAnswers: Record<string, unknown>;
  }): Promise<{ completed: boolean; nextRole?: string; magicLinkToken?: string }> {
    const mergedData = {
      ...(typeof params.submission.data === 'object' && params.submission.data !== null
        ? params.submission.data
        : {}),
      ...params.newAnswers,
    };

    const roles: FormRoleDefinition[] = (params.form.roles || []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    // If no roles or single role form
    if (roles.length <= 1) {
      await this.formsRepo.updateSubmission(params.organizationId, params.submission.id, {
        data: mergedData,
        status: 'complete',
        currentRole: null,
        submittedAt: new Date(),
      });

      // Evaluate routing rules
      const rules: FormRoutingRule[] = params.form.definition?.routingRules || [];
      await this.evaluateRoutingRules(params.organizationId, rules, mergedData, params.form.name);

      return { completed: true };
    }

    // Determine current role index
    const currentRoleName = params.submission.currentRole;
    let nextIndex = 0;
    if (currentRoleName) {
      const currentIndex = roles.findIndex((r) => r.roleName === currentRoleName);
      nextIndex = currentIndex >= 0 ? currentIndex + 1 : roles.length;
    } else {
      nextIndex = 1; // Role 0 just finished
    }

    // If there is another role
    if (nextIndex < roles.length) {
      const nextRole = roles[nextIndex];

      const { token } = await this.magicLinkService.createMagicLink({
        organizationId: params.organizationId,
        formId: params.form.id,
        submissionId: params.submission.id,
        roleName: nextRole.roleName,
      });

      await this.formsRepo.updateSubmission(params.organizationId, params.submission.id, {
        data: mergedData,
        status: 'partial',
        currentRole: nextRole.roleName,
      });

      // Recipient for next role: routingEmail or dynamic email from fields
      const recipientEmail =
        nextRole.routingEmail ||
        (mergedData[`${nextRole.roleName.toLowerCase()}_email`] as string) ||
        (mergedData['manager_email'] as string) ||
        params.submission.submitterEmail;

      if (recipientEmail) {
        try {
          await this.notificationService.notifyUser(recipientEmail, params.organizationId, {
            title: `Action Required: ${params.form.name} (${nextRole.roleName})`,
            body: `Please review and complete your section for form ${params.form.name}.`,
            eventType: 'form_role_invite',
            resourceType: 'form',
            resourceId: params.form.id,
          });
        } catch (err: any) {
          this.logger.warn(`Failed to notify next role recipient: ${err.message}`);
        }
      }

      return { completed: false, nextRole: nextRole.roleName, magicLinkToken: token };
    }

    // All roles finished -> complete
    await this.formsRepo.updateSubmission(params.organizationId, params.submission.id, {
      data: mergedData,
      status: 'complete',
      currentRole: null,
      submittedAt: new Date(),
    });

    const rules: FormRoutingRule[] = params.form.definition?.routingRules || [];
    await this.evaluateRoutingRules(params.organizationId, rules, mergedData, params.form.name);

    return { completed: true };
  }
}
