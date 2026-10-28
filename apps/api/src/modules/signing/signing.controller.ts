import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SigningService } from './signing.service';
import { SigningRepository } from './signing.repository';
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
}
