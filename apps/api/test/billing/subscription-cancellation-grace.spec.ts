import { BillingService } from '../../src/modules/billing/billing.service';
import { BillingRepository } from '../../src/modules/billing/billing.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE PAD-002 & RULE BILL-002: Subscription Cancellation Grace Period and Usage Rollover', () => {
  let billingService: BillingService;
  let mockBillingRepo: Partial<BillingRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';

  beforeEach(() => {
    mockBillingRepo = {
      findBillingEvent: jest.fn().mockResolvedValue(null),
      recordBillingEvent: jest.fn().mockResolvedValue({ id: 'evt-rec-1' }),
      findSubscriptionByOrg: jest.fn(),
      upsertSubscription: jest.fn(),
    };

    mockPrisma = {
      organization: { findUnique: jest.fn() },
      subscription: { updateMany: jest.fn() },
    };

    billingService = new BillingService(
      mockBillingRepo as BillingRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('RULE PAD-002: Graceful Cancellation Downgrade', () => {
    it('applies 30-day grace period on cancellation and updates tier limits without abruptly terminating access', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const cancelPayload = {
        event_id: 'evt_cancel_001',
        event_type: 'subscription.cancelled',
        data: {
          id: 'sub_paddle_to_cancel',
          status: 'cancelled',
        },
        custom_data: {
          organizationId: orgId,
        },
      };

      await billingService.handleWebhook('evt_cancel_001', 'subscription.cancelled', cancelPayload);

      const expectedGraceEnd = new Date(now + 30 * 24 * 60 * 60 * 1000);

      expect(mockBillingRepo.upsertSubscription).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          status: 'cancelled',
          planTier: 'free',
          fullSeatLimit: 1,
          collabSeatLimit: 0,
          documentLimit: 5,
          gracePeriodEnd: expectedGraceEnd,
          paddleSubscriptionId: 'sub_paddle_to_cancel',
        }),
      );

      (Date.now as any).mockRestore();
    });
  });

  describe('RULE BILL-002: Monthly Billing Cycle Rollover', () => {
    it('resets documents_used_this_period to 0 when a new billing cycle starts', async () => {
      const previousPeriodStart = new Date('2026-09-01T00:00:00Z');
      (mockBillingRepo.findSubscriptionByOrg as jest.Mock).mockResolvedValue({
        id: 'sub-existing',
        organizationId: orgId,
        planTier: 'professional',
        currentPeriodStart: previousPeriodStart,
        documentsUsedThisPeriod: 75,
      });

      const newPeriodStart = new Date('2026-10-01T00:00:00Z');
      const newPeriodEnd = new Date('2026-11-01T00:00:00Z');

      const renewalPayload = {
        event_id: 'evt_renewal_001',
        event_type: 'subscription.updated',
        data: {
          id: 'sub_paddle_123',
          status: 'active',
          plan_tier: 'professional',
          current_billing_period: {
            starts_at: newPeriodStart.toISOString(),
            ends_at: newPeriodEnd.toISOString(),
          },
        },
        custom_data: {
          organizationId: orgId,
        },
      };

      await billingService.handleWebhook('evt_renewal_001', 'subscription.updated', renewalPayload);

      expect(mockBillingRepo.upsertSubscription).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          planTier: 'professional',
          status: 'active',
          documentsUsedThisPeriod: 0, // Reset for new period!
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          gracePeriodEnd: null,
        }),
      );
    });

    it('does not reset documents_used_this_period if event is within same period', async () => {
      const currentPeriodStart = new Date('2026-10-01T00:00:00Z');
      (mockBillingRepo.findSubscriptionByOrg as jest.Mock).mockResolvedValue({
        id: 'sub-existing',
        organizationId: orgId,
        planTier: 'professional',
        currentPeriodStart: currentPeriodStart,
        documentsUsedThisPeriod: 42,
      });

      const samePeriodPayload = {
        event_id: 'evt_update_002',
        event_type: 'subscription.updated',
        data: {
          id: 'sub_paddle_123',
          status: 'active',
          plan_tier: 'professional',
          current_billing_period: {
            starts_at: currentPeriodStart.toISOString(),
            ends_at: new Date('2026-11-01T00:00:00Z').toISOString(),
          },
        },
        custom_data: {
          organizationId: orgId,
        },
      };

      await billingService.handleWebhook(
        'evt_update_002',
        'subscription.updated',
        samePeriodPayload,
      );

      expect(mockBillingRepo.upsertSubscription).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          documentsUsedThisPeriod: undefined, // preserved, not reset
        }),
      );
    });
  });
});
