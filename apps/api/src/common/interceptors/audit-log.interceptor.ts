import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // Only audit mutating actions
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!isMutation) {
      return next.handle();
    }

    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const path = req.path;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);

    return next.handle().pipe(
      tap(() => {
        if (orgId) {
          this.logger.log(
            `[Audit] Org: ${orgId} | User: ${userId || 'anonymous'} | Action: ${method} ${path} | IP: ${ip}`,
          );
        }
      }),
    );
  }
}
