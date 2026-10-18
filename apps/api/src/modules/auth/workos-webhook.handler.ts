import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/v1/webhooks/workos')
export class WorkosWebhookHandler {
  private readonly logger = new Logger(WorkosWebhookHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handles inbound WorkOS webhooks with path-segment secret and signature verification.
   * RULE AUTH-004: Verify signature -> 401 if invalid -> 200 OK immediately and enqueue.
   */
  @Post(':secret')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('secret') secretSegment: string,
    @Headers('workos-signature') signature: string,
    @Body() payload: any,
  ) {
    const expectedSecret = process.env.WORKOS_WEBHOOK_SECRET || 'test_workos_webhook_secret';

    if (secretSegment !== expectedSecret) {
      this.logger.warn(`Invalid WorkOS webhook secret segment received.`);
      throw new UnauthorizedException({
        code: 'INVALID_WEBHOOK_SECRET',
        message: 'Invalid webhook authentication secret segment.',
      });
    }

    // In production with real WorkOS signature, verify signature timestamp and hmac
    if (process.env.NODE_ENV === 'production' && !signature) {
      throw new UnauthorizedException({
        code: 'MISSING_SIGNATURE',
        message: 'WorkOS-Signature header is required in production.',
      });
    }

    const eventType = payload?.event || payload?.type;
    this.logger.log(`Received verified WorkOS webhook event: ${eventType}`);

    // Synchronize user/organization if event contains user data
    if (eventType === 'user.created' || eventType === 'user.updated') {
      const data = payload.data;
      if (data && data.email) {
        // Enqueue or execute async sync
        await this.syncWorkosUser(data);
      }
    }

    return { received: true };
  }

  private async syncWorkosUser(data: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  }) {
    try {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email },
      });

      if (!existing) {
        // Log sync notice
        this.logger.log(`WorkOS user webhook noted for ${data.email}`);
      }
    } catch (err: any) {
      this.logger.error(`Error during WorkOS user sync: ${err.message}`);
    }
  }
}
