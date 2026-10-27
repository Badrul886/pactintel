import { Module } from '@nestjs/common';
import { ContentLockController } from './content-lock.controller';
import { ContentLockService } from './content-lock.service';
import { ContentLockRepository } from './content-lock.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [AuthModule, OrganizationModule],
  controllers: [ContentLockController],
  providers: [ContentLockService, ContentLockRepository, PrismaService],
  exports: [ContentLockService, ContentLockRepository],
})
export class ContentLockModule {}
