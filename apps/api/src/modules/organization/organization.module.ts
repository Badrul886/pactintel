import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from './organization.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository, PrismaService],
  exports: [OrganizationService, OrganizationRepository],
})
export class OrganizationModule {}
