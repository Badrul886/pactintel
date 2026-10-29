import { Module, forwardRef } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentModule } from '../document/document.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [DocumentModule, forwardRef(() => OrganizationModule)],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceRepository, PrismaService],
  exports: [WorkspaceService, WorkspaceRepository],
})
export class WorkspaceModule {}
