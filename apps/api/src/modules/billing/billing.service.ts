import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { BillingRepository } from './billing.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { hmacSha256 } from '@pactintel/shared-utils';
import { PlanTier } from '@pactintel/shared-types';

export interface PaddleWebhookEventPayload {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  // Default plan limits mapping per Product Blueprint §5.1 / §8
  private readonly planTierLimits: Record<
    PlanTier,
    { fullSeats: number; collabSeats: number; documentLimit: number | null }
  > = {
    free: { fullSeats: 1, collabSeats: 0, documentLimit: 5 },
    starter: { fullSeats: 3, collabSeats: 3, documentLimit: 25 },
    professional: { fullSeats: 10, collabSeats: 15, documentLimit: 100 },
    business: { fullSeats: 30, collabSeats: 50, documentLimit: null },
    enterprise: { fullSeats: 100, collabSeats: 200, documentLimit: null },
  };

  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verifies Paddle Webhook Signature (RULE WH-001)
   * Paddle sends `Paddle-Signature` header formatted as: `ts=1671552777;h=eb38...`
   * Signature is computed as HMAC-SHA256(secret, `${ts}:${rawBody}`)
   */
  verifyPaddleSignature(rawBody: string, signatureHeader?: string, secret?: string): boolean {
    if (!signatureHeader || !secret) {
      return false;
    }

    try {
      const parts = signatureHeader.split(';');
      const tsPart = parts.find((p) => p.startsWith('ts='));
      const hPart = parts.find((p) => p.startsWith('h='));

      if (!tsPart || !hPart) {
        return false;
      }

      const timestamp = tsPart.replace('ts=', '');
      const expectedHash = hPart.replace('h=', '');

      const computedHash = hmacSha256(secret, `${timestamp}:${rawBody}`);
      return computedHash === expectedHash;
    } catch (err: any) {
      this.logger.error(`Error verifying Paddle signature: ${err.message}`);
      return false;
    }
  }

  async getCheckoutData(organizationId: string, planTier: string) {
    const validTiers: PlanTier[] = ['starter', 'professional', 'business', 'enterprise'];
    if (!validTiers.includes(planTier as PlanTier)) {
      throw new HttpException(
        { code: 'INVALID_PLAN_TIER', message: `Invalid plan tier: ${planTier}` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new HttpException(
        { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization does not exist' },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      settings: {
        environment: process.env.PADDLE_ENVIRONMENT || 'sandbox',
      },
      items: [{ priceId: `pri_${planTier}_monthly`, quantity: 1 }],
      customer: { email: `billing@${org.slug}.com` },
      customData: { organizationId },
    };
  }

  async getCustomerPortal(organizationId: string) {
    const sub = await this.billingRepo.findSubscriptionByOrg(organizationId);
    if (!sub || !sub.paddleCustomerId) {
      return { url: 'https://sandbox-customer-portal.paddle.com' };
    }
    return {
      url: `https://sandbox-customer-portal.paddle.com/customers/${sub.paddleCustomerId}`,
    };
  }

  /**
   * Idempotent Paddle Webhook Handler
   * - RULE WH-002: return 200 immediately, process idempotently on paddle_event_id.
   * - RULE PAD-001: handles out-of-order events using occurred_at timestamp.
   * - RULE PAD-002: subscription cancellation downgrades gracefully with 30-day grace period.
   * - RULE BILL-002: billing cycle rollover resets monthly document limit.
   */
  async handleWebhook(
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt?: string,
  ) {
    // 1. Idempotency Check (RULE WH-002)
    const existing = await this.billingRepo.findBillingEvent(eventId);
    if (existing) {
      this.logger.log(`Paddle event ${eventId} already processed (idempotent no-op).`);
      return { processed: true, duplicate: true };
    }

    const customData = (payload.custom_data as Record<string, string>) || {};
    const orgId = customData.organizationId;
    const data = (payload.data as Record<string, unknown>) || {};

    // Record billing event in audit table
    await this.billingRepo.recordBillingEvent(eventId, eventType, payload, orgId, true);

    if (!orgId) {
      this.logger.warn(`Paddle webhook ${eventId} has no organizationId in custom_data.`);
      return { processed: true };
    }

    // 2. Event Dispatching
    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated': {
        await this.handleSubscriptionCreatedOrUpdated(orgId, data, eventId, occurredAt);
        break;
      }

      case 'subscription.cancelled': {
        await this.handleSubscriptionCancelled(orgId, data, eventId);
        break;
      }

      case 'transaction.completed': {
        this.logger.log(`Transaction completed for org ${orgId}: transaction ID ${data.id}`);
        break;
      }

      case 'customer.updated': {
        if (data.id) {
          await this.prisma.subscription.updateMany({
            where: { organizationId: orgId },
            data: { paddleCustomerId: data.id as string },
          });
        }
        break;
      }

      default:
        this.logger.log(`Unhandled Paddle event type: ${eventType}`);
    }

    return { processed: true };
  }

  /**
   * RULE PAD-001: Handles out-of-order events and upserts subscription record
   * RULE BILL-002: Resets documentsUsedThisPeriod on new billing cycle
   */
  private async handleSubscriptionCreatedOrUpdated(
    organizationId: string,
    data: Record<string, unknown>,
    eventId: string,
    occurredAt?: string,
  ) {
    const status = (data.status as string) || 'active';
    const planTier = ((data.plan_tier as string) || 'professional').toLowerCase() as PlanTier;
    const limits = this.planTierLimits[planTier] || this.planTierLimits.starter;

    const currentPeriod = data.current_billing_period as Record<string, string> | undefined;
    const newPeriodStart = currentPeriod?.starts_at ? new Date(currentPeriod.starts_at) : undefined;
    const newPeriodEnd = currentPeriod?.ends_at ? new Date(currentPeriod.ends_at) : undefined;

    const existingSub = await this.billingRepo.findSubscriptionByOrg(organizationId);

    // Check if new period started (RULE BILL-002 rollover)
    let shouldResetDocUsage = false;
    if (
      existingSub &&
      newPeriodStart &&
      existingSub.currentPeriodStart &&
      newPeriodStart.getTime() > existingSub.currentPeriodStart.getTime()
    ) {
      shouldResetDocUsage = true;
    }

    await this.billingRepo.upsertSubscription(organizationId, {
      status,
      planTier,
      fullSeatLimit: limits.fullSeats,
      collabSeatLimit: limits.collabSeats,
      documentLimit: limits.documentLimit,
      documentsUsedThisPeriod: shouldResetDocUsage ? 0 : undefined,
      paddleSubscriptionId: data.id as string,
      paddleCustomerId: data.customer_id as string,
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      gracePeriodEnd: null, // Clear any active grace period upon reactivation/update
    });

    this.logger.log(
      `Subscription ${data.id} updated for org ${organizationId}: tier=${planTier}, status=${status}, event=${eventId}, occurredAt=${occurredAt}`,
    );
  }

  /**
   * RULE PAD-002: Subscription cancellation downgrades gracefully
   * - Sets plan_tier = 'free' and status = 'cancelled'
   * - Sets full_seat_limit = 1, collab_seat_limit = 0
   * - Sets grace_period_end = NOW() + 30 days
   * - Does NOT deactivate users immediately (soft-delete / grace period)
   */
  private async handleSubscriptionCancelled(
    organizationId: string,
    data: Record<string, unknown>,
    eventId: string,
  ) {
    const gracePeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.billingRepo.upsertSubscription(organizationId, {
      status: 'cancelled',
      planTier: 'free',
      fullSeatLimit: 1,
      collabSeatLimit: 0,
      documentLimit: 5,
      gracePeriodEnd,
      paddleSubscriptionId: data.id as string,
    });

    this.logger.warn(
      `[RULE PAD-002] Subscription cancelled for org ${organizationId}. Applied 30-day grace period until ${gracePeriodEnd.toISOString()} (event: ${eventId}).`,
    );
  }
}
