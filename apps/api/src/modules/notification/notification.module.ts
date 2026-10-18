import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationRepository } from './notification.repository';
import { DocumentEventListener } from './listeners/document-event.listener';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, DocumentEventListener, PrismaService],
  exports: [NotificationService, NotificationRepository, DocumentEventListener],
})
export class NotificationModule {}
