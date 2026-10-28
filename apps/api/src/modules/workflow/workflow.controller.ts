import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { WorkflowDefinitionService } from './workflow-definition.service';
import { WorkflowInstanceService } from './workflow-instance.service';
import { WorkflowEngineService } from './workflow-engine.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateWorkflowDefinitionDtoSchema,
  CreateWorkflowDefinitionDto,
  UpdateWorkflowDefinitionDtoSchema,
  UpdateWorkflowDefinitionDto,
  WorkflowDefinitionStatus,
  WorkflowInstanceStatus,
  ResumeWorkflowInstanceDtoSchema,
  ResumeWorkflowInstanceDto,
} from '@pactintel/shared-types';

@Controller('api/v1/workflows')
export class WorkflowController {
  constructor(
    private readonly definitionService: WorkflowDefinitionService,
    private readonly instanceService: WorkflowInstanceService,
    private readonly engineService: WorkflowEngineService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. WORKFLOW DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'WorkflowDefinition' })
  @HttpCode(HttpStatus.CREATED)
  async createDefinition(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateWorkflowDefinitionDtoSchema))
    body: CreateWorkflowDefinitionDto,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    return this.definitionService.createWorkflow(orgId, userId, body);
  }

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'WorkflowDefinition' })
  async listDefinitions(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: WorkflowDefinitionStatus,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.definitionService.listWorkflows(orgId, {
      workspaceId,
      status,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('metrics')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'WorkflowInstance' })
  async getMetrics(@Req() req: any) {
    const orgId = req.user.organizationId;
    return this.instanceService.getMetrics(orgId);
  }

  @Get('instances')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'WorkflowInstance' })
  async listInstances(
    @Req() req: any,
    @Query('workflowId') workflowId?: string,
    @Query('status') status?: WorkflowInstanceStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.instanceService.listInstances(orgId, {
      workflowId,
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('instances/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'WorkflowInstance' })
  async getInstance(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.instanceService.getInstance(id, orgId);
  }

  @Post('instances/:id/resume')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'WorkflowInstance' })
  @HttpCode(HttpStatus.OK)
  async resumeInstance(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.instanceService.resumeInstance(id, orgId);
  }

  @Post('instances/:id/halt')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'WorkflowInstance' })
  @HttpCode(HttpStatus.OK)
  async haltInstance(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.instanceService.haltInstance(id, orgId);
  }

  @Post('instances/:id/skip')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'WorkflowInstance' })
  @HttpCode(HttpStatus.OK)
  async skipNode(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResumeWorkflowInstanceDtoSchema)) body: ResumeWorkflowInstanceDto,
  ) {
    const orgId = req.user.organizationId;
    return this.instanceService.skipNode(id, orgId, body.nodeId || '');
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'WorkflowDefinition' })
  async getDefinition(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.definitionService.getWorkflow(id, orgId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'WorkflowDefinition' })
  async updateDefinition(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWorkflowDefinitionDtoSchema))
    body: UpdateWorkflowDefinitionDto,
  ) {
    const orgId = req.user.organizationId;
    return this.definitionService.updateWorkflow(id, orgId, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'WorkflowDefinition' })
  async deleteDefinition(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.definitionService.deleteWorkflow(id, orgId);
  }

  @Post(':id/trigger')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'execute', subject: 'WorkflowDefinition' })
  @HttpCode(HttpStatus.OK)
  async triggerDefinition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() payload: Record<string, unknown>,
  ) {
    const orgId = req.user.organizationId;
    const wf = await this.definitionService.getWorkflow(id, orgId);
    return this.engineService.triggerWorkflow(wf.triggerEvent, orgId, payload || {});
  }
}
