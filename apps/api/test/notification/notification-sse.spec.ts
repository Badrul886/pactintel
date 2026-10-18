import { NotificationService } from '../../src/modules/notification/notification.service';
import { NotificationRepository } from '../../src/modules/notification/notification.repository';
import { DocumentEventListener } from '../../src/modules/notification/listeners/document-event.listener';
import { firstValueFrom, take } from 'rxjs';

describe('Real-Time Notifications & SSE (Sprint 3.2 & RULE NOTIF-001/002)', () => {
  let service: NotificationService;
  let repository: NotificationRepository;
  let listener: DocumentEventListener;

  const mockOrgId = '11111111-1111-7111-8111-111111111111';
  const mockUserId = '99999999-9999-7999-8999-999999999999';

  beforeEach(() => {
    repository = new NotificationRepository();

    // Mock DB operations
    jest.spyOn(repository, 'createNotification').mockImplementation(async (...args: unknown[]) => {
      const params = args[0] as any;
      return {
        id: 'notif-123',
        organizationId: params.organizationId,
        userId: params.userId,
        eventType: params.eventType,
        title: params.title,
        body: params.body,
        resourceType: params.resourceType || null,
        resourceId: params.resourceId || null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      };
    });

    jest.spyOn(repository, 'isChannelEnabled').mockImplementation(async (...args: unknown[]) => {
      const channel = args[2] as string;
      const eventType = args[3] as string;
      // Mock preference: disable email for document_declined
      if (channel === 'email' && eventType === 'document_declined') {
        return false;
      }
      // Mock preference: disable in_app for billing_alert
      if (channel === 'in_app' && eventType === 'billing_alert') {
        return false;
      }
      return true;
    });

    service = new NotificationService(repository);
    listener = new DocumentEventListener(service);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should deliver notifications to active SSE stream when in_app is enabled', async () => {
    const stream$ = service.getSseStream(mockUserId);

    // Prepare to capture first event from stream
    const eventPromise = firstValueFrom(stream$.pipe(take(1)));

    // Dispatch notification
    await service.notifyUser(mockUserId, mockOrgId, {
      eventType: 'document_viewed',
      title: 'First View',
      body: 'Document was opened',
      resourceType: 'document',
      resourceId: 'doc-1',
    });

    const received = await eventPromise;
    expect(received.data).toBeDefined();
    expect((received.data as any).eventType).toBe('document_viewed');
    expect((received.data as any).title).toBe('First View');
  });

  it('should suppress in-app notification when user preference disables channel', async () => {
    const notif = await service.notifyUser(mockUserId, mockOrgId, {
      eventType: 'billing_alert',
      title: 'Billing Alert',
      body: 'Payment due',
    });

    // Returned notification is null because in_app channel is disabled in preferences
    expect(notif).toBeNull();
    expect(repository.createNotification).not.toHaveBeenCalled();
  });

  it('should respect email preference and suppress email if disabled (RULE NOTIF-002)', async () => {
    const enqueueSpy = jest.spyOn(service, 'enqueueEmail');

    await service.notifyUser(mockUserId, mockOrgId, {
      eventType: 'document_declined',
      title: 'Declined',
      body: 'Recipient declined',
      recipientEmail: 'owner@client.com',
    });

    // In-app notification was created, but email enqueue returns false due to preference
    const emailResult = await service.enqueueEmail({
      to: 'owner@client.com',
      template: 'document-declined',
      data: {},
      organizationId: mockOrgId,
      userId: mockUserId,
    });

    expect(enqueueSpy).toHaveBeenCalled();
    expect(emailResult).toBe(false);
  });

  it('should trigger notifications from DocumentEventListener for all core outbox events', async () => {
    const notifySpy = jest.spyOn(service, 'notifyUser');

    // 1. analytics.document_viewed_first_time
    await listener.onDocumentViewedFirstTime({
      organizationId: mockOrgId,
      documentId: 'doc-1',
      ownerId: mockUserId,
      documentTitle: 'Master Agreement',
    });
    expect(notifySpy).toHaveBeenCalledWith(
      mockUserId,
      mockOrgId,
      expect.objectContaining({ eventType: 'document_viewed' }),
    );

    // 2. document.signed
    await listener.onDocumentSigned({
      organizationId: mockOrgId,
      documentId: 'doc-1',
      ownerId: mockUserId,
      documentTitle: 'Master Agreement',
      signerName: 'John Doe',
    });
    expect(notifySpy).toHaveBeenCalledWith(
      mockUserId,
      mockOrgId,
      expect.objectContaining({ eventType: 'document_signed' }),
    );

    // 3. document.declined
    await listener.onDocumentDeclined({
      organizationId: mockOrgId,
      documentId: 'doc-1',
      ownerId: mockUserId,
      documentTitle: 'Master Agreement',
      reason: 'Terms unacceptable',
    });
    expect(notifySpy).toHaveBeenCalledWith(
      mockUserId,
      mockOrgId,
      expect.objectContaining({ eventType: 'document_declined' }),
    );

    // 4. document.expired
    await listener.onDocumentExpired({
      organizationId: mockOrgId,
      documentId: 'doc-1',
      ownerId: mockUserId,
      documentTitle: 'Master Agreement',
    });
    expect(notifySpy).toHaveBeenCalledWith(
      mockUserId,
      mockOrgId,
      expect.objectContaining({ eventType: 'document_expired' }),
    );
  });
});
