import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UsePipes,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { FormsSubmissionService } from './forms-submission.service';
import { FormsRepository } from './forms.repository';
import { FormsMagicLinkService } from './forms-magic-link.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  SubmitFormDto,
  SubmitFormDtoSchema,
  ContinueFormSubmissionDto,
  ContinueFormSubmissionDtoSchema,
} from './dto/submit-form.dto';

@Controller()
export class FormsPublicController {
  constructor(
    private readonly submissionService: FormsSubmissionService,
    private readonly formsRepo: FormsRepository,
    private readonly magicLinkService: FormsMagicLinkService,
  ) {}

  /**
   * Helper to extract real client IP address for rate limiting and audit trail (EC-FORM-03).
   */
  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '127.0.0.1'
    );
  }

  /**
   * Public Form View: GET /f/:orgSlug/:formSlug
   * Also accessible via /api/v1/public/forms/:orgSlug/:formSlug
   */
  @Get(['f/:orgSlug/:formSlug', 'api/v1/public/forms/:orgSlug/:formSlug'])
  async getPublicForm(@Param('orgSlug') orgSlug: string, @Param('formSlug') formSlug: string) {
    const form = await this.formsRepo.findFormBySlug(orgSlug, formSlug);
    if (!form || form.status !== 'published') {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: 'The requested form does not exist or is not published.',
      });
    }

    const settings = (form.settings || {}) as any;

    return {
      id: form.id,
      name: form.name,
      slug: form.slug,
      version: form.version,
      definition: form.definition,
      branding: settings.customBranding || {},
      organization: form.organization,
    };
  }

  /**
   * Public Form Submission: POST /api/v1/public/forms/:formId/submit
   */
  @Post('api/v1/public/forms/:formId/submit')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(SubmitFormDtoSchema))
  async submitForm(
    @Param('formId') formId: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
  ) {
    const submitterIp = this.getClientIp(req);
    return this.submissionService.submitForm({
      formId,
      submitterIp,
      submitterEmail: dto.submitterEmail,
      rawAnswers: dto.data,
    });
  }

  /**
   * Resolve Magic Link for Multi-Role Form Continuation: GET /api/v1/public/forms/continue/:token
   */
  @Get('api/v1/public/forms/continue/:token')
  async getContinueForm(@Param('token') token: string) {
    const magicLink = await this.magicLinkService.validateMagicLink(token);
    const form = magicLink.form;
    const submission = magicLink.submission;

    const roles: any[] = ((form.roles as any) || []).sort(
      (a: any, b: any) => a.sortOrder - b.sortOrder,
    );
    const currentRoleConfig = roles.find((r) => r.roleName === magicLink.roleName);

    return {
      submissionId: submission.id,
      formId: form.id,
      formName: form.name,
      roleName: magicLink.roleName,
      definition: form.definition,
      allowedFields: currentRoleConfig?.fields || [],
      existingAnswers: submission.data,
    };
  }

  /**
   * Submit Continuation for Multi-Role Form: POST /api/v1/public/forms/continue/:token/submit
   */
  @Post('api/v1/public/forms/continue/:token/submit')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(ContinueFormSubmissionDtoSchema))
  async submitContinueForm(@Param('token') token: string, @Body() dto: ContinueFormSubmissionDto) {
    return this.submissionService.submitContinued(token, dto.data);
  }
}
