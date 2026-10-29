import { NotificationService } from '../../src/modules/notification/notification.service';
import { NotificationRepository } from '../../src/modules/notification/notification.repository';

describe('Mobile Device Registration & Push Dispatch (Sprint 3.12 Backend Readiness)', () => {
  let service: NotificationService;
  let mockPrisma: any;
  let mockRepo: jest.Mocked<NotificationRepository>;

  const orgId = '01948df9-8123-7020-9bc1-df837261a9bc';
  const userId = '01948df9-8123-7020-9bc1-df837261a9bd';

  beforeEach(() => {
    mockRepo = {
      isChannelEnabled: jest.fn().mockResolvedValue(true),
      createNotification: jest.fn().mockResolvedValue({
        id: 'notif_123',
        organizationId: orgId,
        userId,
        eventType: 'document_signed',
        title: 'Document Signed',
        body: 'Alice has signed your agreement.',
        createdAt: new Date(),
      }),
    } as any;

    mockPrisma = {
      device: {
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'dev_1', organizationId: orgId, userId, platform: 'ios', token: 'apns_token_xyz' },
          {
            id: 'dev_2',
            organizationId: orgId,
            userId,
            platform: 'android',
            token: 'fcm_token_123',
          },
        ]),
      },
      signatureEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: orgId, locale: 'fr-FR' }),
      },
    };

    service = new NotificationService(mockRepo, mockPrisma);
  });

  it('registers device push token with upsert', async () => {
    const result = await service.registerDevice(orgId, userId, 'android', 'fcm_test_token_1');
    expect(result.token).toBe('fcm_test_token_1');
    expect(result.platform).toBe('android');
    expect(mockPrisma.device.upsert).toHaveBeenCalled();
  });

  it('deregisters device token on logout', async () => {
    const result = await service.deregisterDevice(orgId, userId, 'dev_1');
    expect(result.count).toBe(1);
    expect(mockPrisma.device.deleteMany).toHaveBeenCalledWith({
      where: { id: 'dev_1', organizationId: orgId, userId },
    });
  });

  it('dispatches push alerts to registered mobile devices via circuit breaker', async () => {
    const count = await service.dispatchPushNotification(userId, orgId, {
      eventType: 'document_signed',
      title: 'Contract Executed',
      body: 'All signers have executed the contract.',
    });

    expect(count).toBe(2);
    expect(mockPrisma.device.findMany).toHaveBeenCalledWith({
      where: { userId, organizationId: orgId },
    });
  });
});
