import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiKeyService } from './api-key.service';
import { SessionService } from './session.service';
import { SamlSsoService } from './saml-sso.service';
import { ScimService } from './scim.service';
import { ScimController } from './scim.controller';
import { ScimAuthGuard } from './guards/scim-auth.guard';
import { WorkosWebhookHandler } from './workos-webhook.handler';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentModule } from '../document/document.module';

@Module({
  imports: [DocumentModule],
  controllers: [AuthController, ScimController, WorkosWebhookHandler],
  providers: [
    AuthService,
    ApiKeyService,
    SessionService,
    SamlSsoService,
    ScimService,
    ScimAuthGuard,
    PrismaService,
  ],
  exports: [AuthService, ApiKeyService, SessionService, SamlSsoService, ScimService],
})
export class AuthModule {}
