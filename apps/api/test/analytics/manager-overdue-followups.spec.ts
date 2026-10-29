import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';

describe('Manager Overdue Follow-ups Tracker (Sprint 3.10)', () => {
  let service: AnalyticsService;
  let repository: AnalyticsRepository;

  const mockPrisma: any = {
    document: {
      findMany: jest.fn(),
    },
    teamMembership: {
      findMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    repository = new AnalyticsRepository(mockPrisma);
    service = new AnalyticsService(repository);
    repository.clearBuffer();
    jest.clearAllMocks();
  });

  it('surfaces documents sent by supervised team members that have exceeded the threshold days', async () => {
    // 1. Manager oversees Sales Team
    mockPrisma.teamMembership.findMany
      .mockResolvedValueOnce([{ teamId: 'team-enterprise-sales' }])
      .mockResolvedValueOnce([
        { userId: 'rep-dan', user: { id: 'rep-dan', name: 'Dan Rep', email: 'dan@client.org' } },
      ]);

    // 2. Dan has a document sent 5 days ago that has not been signed
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400 * 1000);
    mockPrisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-stalled',
        title: 'Enterprise Pilot Agreement',
        ownerId: 'rep-dan',
        status: 'sent',
        createdAt: fiveDaysAgo,
        updatedAt: fiveDaysAgo,
        lastViewedAt: null,
        signatureRequests: [
          {
            signers: [{ email: 'buyer@prospect.com', role: 'signer' }],
          },
        ],
      },
    ]);

    const items = await service.getManagerOverdueFollowups('org-1', 'mgr-1', 3);

    expect(items).toHaveLength(1);
    expect(items[0].documentId).toBe('doc-stalled');
    expect(items[0].documentTitle).toBe('Enterprise Pilot Agreement');
    expect(items[0].repName).toBe('Dan Rep');
    expect(items[0].recipientEmail).toBe('buyer@prospect.com');
    expect(items[0].daysSinceSent).toBeGreaterThanOrEqual(4);
    expect(items[0].status).toBe('sent');
  });

  it('excludes signed documents and documents sent within the threshold (EC-OVERDUE-02)', async () => {
    mockPrisma.teamMembership.findMany
      .mockResolvedValueOnce([{ teamId: 'team-sales' }])
      .mockResolvedValueOnce([
        { userId: 'rep-dan', user: { id: 'rep-dan', name: 'Dan Rep', email: 'dan@client.org' } },
      ]);

    // No documents matching overdue criteria
    mockPrisma.document.findMany.mockResolvedValue([]);

    const items = await service.getManagerOverdueFollowups('org-1', 'mgr-1', 3);

    expect(items).toHaveLength(0);
    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['sent', 'viewed'] },
        }),
      }),
    );
  });
});
