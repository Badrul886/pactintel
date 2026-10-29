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
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { FormsService } from './forms.service';
import { FormsSubmissionService } from './forms-submission.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClsService } from 'nestjs-cls';
import {
  CreateFormDto,
  CreateFormDtoSchema,
  UpdateFormDto,
  UpdateFormDtoSchema,
} from '@pactintel/shared-types';
import {
  FormSubmissionQueryDto,
  FormSubmissionQueryDtoSchema,
} from './dto/form-submission-query.dto';

@Controller('api/v1/forms')
@UseGuards(AuthGuard, CaslGuard)
export class FormsController {
  constructor(
    private readonly formsService: FormsService,
    private readonly submissionService: FormsSubmissionService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies({ action: 'create', subject: 'Form' })
  @UsePipes(new ZodValidationPipe(CreateFormDtoSchema))
  async createForm(@Body() dto: CreateFormDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const defaultWorkspaceId = this.cls.get<string>('workspaceId') || '';
    return this.formsService.createForm(orgId, userId, dto, defaultWorkspaceId);
  }

  @Get()
  @CheckPolicies({ action: 'read', subject: 'Form' })
  async listForms(
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.listForms(orgId, {
      workspaceId,
      status,
      search,
      cursor,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'Form' })
  async getForm(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.getForm(orgId, id);
  }

  @Patch(':id')
  @CheckPolicies({ action: 'update', subject: 'Form' })
  @UsePipes(new ZodValidationPipe(UpdateFormDtoSchema))
  async updateForm(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.updateForm(orgId, id, dto);
  }

  @Delete(':id')
  @CheckPolicies({ action: 'delete', subject: 'Form' })
  async deleteForm(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.deleteForm(orgId, id);
  }

  @Post(':id/publish')
  @CheckPolicies({ action: 'update', subject: 'Form' })
  async publishForm(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.publishForm(orgId, id);
  }

  @Post(':id/close')
  @CheckPolicies({ action: 'update', subject: 'Form' })
  async closeForm(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.closeForm(orgId, id);
  }

  @Get(':id/share')
  @CheckPolicies({ action: 'read', subject: 'Form' })
  async getShareMetadata(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.formsService.getShareMetadata(orgId, id);
  }

  @Get(':id/submissions')
  @CheckPolicies({ action: 'read', subject: 'FormSubmission' })
  @UsePipes(new ZodValidationPipe(FormSubmissionQueryDtoSchema))
  async listSubmissions(@Param('id') formId: string, @Query() query: FormSubmissionQueryDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.submissionService.listSubmissions(orgId, formId, query);
  }

  @Get(':id/submissions/export')
  @CheckPolicies({ action: 'read', subject: 'FormSubmission' })
  async exportSubmissions(@Param('id') formId: string, @Res() res: Response) {
    const orgId = this.cls.get<string>('organizationId');
    const csvData = await this.submissionService.exportSubmissionsCsv(orgId, formId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="form-${formId}-submissions.csv"`);
    res.status(HttpStatus.OK).send(csvData);
  }

  @Get(':id/submissions/:subId')
  @CheckPolicies({ action: 'read', subject: 'FormSubmission' })
  async getSubmission(@Param('id') formId: string, @Param('subId') submissionId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.submissionService.getSubmission(orgId, formId, submissionId);
  }
}
