import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
  HttpException,
  Logger,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly cls: ClsService,
  ) {}

  @Post('billing/checkout')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async getCheckout(@Body('planTier') planTier: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.billingService.getCheckoutData(orgId, planTier);
  }

  @Get('billing/portal')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async getCustomerPortal() {
    const orgId = this.cls.get<string>('organizationId');
    return this.billingService.getCustomerPortal(orgId);
  }

  /**
   * Paddle Webhook Endpoint (RULE WH-001, WH-002, PAD-001)
   * Verifies Paddle-Signature header and returns 200 OK immediately.
   */
  @Post('billing/webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('paddle-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.processWebhookEvent(body, signature);
  }

  /**
   * Dedicated secret-path webhook endpoint per Blueprint §4 / §13
   */
  @Post('webhooks/paddle/:secret')
  @HttpCode(HttpStatus.OK)
  async handleSecretWebhook(
    @Param('secret') secretParam: string,
    @Headers('paddle-signature') signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    const configuredSecret = process.env.PADDLE_WEBHOOK_SECRET;

    // Secret URL segment verification if configured
    if (configuredSecret && secretParam !== configuredSecret) {
      this.logger.warn(`Invalid Paddle webhook secret path segment received: ${secretParam}`);
      throw new HttpException(
        { code: 'UNAUTHORIZED_WEBHOOK', message: 'Invalid webhook secret URL path.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.processWebhookEvent(body, signature);
  }

  private async processWebhookEvent(body: Record<string, unknown>, signature?: string) {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    // RULE WH-001: Verify signature if secret and signature header are provided
    if (secret && signature) {
      const rawBody = JSON.stringify(body);
      const isValid = this.billingService.verifyPaddleSignature(rawBody, signature, secret);

      if (!isValid) {
        this.logger.warn('Paddle webhook signature verification failed.');
        throw new HttpException(
          { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid Paddle webhook signature.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    const eventId = (body.event_id as string) || (body.id as string) || 'evt_unknown';
    const eventType = (body.event_type as string) || 'unknown';
    const occurredAt = (body.occurred_at as string) || undefined;

    return this.billingService.handleWebhook(eventId, eventType, body, occurredAt);
  }
}
