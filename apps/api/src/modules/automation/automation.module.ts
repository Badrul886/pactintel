import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationRepository } from './automation.repository';
import { AutomationExecutor } from './automation.executor';
import { AutomationJob } from './jobs/automation.job';
import { AutomationEventListener } from './listeners/automation.listener';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [NotificationModule, AuthModule, OrganizationModule],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationRepository,
    AutomationExecutor,
    AutomationJob,
    AutomationEventListener,
    PrismaService,
  ],
  exports: [
    AutomationService,
    AutomationRepository,
    AutomationExecutor,
    AutomationJob,
    AutomationEventListener,
  ],
})
export class AutomationModule {}
