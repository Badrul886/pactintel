import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { PrismaService } from './prisma/prisma.service';
import { pinoLoggerConfig } from './common/logging/pino.config';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { HealthController } from './common/health/health.controller';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController, MetricsInterceptor } from './common/metrics/prometheus';

// Feature Modules
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { DocumentModule } from './modules/document/document.module';
import { SigningModule } from './modules/signing/signing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationModule } from './modules/notification/notification.module';
import { TemplateModule } from './modules/template/template.module';
import { CpqModule } from './modules/cpq/cpq.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BrandKitModule } from './modules/brand-kit/brand-kit.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CustomDomainModule } from './modules/custom-domain/custom-domain.module';
import { CommentModule } from './modules/comment/comment.module';
import { ContentLockModule } from './modules/content-lock/content-lock.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AiModule } from './modules/ai/ai.module';
import { FollowUpModule } from './modules/follow-up/follow-up.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ClickwrapModule } from './modules/clickwrap/clickwrap.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule.forRoot(pinoLoggerConfig),
    AuthModule,
    OrganizationModule,
    DocumentModule,
    SigningModule,
    PaymentsModule,
    BillingModule,
    NotificationModule,
    TemplateModule,
    CpqModule,
    AnalyticsModule,
    BrandKitModule,
    IntegrationModule,
    CustomDomainModule,
    CommentModule,
    ContentLockModule,
    ApprovalModule,
    AutomationModule,
    AiModule,
    FollowUpModule,
    WebhookModule,
    ClickwrapModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
