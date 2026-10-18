import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const incomingRequestId = req.headers['x-request-id'] as string;
    const requestId = incomingRequestId || `req_${generateId()}`;

    this.cls.set('requestId', requestId);
    res.setHeader('x-request-id', requestId);

    return next.handle();
  }
}
