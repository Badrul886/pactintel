import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

/**
 * Tenant Isolation Hook logic
 * Enforces Rule MT-002 & Invariant I-03.
 */
export const tenantIsolationHook = async (
  cls: ClsService,
  model: string | undefined,
  _operation: string,
  args: any,
  query: (args: any) => Promise<any>,
) => {
  const organizationId = cls.get<string>('organizationId');

  // Root tenant directory model (manifest declares rls: false)
  const isRootTenantModel = model === 'Organization';

  if (!organizationId && !isRootTenantModel) {
    throw new Error(
      `TenantContextError (RULE MT-002): An active organizationId is strictly required in ClsContext for operation on '${model}'.`,
    );
  }

  return query(args);
};

/**
 * Prisma Client Extension for Strict Tenant Isolation
 * Automatically injects tenantIsolationHook on the active connection.
 */
export const createTenantExtension = (cls: ClsService) => {
  return Prisma.defineExtension({
    name: 'tenantIsolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return tenantIsolationHook(cls, model, operation, args, query);
        },
      },
    },
  });
};
