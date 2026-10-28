import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  HttpException,
  UsePipes,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { SigningService } from './signing.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  SignWithTokenDto,
  SignWithTokenDtoSchema,
  DeclineWithTokenDto,
  DeclineWithTokenDtoSchema,
  VerifySignerIdentityDto,
  SubmitKbaAnswersDto,
  SubmitKbaAnswersDtoSchema,
  InitiateIdVerificationDto,
  InitiateIdVerificationDtoSchema,
  InitiateQesDto,
  InitiateQesDtoSchema,
} from '@pactintel/shared-types';

@Controller('api/v1')
export class PublicSigningController {
  private readonly logger = new Logger(PublicSigningController.name);

  constructor(private readonly signingService: SigningService) {}

  /**
   * RULE AUTH-005: External signer access gate (/sign/:token).
   */
  @Get('sign/:token')
  async getSignerDocument(@Param('token') token: string, @Req() req?: Request) {
    const ip = req ? (req.headers?.['x-forwarded-for'] as string) || req.ip : undefined;
    const userAgent = req?.headers?.['user-agent'];
    return this.signingService.getSignerByToken(token, ip, userAgent);
  }

  /**
   * RULE AUTH-005: Verify signer passcode or OTP identity challenge.
   */
  @Post('sign/:token/verify-identity')
  async verifyIdentity(
    @Param('token') token: string,
    @Body() dto: VerifySignerIdentityDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    return this.signingService.verifySignerIdentity(token, dto.passcode, ip, userAgent);
  }

  // ---------------------------------------------------------------------------
  // Advanced ID Verification Routes (Sprint 3.6)
  // ---------------------------------------------------------------------------

  /**
   * Initiate KBA Session
   */
  @Post('sign/:token/kba/initiate')
  async initiateKba(@Param('token') token: string, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.initiateKba(token, ip, userAgent);
  }

  /**
   * Submit KBA Answers
   */
  @Post('sign/:token/kba/submit')
  @UsePipes(new ZodValidationPipe(SubmitKbaAnswersDtoSchema))
  async submitKbaAnswers(
    @Param('token') token: string,
    @Body() dto: SubmitKbaAnswersDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.submitKbaAnswers(token, dto, ip, userAgent);
  }

  /**
   * Initiate Government ID & Biometric Verification
   */
  @Post('sign/:token/id-verify/initiate')
  @UsePipes(new ZodValidationPipe(InitiateIdVerificationDtoSchema))
  async initiateIdVerification(
    @Param('token') token: string,
    @Body() dto: InitiateIdVerificationDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.initiateIdVerification(token, dto, ip, userAgent);
  }

  /**
   * Query Government ID Verification Status
   */
  @Get('sign/:token/id-verify/result')
  async getIdVerificationResult(
    @Param('token') token: string,
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.checkIdVerificationResult(token, sessionId, ip, userAgent);
  }

  /**
   * Initiate Qualified Electronic Signature (QES)
   */
  @Post('sign/:token/qes/initiate')
  @UsePipes(new ZodValidationPipe(InitiateQesDtoSchema))
  async initiateQes(
    @Param('token') token: string,
    @Body() dto: InitiateQesDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.initiateQes(token, dto, ip, userAgent);
  }

  /**
   * Query QES Verification Status
   */
  @Get('sign/:token/qes/result')
  async getQesResult(
    @Param('token') token: string,
    @Query('sessionId') sessionId: string,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.signingService.checkQesResult(token, sessionId, ip, userAgent);
  }

  /**
   * RULE SIG-002, SIG-003: Submits signature and legal assent.
   */
  @Post('sign/:token/sign')
  @UsePipes(new ZodValidationPipe(SignWithTokenDtoSchema))
  async signDocument(
    @Param('token') token: string,
    @Body() dto: SignWithTokenDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    return this.signingService.signDocumentWithToken(token, dto, ip, userAgent);
  }

  /**
   * Decline to sign document.
   */
  @Post('sign/:token/decline')
  @UsePipes(new ZodValidationPipe(DeclineWithTokenDtoSchema))
  async declineDocument(
    @Param('token') token: string,
    @Body() dto: DeclineWithTokenDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];

    return this.signingService.declineWithToken(token, dto, ip, userAgent);
  }

  /**
   * BoldSign Webhook Endpoint (RULE BOLD-001, BOLD-002)
   */
  @Post('webhooks/boldsign/:secret')
  @HttpCode(HttpStatus.OK)
  async handleBoldSignWebhook(
    @Param('secret') secretParam: string,
    @Headers('x-boldsign-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    const configuredSecret = process.env.BOLDSIGN_WEBHOOK_SECRET;

    if (configuredSecret && secretParam !== configuredSecret) {
      throw new HttpException(
        { code: 'UNAUTHORIZED_WEBHOOK', message: 'Invalid BoldSign webhook secret path segment.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    this.logger.log(
      `Received BoldSign webhook event: ${(body.event as Record<string, unknown>)?.eventType || 'event'} (signature: ${signature || 'none'})`,
    );

    return { received: true, status: 'processed' };
  }
}
