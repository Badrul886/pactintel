import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateApprovalChainDto,
  CreateApprovalChainDtoSchema,
  SubmitApprovalDecisionDto,
  SubmitApprovalDecisionDtoSchema,
  UserRole,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly cls: ClsService,
  ) {}

  @Post('approval-chains')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'ApprovalChain' })
  @UsePipes(new ZodValidationPipe(CreateApprovalChainDtoSchema))
  async createApprovalChain(@Body() dto: CreateApprovalChainDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.createChain(orgId, dto);
  }

  @Get('approval-chains')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'ApprovalChain' })
  async listApprovalChains(@Query('workspaceId') workspaceId?: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.listChains(orgId, workspaceId);
  }

  @Get('approval-chains/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'ApprovalChain' })
  async getApprovalChain(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.getChain(orgId, id);
  }

  @Patch('approval-chains/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'ApprovalChain' })
  async updateApprovalChain(
    @Param('id') id: string,
    @Body() body: { name?: string; isActive?: boolean; conditions?: any },
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.updateChain(orgId, id, body);
  }

  @Delete('approval-chains/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'ApprovalChain' })
  async deleteApprovalChain(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.deleteChain(orgId, id);
  }

  @Post('approval-steps/:id/decide')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'ApprovalStep' })
  @UsePipes(new ZodValidationPipe(SubmitApprovalDecisionDtoSchema))
  async submitApprovalDecision(
    @Param('id') stepId: string,
    @Body() dto: SubmitApprovalDecisionDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const role = (this.cls.get<string>('userRole') as UserRole) || 'member';
    return this.approvalService.submitDecision(orgId, userId, role, stepId, dto);
  }

  @Get('documents/:id/approvals')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getDocumentApprovals(@Param('id') documentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.listStepsForDocument(orgId, documentId);
  }

  @Post('documents/:id/approvals')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Document' })
  async triggerDocumentApproval(
    @Param('id') documentId: string,
    @Body('dealValue') dealValue?: number,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.approvalService.triggerApprovalForDocument(orgId, documentId, 'manual', dealValue);
  }

  @Get('approvals/pending')
  @UseGuards(AuthGuard)
  async getPendingApprovals() {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.approvalService.listPendingStepsForUser(orgId, userId);
  }
}
