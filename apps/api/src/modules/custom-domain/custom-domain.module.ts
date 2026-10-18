import { Module } from '@nestjs/common';
import { CustomDomainController } from './custom-domain.controller';
import { CustomDomainService } from './custom-domain.service';
import { CustomDomainRepository } from './custom-domain.repository';
import { CloudflareSaasAdapter } from './adapters/cloudflare/cloudflare-saas.adapter';
import { DomainHealthCheckJob } from './jobs/domain-health-check.job';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [CustomDomainController],
  providers: [
    CustomDomainService,
    CustomDomainRepository,
    CloudflareSaasAdapter,
    DomainHealthCheckJob,
    PrismaService,
  ],
  exports: [
    CustomDomainService,
    CustomDomainRepository,
    CloudflareSaasAdapter,
    DomainHealthCheckJob,
  ],
})
export class CustomDomainModule {}
