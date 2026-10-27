import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ApprovalRepository } from './approval.repository';
import { ApprovalTimeoutJob } from './jobs/approval-timeout.job';
import { DocumentApprovalListener } from './listeners/document.listener';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [NotificationModule, AuthModule, OrganizationModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    ApprovalRepository,
    ApprovalTimeoutJob,
    DocumentApprovalListener,
    PrismaService,
  ],
  exports: [ApprovalService, ApprovalRepository, DocumentApprovalListener],
})
export class ApprovalModule {}
