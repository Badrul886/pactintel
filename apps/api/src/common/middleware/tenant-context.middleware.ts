import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { isValidUuid } from '@pactintel/shared-utils';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 1. Check for organization context header (used by internal routing/API consumers)
    const orgHeader = req.headers['x-organization-id'] as string;

    // 2. Or from authenticated user session attached by upstream middleware/gateways
    const user = (req as Request & { user?: { organizationId?: string } }).user;
    const orgId = orgHeader || user?.organizationId;

    if (orgId) {
      if (!isValidUuid(orgId)) {
        throw new BadRequestException({
          code: 'INVALID_TENANT_ID',
          message: 'The provided x-organization-id must be a valid UUID.',
        });
      }
      this.cls.set('organizationId', orgId);
      res.setHeader('x-organization-id', orgId);
    }

    // 3. Check for workspace context header (Sprint 3.8 - RULE AUTH-003)
    const wsHeader = (req.headers['x-workspace-id'] || req.headers['x-workspace']) as string;
    const userWorkspace = (req as Request & { user?: { workspaceId?: string } }).user?.workspaceId;
    const workspaceId = wsHeader || userWorkspace;

    if (workspaceId) {
      if (!isValidUuid(workspaceId)) {
        throw new BadRequestException({
          code: 'INVALID_WORKSPACE_ID',
          message: 'The provided x-workspace-id must be a valid UUID.',
        });
      }
      this.cls.set('workspaceId', workspaceId);
      res.setHeader('x-workspace-id', workspaceId);
    }

    next();
  }
}
