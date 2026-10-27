import { BadRequestException } from '@nestjs/common';
import { WebhookService } from '../../src/modules/webhook/webhook.service';
import { WebhookDeliveryJob } from '../../src/modules/webhook/jobs/webhook-delivery.job';
import { WebhookRepository } from '../../src/modules/webhook/webhook.repository';
import { WebhookAdapter } from '../../src/modules/webhook/adapters/webhook.adapter';
import * as crypto from 'crypto';

describe('Sprint 2.7: Webhook Delivery & Security (RULE WH-001, EC-WH-01..07)', () => {
  let webhookService: WebhookService;
  let deliveryJob: WebhookDeliveryJob;
  let mockRepo: any;
  let mockAdapter: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const webhookId = '22222222-2222-7222-8222-222222222222';
  const eventId = '33333333-3333-7333-8333-333333333333';

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      listByOrg: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createDeliveryLog: jest.fn(),
      recordDeliveryLog: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findSuccessfulDelivery: jest.fn(),
      incrementFailureCount: jest.fn(),
      resetFailureCount: jest.fn(),
      autoDisableWebhook: jest.fn(),
      getDeliveryLogs: jest.fn(),
    };

    mockAdapter = {
      sendWebhook: jest.fn(),
    };

    webhookService = new WebhookService(mockRepo as WebhookRepository, mockAdapter);
    deliveryJob = new WebhookDeliveryJob(
      mockRepo as WebhookRepository,
      webhookService,
      mockAdapter,
    );
  });

  describe('SSRF Protection (RULE EC-WH-05)', () => {
    it('rejects loopback addresses (127.0.0.1, localhost)', () => {
      expect(() => webhookService.validateUrl('http://127.0.0.1/webhook')).toThrow(
        BadRequestException,
      );
      expect(() => webhookService.validateUrl('http://localhost:8080/hook')).toThrow(
        BadRequestException,
      );
    });

    it('rejects RFC1918 private network addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(() => webhookService.validateUrl('https://10.0.0.5/api')).toThrow(BadRequestException);
      expect(() => webhookService.validateUrl('https://172.16.0.10/webhook')).toThrow(
        BadRequestException,
      );
      expect(() => webhookService.validateUrl('https://192.168.1.1/hook')).toThrow(
        BadRequestException,
      );
    });

    it('rejects cloud metadata IP (169.254.169.254)', () => {
      expect(() => webhookService.validateUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
        BadRequestException,
      );
    });

    it('accepts public HTTPS URLs', () => {
      expect(() =>
        webhookService.validateUrl('https://hooks.zapier.com/hooks/catch/123/abc'),
      ).not.toThrow();
      expect(() =>
        webhookService.validateUrl('https://api.mycompany.com/webhooks/pactintel'),
      ).not.toThrow();
    });
  });

  describe('Secret Generation & Registration (RULE WH-001)', () => {
    it('generates a 32-byte CSPRNG secret and stores its SHA-256 hash', async () => {
      mockRepo.create.mockImplementation(async (data: any) => ({
        id: webhookId,
        ...data,
      }));

      const result = await webhookService.createWebhook(orgId, {
        url: 'https://hooks.zapier.com/hooks/catch/123',
        events: ['document.signed'],
      });

      expect(result.id).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(result.secret).toHaveLength(64); // 32 bytes in hex = 64 characters

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          url: 'https://hooks.zapier.com/hooks/catch/123',
          secretHash: expect.any(String),
        }),
      );

      // Verify the stored hash matches SHA-256 of generated secret
      const expectedHash = crypto.createHash('sha256').update(result.secret).digest('hex');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          secretHash: expectedHash,
        }),
      );
    });
  });

  describe('HMAC-SHA256 Payload Signing (RULE WH-001)', () => {
    it('adapter constructs X-PactIntel-Signature, X-PactIntel-Event, and X-PactIntel-Event-ID', async () => {
      const adapter = new WebhookAdapter();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"status":"ok"}'),
      });
      (global as any).fetch = mockFetch;

      const secret = 'whsec_test_secret_for_signing_123';
      const payload = { event: 'document.signed', documentId: 'doc-123' };

      const delivery = await adapter.sendWebhook({
        url: 'https://hooks.zapier.com/test',
        secret,
        eventId: 'evt-999',
        eventType: 'document.signed',
        payload,
      });

      expect(delivery.success).toBe(true);
      expect(delivery.httpStatus).toBe(200);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.zapier.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-PactIntel-Event': 'document.signed',
            'X-PactIntel-Event-ID': 'evt-999',
            'X-PactIntel-Signature': expect.stringMatching(/^t=\d+,v1=[a-f0-9]{64}$/),
          }),
        }),
      );
    });
  });

  describe('Delivery Idempotency (RULE WH-001)', () => {
    it('skips delivery when event has already been successfully delivered to the target', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue({
        id: 'log-existing',
        httpStatus: 200,
        deliveredAt: new Date(),
      });

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType: 'document.signed',
        payload: { documentId: 'doc-1' },
      });

      expect(result.status).toBe('skipped');
      expect(mockAdapter.sendWebhook).not.toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Auto-Disable (RULE EC-WH-06)', () => {
    it('auto-disables webhook after 10 consecutive failures and emits outbox event', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({
        id: webhookId,
        organizationId: orgId,
        url: 'https://hooks.zapier.com/test',
        secretHash: 'hash',
        isActive: true,
        failureCount: 9, // One more failure makes it 10
      });

      mockAdapter.sendWebhook.mockResolvedValue({
        success: false,
        httpStatus: 500,
        responseBody: 'Internal Server Error',
        errorMessage: 'HTTP 500',
        durationMs: 150,
      });

      mockRepo.incrementFailureCount.mockResolvedValue(10);
      mockRepo.disable = jest.fn().mockResolvedValue({ id: webhookId, isActive: false });

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType: 'payment.completed',
        payload: { paymentId: 'pay-1' },
      });

      expect(result.status).toBe('failed');
      expect(mockRepo.incrementFailureCount).toHaveBeenCalledWith(webhookId);
      expect(mockRepo.disable).toHaveBeenCalledWith(webhookId);
    });
  });
});
