import { Module, forwardRef } from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';
import { WorkflowNodeExecutor } from './workflow-node-executor';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowInstanceService } from './workflow-instance.service';
import { ProcessWorkflowNodeProcessor } from './processors/process-workflow-node.processor';
import { WorkflowTriggerListener } from './listeners/workflow-trigger.listener';
import { WorkflowController } from './workflow.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationModule } from '../notification/notification.module';
import { OrganizationModule } from '../organization/organization.module';
import { SigningModule } from '../signing/signing.module';

@Module({
  imports: [
    forwardRef(() => NotificationModule),
    forwardRef(() => OrganizationModule),
    forwardRef(() => SigningModule),
  ],
  controllers: [WorkflowController],
  providers: [
    PrismaService,
    WorkflowRepository,
    WorkflowNodeExecutor,
    WorkflowEngineService,
    WorkflowDefinitionService,
    WorkflowInstanceService,
    ProcessWorkflowNodeProcessor,
    WorkflowTriggerListener,
  ],
  exports: [
    WorkflowEngineService,
    WorkflowDefinitionService,
    WorkflowInstanceService,
    WorkflowRepository,
    WorkflowTriggerListener,
  ],
})
export class WorkflowModule {}
