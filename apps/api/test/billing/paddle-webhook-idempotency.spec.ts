import { BillingService } from '../../src/modules/billing/billing.service';
import { BillingRepository } from '../../src/modules/billing/billing.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { hmacSha256 } from '@pactintel/shared-utils';

describe('RULE WH-001 & RULE WH-002: Paddle Webhook Verification and Idempotency', () => {
  let billingService: BillingService;
  let mockBillingRepo: Partial<BillingRepository>;
  let mockPrisma: any;

  const testSecret = 'pdl_ntfset_01hqsecretkey12345';
  const orgId = '11111111-1111-7111-8111-111111111111';

  beforeEach(() => {
    mockBillingRepo = {
      findBillingEvent: jest.fn(),
      recordBillingEvent: jest.fn(),
      findSubscriptionByOrg: jest.fn(),
      upsertSubscription: jest.fn(),
    };

    mockPrisma = {
      organization: {
        findUnique: jest.fn(),
      },
      subscription: {
        updateMany: jest.fn(),
      },
    };

    billingService = new BillingService(
      mockBillingRepo as BillingRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('RULE WH-001: Signature Verification', () => {
    it('successfully validates authentic Paddle webhook signature', () => {
      const rawBody = JSON.stringify({
        event_id: 'evt_01j1234567890',
        event_type: 'subscription.created',
      });
      const timestamp = '1729267200';
      const hash = hmacSha256(testSecret, `${timestamp}:${rawBody}`);
      const header = `ts=${timestamp};h=${hash}`;

      const isValid = billingService.verifyPaddleSignature(rawBody, header, testSecret);
      expect(isValid).toBe(true);
    });

    it('rejects tampered webhook payload', () => {
      const rawBody = JSON.stringify({ event_id: 'evt_01j1234567890' });
      const tamperedBody = JSON.stringify({ event_id: 'evt_01j1234567890', tampered: true });
      const timestamp = '1729267200';
      const hash = hmacSha256(testSecret, `${timestamp}:${rawBody}`);
      const header = `ts=${timestamp};h=${hash}`;

      const isValid = billingService.verifyPaddleSignature(tamperedBody, header, testSecret);
      expect(isValid).toBe(false);
    });

    it('rejects when signature header or secret is missing', () => {
      expect(billingService.verifyPaddleSignature('{}', undefined, testSecret)).toBe(false);
      expect(billingService.verifyPaddleSignature('{}', 'ts=1;h=abc', undefined)).toBe(false);
      expect(billingService.verifyPaddleSignature('{}', 'invalid_format', testSecret)).toBe(false);
    });
  });

  describe('RULE WH-002: Idempotent Event Processing', () => {
    it('processes a new webhook event and records it in billing audit log', async () => {
      (mockBillingRepo.findBillingEvent as jest.Mock).mockResolvedValue(null);
      (mockBillingRepo.recordBillingEvent as jest.Mock).mockResolvedValue({ id: 'evt-rec-1' });
      (mockBillingRepo.findSubscriptionByOrg as jest.Mock).mockResolvedValue(null);
      (mockBillingRepo.upsertSubscription as jest.Mock).mockResolvedValue({ id: 'sub-1' });

      const payload = {
        event_id: 'evt_new_001',
        event_type: 'subscription.created',
        data: {
          id: 'sub_paddle_123',
          status: 'active',
          plan_tier: 'professional',
        },
        custom_data: {
          organizationId: orgId,
        },
      };

      const result = await billingService.handleWebhook(
        'evt_new_001',
        'subscription.created',
        payload,
        '2026-10-18T10:00:00Z',
      );

      expect(result).toEqual({ processed: true });
      expect(mockBillingRepo.findBillingEvent).toHaveBeenCalledWith('evt_new_001');
      expect(mockBillingRepo.recordBillingEvent).toHaveBeenCalledWith(
        'evt_new_001',
        'subscription.created',
        payload,
        orgId,
        true,
      );
      expect(mockBillingRepo.upsertSubscription).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          status: 'active',
          planTier: 'professional',
          fullSeatLimit: 10,
          documentLimit: 100,
        }),
      );
    });

    it('returns 200 idempotent duplicate response if event was already processed', async () => {
      (mockBillingRepo.findBillingEvent as jest.Mock).mockResolvedValue({
        id: 'existing-evt-id',
        paddleEventId: 'evt_dup_001',
        processed: true,
      });

      const payload = {
        event_id: 'evt_dup_001',
        event_type: 'subscription.created',
        data: {},
        custom_data: { organizationId: orgId },
      };

      const result = await billingService.handleWebhook(
        'evt_dup_001',
        'subscription.created',
        payload,
      );

      expect(result).toEqual({ processed: true, duplicate: true });
      expect(mockBillingRepo.recordBillingEvent).not.toHaveBeenCalled();
      expect(mockBillingRepo.upsertSubscription).not.toHaveBeenCalled();
    });
  });
});
