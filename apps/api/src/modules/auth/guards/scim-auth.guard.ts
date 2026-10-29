import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  private readonly logger = new Logger(ScimAuthGuard.name);

  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    const expectedApiKey = process.env.SCIM_API_KEY || 'test_scim_api_key';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('SCIM request rejected: missing Bearer token');
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '401',
          detail: 'Unauthorized: Missing or invalid SCIM Bearer token.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.substring(7).trim();

    if (token !== expectedApiKey) {
      this.logger.warn('SCIM request rejected: invalid API key');
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '401',
          detail: 'Unauthorized: Invalid SCIM API key.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Capture organization ID from header or CLS context
    const orgId =
      (request.headers['x-organization-id'] as string) ||
      this.cls.get<string>('organizationId') ||
      'default-org-id';

    this.cls.set('organizationId', orgId);

    return true;
  }
}
