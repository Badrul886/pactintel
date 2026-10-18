import { NotificationService } from '../../src/modules/notification/notification.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE NOTIF-001 & RULE NOTIF-002: Resilient Notification Dispatch and Failure Isolation', () => {
  let notificationService: NotificationService;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const email = 'recipient@client.org';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      signatureEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-fail-1' }),
      },
      document: {
        update: jest.fn(),
      },
    };

    notificationService = new NotificationService(mockPrisma as PrismaService);
  });

  describe('RULE NOTIF-001: Asynchronous Queueing and Failure Isolation', () => {
    it('successfully enqueues notification task asynchronously without executing inline network calls', async () => {
      const enqueued = await notificationService.enqueueEmail({
        to: email,
        template: 'signing-invitation',
        organizationId: orgId,
        data: {
          documentTitle: 'Master Services Agreement',
          signingUrl: '/sign/token123',
        },
      });

      expect(enqueued).toBe(true);
    });

    it('records email_delivery_failed in audit log without changing document status or throwing errors', async () => {
      await notificationService.handleDeliveryFailure(
        orgId,
        docId,
        email,
        'SMTP connection timeout to recipient mail server (554)',
      );

      // Verifies signature event was created with failure metadata
      expect(mockPrisma.signatureEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          documentId: docId,
          eventType: 'email_delivery_failed',
          metadata: expect.objectContaining({
            recipientEmail: email,
            reason: 'SMTP connection timeout to recipient mail server (554)',
            note: 'Document status preserved per RULE NOTIF-001; shareable link remains active.',
          }),
        }),
      });

      // Crucial: document status must NOT have been changed/downgraded
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });
  });
});
