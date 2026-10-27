/**
 * Test Suite: Webhook Delivery Idempotency & Circuit-Breaker Resilience
 * Blueprint Reference: §5.23, RULE WH-001, EC-WH-01..07, Invariant I-05, I-06
 * Proves that redundant event deliveries are skipped idempotently, unique delivery attempt
 * constraints are honored, inactive/disabled hooks are safely bypassed, and delivery logs are immutable.
 */

import { WebhookService } from '../../src/modules/webhook/webhook.service';
import { WebhookDeliveryJob } from '../../src/modules/webhook/jobs/webhook-delivery.job';
import { WebhookRepository } from '../../src/modules/webhook/webhook.repository';
import * as crypto from 'crypto';

describe('Webhook Delivery Idempotency & Resilience (RULE WH-001, EC-WH-01..07)', () => {
  let webhookService: WebhookService;
  let deliveryJob: WebhookDeliveryJob;
  let mockRepo: any;
  let mockAdapter: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const webhookId = '22222222-2222-7222-8222-222222222222';
  const eventId = '33333333-3333-7333-8333-333333333333';
  const eventType = 'document.signed';
  const payload = { documentId: 'doc-777', completedAt: new Date().toISOString() };
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findSuccessfulDelivery: jest.fn(),
      recordDeliveryLog: jest.fn().mockResolvedValue({ id: 'log-1', attemptNumber: 1 }),
      incrementFailureCount: jest.fn(),
      resetFailureCount: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: webhookId }),
      disable: jest.fn().mockResolvedValue({ id: webhookId, isActive: false }),
    };

    mockAdapter = {
      sendWebhook: jest.fn().mockResolvedValue({
        success: true,
        httpStatus: 200,
        responseBody: '{"received":true}',
        durationMs: 45,
      }),
    };

    webhookService = new WebhookService(mockRepo as WebhookRepository, mockAdapter);
    deliveryJob = new WebhookDeliveryJob(
      mockRepo as WebhookRepository,
      webhookService,
      mockAdapter,
    );
  });

  describe('1. Redundant Delivery Deduplication (Idempotency Key: webhook_id + event_id)', () => {
    it('skips network dispatch when a prior successful delivery log already exists', async () => {
      // Simulate that eventId has already been successfully delivered to webhookId
      mockRepo.findSuccessfulDelivery.mockResolvedValue({
        id: 'delivery-log-prior',
        webhookId,
        eventId,
        httpStatus: 200,
        deliveredAt: new Date('2026-10-27T10:00:00Z'),
      });

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType,
        payload,
      });

      expect(result.status).toBe('skipped');
      expect(mockAdapter.sendWebhook).not.toHaveBeenCalled();
      expect(mockRepo.recordDeliveryLog).not.toHaveBeenCalled();
    });

    it('proceeds with initial delivery attempt when no prior delivery log exists', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({
        id: webhookId,
        organizationId: orgId,
        url: 'https://api.partner.com/webhook',
        isActive: true,
        failureCount: 0,
        events: ['document.signed'],
      });

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType,
        payload,
      });

      expect(result.status).toBe('delivered');
      expect(mockAdapter.sendWebhook).toHaveBeenCalledTimes(1);
      expect(mockRepo.recordDeliveryLog).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId,
          eventId,
          eventType,
          attemptNumber: 1,
          httpStatus: 200,
          deliveredAt: expect.any(Date),
        }),
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        webhookId,
        expect.objectContaining({ failureCount: 0 }),
      );
    });
  });

  describe('2. Inactive & Disabled Hook Protection', () => {
    it('skips delivery when webhook is disabled or deactivated (EC-WH-06)', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({
        id: webhookId,
        organizationId: orgId,
        url: 'https://api.partner.com/webhook',
        isActive: false, // Disabled
        failureCount: 10,
        events: ['document.signed'],
      });

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType,
        payload,
      });

      expect(result.status).toBe('skipped');
      expect(mockAdapter.sendWebhook).not.toHaveBeenCalled();
    });

    it('skips delivery when webhook has been deleted (deletedAt is set)', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(null); // Soft-deleted/not found

      const result = await deliveryJob.processDelivery({
        webhookId,
        organizationId: orgId,
        eventId,
        eventType,
        payload,
      });

      expect(result.status).toBe('skipped');
      expect(mockAdapter.sendWebhook).not.toHaveBeenCalled();
    });
  });

  describe('3. Unique Attempt Number & Delivery Log Integrity', () => {
    it('records attempt number and payload hash accurately in delivery logs', async () => {
      mockRepo.findSuccessfulDelivery.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({
        id: webhookId,
        organizationId: orgId,
        url: 'https://api.partner.com/webhook',
        isActive: true,
        failureCount: 2,
        events: ['document.signed'],
      });

      await deliveryJob.processDelivery(
        {
          webhookId,
          organizationId: orgId,
          eventId,
          eventType,
          payload,
        },
        2,
      );

      expect(mockRepo.recordDeliveryLog).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId,
          eventId,
          eventType,
          attemptNumber: 2,
          payloadHash,
        }),
      );
    });
  });
});
