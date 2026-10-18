import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { AbilityFactory } from '../../modules/organization/casl/ability.factory';
import { UserRole } from '@pactintel/shared-types';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type Subject =
  'Document' | 'User' | 'Organization' | 'Workspace' | 'Payment' | 'Signature' | 'Billing' | 'all';

export interface RequiredRule {
  action: Action;
  subject: Subject;
}

export const CHECK_POLICIES_KEY = 'check_policy';
export const CheckPolicies = (...handlers: RequiredRule[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

@Injectable()
export class CaslGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rules =
      this.reflector.get<RequiredRule[]>(CHECK_POLICIES_KEY, context.getHandler()) || [];

    if (rules.length === 0) {
      return true; // No explicit policy on route
    }

    const role = this.cls.get<string>('userRole') as UserRole | undefined;
    if (!role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'No role found in current execution context.',
      });
    }

    const ability = AbilityFactory.createForUser(role);

    for (const rule of rules) {
      if (!ability.can(rule.action, rule.subject)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: `Role '${role}' is not permitted to perform '${rule.action}' on '${rule.subject}'.`,
        });
      }
    }

    return true;
  }
}
