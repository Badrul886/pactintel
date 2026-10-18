import {
  Controller,
  Get,
  Post,
  Param,
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
} from '@pactintel/shared-types';

@Controller('api/v1')
export class PublicSigningController {
  private readonly logger = new Logger(PublicSigningController.name);

  constructor(private readonly signingService: SigningService) {}

  /**
   * RULE AUTH-005: External signer access gate (/sign/:token).
   */
  @Get('sign/:token')
  async getSignerDocument(@Param('token') token: string) {
    return this.signingService.getSignerByToken(token);
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
