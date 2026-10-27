import { Module } from '@nestjs/common';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { CommentRepository } from './comment.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [NotificationModule, AuthModule, OrganizationModule],
  controllers: [CommentController],
  providers: [CommentService, CommentRepository, PrismaService],
  exports: [CommentService, CommentRepository],
})
export class CommentModule {}
