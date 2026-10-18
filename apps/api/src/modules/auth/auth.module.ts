import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiKeyService } from './api-key.service';
import { SessionService } from './session.service';
import { WorkosWebhookHandler } from './workos-webhook.handler';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AuthController, WorkosWebhookHandler],
  providers: [AuthService, ApiKeyService, SessionService, PrismaService],
  exports: [AuthService, ApiKeyService, SessionService],
})
export class AuthModule {}
