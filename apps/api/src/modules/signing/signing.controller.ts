import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UsePipes,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { SigningService } from './signing.service';
import { SigningRepository } from './signing.repository';
import { VerificationReportService } from './verification-report.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateSignatureRequestDto,
  CreateSignatureRequestDtoSchema,
  ReassignSignerDto,
  ReassignSignerDtoSchema,
  SubmitKbaAnswersDto,
  SubmitKbaAnswersDtoSchema,
  InitiateIdVerificationDto,
  InitiateIdVerificationDtoSchema,
  InitiateQesDto,
  InitiateQesDtoSchema,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class SigningController {
  constructor(
    private readonly signingService: SigningService,
    private readonly signingRepo: SigningRepository,
    private readonly cls: ClsService,
    @Optional() private readonly verificationReportService?: VerificationReportService,
  ) {}

  @Post('documents/:id/signature-requests')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(CreateSignatureRequestDtoSchema))
  async createSignatureRequest(
    @Param('id') documentId: string,
    @Body() dto: CreateSignatureRequestDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.createSignatureRequest(orgId, {
      ...dto,
      documentId,
    });
  }

  /**
   * RULE SIG-005: Signer substitution preserves full audit trail.
   */
  @Post('signature-requests/:id/signers/:signerId/reassign')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(ReassignSignerDtoSchema))
  async reassignSigner(
    @Param('id') requestId: string,
    @Param('signerId') signerId: string,
    @Body() dto: ReassignSignerDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.reassignSigner(orgId, requestId, signerId, dto);
  }

  @Post('signature-requests/:id/void')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Signature' })
  async voidSignatureRequest(@Param('id') requestId: string, @Body('reason') reason?: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.signingService.voidSignatureRequest(orgId, requestId, reason || 'Voided by sender');
  }

  // ---------------------------------------------------------------------------
  // Advanced ID Verification Signer REST Endpoints (Sprint 3.6)
  // ---------------------------------------------------------------------------

  @Post('signing/signers/:id/kba/initiate')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  async initiateKbaBySignerId(@Param('id') signerId: string) {
    const orgId = this.cls.get<string>('organizationId');
    const signer = await this.signingRepo.findSignerById(orgId, signerId);
    if (!signer || !signer.signingToken) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Signer or signing token not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.signingService.initiateKba(signer.signingToken);
  }

  @Post('signing/signers/:id/kba/submit')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(SubmitKbaAnswersDtoSchema))
  async submitKbaAnswersBySignerId(
    @Param('id') signerId: string,
    @Body() dto: SubmitKbaAnswersDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const signer = await this.signingRepo.findSignerById(orgId, signerId);
    if (!signer || !signer.signingToken) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Signer or signing token not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.signingService.submitKbaAnswers(signer.signingToken, dto);
  }

  @Post('signing/signers/:id/id-verify/initiate')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(InitiateIdVerificationDtoSchema))
  async initiateIdVerifyBySignerId(
    @Param('id') signerId: string,
    @Body() dto: InitiateIdVerificationDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const signer = await this.signingRepo.findSignerById(orgId, signerId);
    if (!signer || !signer.signingToken) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Signer or signing token not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.signingService.initiateIdVerification(signer.signingToken, dto);
  }

  @Get('signing/signers/:id/id-verify/result')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Signature' })
  async getIdVerifyResultBySignerId(
    @Param('id') signerId: string,
    @Query('sessionId') sessionId: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const signer = await this.signingRepo.findSignerById(orgId, signerId);
    if (!signer || !signer.signingToken) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Signer or signing token not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.signingService.checkIdVerificationResult(signer.signingToken, sessionId);
  }

  @Post('signing/signers/:id/qes/initiate')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Signature' })
  @UsePipes(new ZodValidationPipe(InitiateQesDtoSchema))
  async initiateQesBySignerId(@Param('id') signerId: string, @Body() dto: InitiateQesDto) {
    const orgId = this.cls.get<string>('organizationId');
    const signer = await this.signingRepo.findSignerById(orgId, signerId);
    if (!signer || !signer.signingToken) {
      throw new HttpException(
        { code: 'SIGNER_NOT_FOUND', message: 'Signer or signing token not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return this.signingService.initiateQes(signer.signingToken, dto);
  }

  /**
   * Formal AML/KYC proof-of-verification export (PDF / JSON)
   * Product Blueprint §5.20 & Sprint 3.7
   */
  @Get('signature-requests/:id/verification-report')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Signature' })
  async getVerificationReport(
    @Param('id') signatureRequestId: string,
    @Query('format') format: string = 'json',
    @Res() res: Response,
  ) {
    if (!this.verificationReportService) {
      throw new HttpException(
        'Verification report service not available.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const orgId = this.cls.get<string>('organizationId');
    const reportData = await this.verificationReportService.generateReportData(
      orgId,
      signatureRequestId,
    );

    if (format === 'pdf') {
      const pdfBuffer = await this.verificationReportService.generateReportPdf(reportData);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="verification-report-${signatureRequestId}.pdf"`,
      );
      return res.send(pdfBuffer);
    }

    return res.json(reportData);
  }
}
