import { Module } from '@nestjs/common';
import { FollowUpController } from './follow-up.controller';
import { FollowUpService } from './follow-up.service';
import { FollowUpRepository } from './follow-up.repository';
import { DocumentModule } from '../document/document.module';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DocumentModule, NotificationModule],
  controllers: [FollowUpController],
  providers: [FollowUpService, FollowUpRepository, PrismaService],
  exports: [FollowUpService, FollowUpRepository],
})
export class FollowUpModule {}
