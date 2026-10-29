import { EngagementScoringService } from '../engagement-scoring.service';
import { AnalyticsRepository } from '../analytics.repository';

describe('EngagementScoringService (Sprint 3.10)', () => {
  let service: EngagementScoringService;
  let repository: AnalyticsRepository;

  const mockPrisma: any = {
    document: {
      findFirst: jest.fn(),
    },
    outboxEvent: {
      create: jest
        .fn()
        .mockImplementation((args) => Promise.resolve({ id: 'evt-1', ...args.data })),
    },
  };

  beforeEach(() => {
    repository = new AnalyticsRepository(mockPrisma);
    service = new EngagementScoringService(repository);
    repository.clearBuffer();
    jest.clearAllMocks();
  });

  describe('calculateScore (Algorithm Weights & Edge Cases)', () => {
    it('weights dwell time correctly up to 40 points', () => {
      // 150 seconds = 50% of 300s = 20 points
      const res = service.calculateScore({
        totalDurationSeconds: 150,
        completionRatePct: 0,
        sessionsCount: 1,
        uniqueViewersCount: 1,
        daysSinceLastView: 0,
      });

      expect(res.timeOnPageScore).toBe(20);
      expect(res.score).toBe(25); // 20 (time) + 0 (completion) + 0 (return visits) + 5 (unique viewer)
    });

    it('enforces EC-ENGAGE-01: bounce protection (< 3 seconds dwell gives 0 time score)', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 2,
        completionRatePct: 10,
        sessionsCount: 1,
        uniqueViewersCount: 1,
        daysSinceLastView: 0,
      });

      expect(res.timeOnPageScore).toBe(0);
      expect(res.score).toBe(8); // 0 + 3 (completion) + 0 + 5 (viewer)
    });

    it('caps dwell time score at 40 points for long sessions', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 1200, // 20 minutes
        completionRatePct: 0,
        sessionsCount: 1,
        uniqueViewersCount: 1,
        daysSinceLastView: 0,
      });

      expect(res.timeOnPageScore).toBe(40);
    });

    it('weights section completion rate up to 30 points', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 0,
        completionRatePct: 80,
        sessionsCount: 1,
        uniqueViewersCount: 1,
        daysSinceLastView: 0,
      });

      expect(res.completionScore).toBe(24); // 80% of 30
    });

    it('weights return visits up to 15 points (3 pts per return session)', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 0,
        completionRatePct: 0,
        sessionsCount: 4, // 1 first view + 3 return sessions = 9 pts
        uniqueViewersCount: 1,
        daysSinceLastView: 0,
      });

      expect(res.returnVisitsScore).toBe(9);
    });

    it('weights multiple viewers/forwardings up to 15 points (5 pts per viewer)', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 0,
        completionRatePct: 0,
        sessionsCount: 1,
        uniqueViewersCount: 3, // 3 * 5 = 15 pts
        daysSinceLastView: 0,
      });

      expect(res.uniqueViewersScore).toBe(15);
    });

    it('enforces EC-ENGAGE-02: dormancy decay of 35 pts after >= 7 days inactivity with isDisengaged flag', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 300, // 40 pts
        completionRatePct: 100, // 30 pts
        sessionsCount: 3, // 6 pts
        uniqueViewersCount: 2, // 10 pts
        daysSinceLastView: 8, // Dormant
      });

      expect(res.isDisengaged).toBe(true);
      expect(res.recencyPenalty).toBe(35);
      expect(res.score).toBe(86 - 35); // 51
    });

    it('enforces EC-ENGAGE-03: re-engagement detection when dormant deal becomes active within 1 day', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 300,
        completionRatePct: 100,
        sessionsCount: 3,
        uniqueViewersCount: 2,
        daysSinceLastView: 0, // Active now
        previousDaysSinceLastView: 10, // Was dormant
      });

      expect(res.isReengaged).toBe(true);
      expect(res.isDisengaged).toBe(false);
      expect(res.recencyPenalty).toBe(0);
      expect(res.score).toBe(86);
    });

    it('enforces EC-ENGAGE-04: signed or completed contracts freeze score without dormancy decay', () => {
      const res = service.calculateScore({
        totalDurationSeconds: 300,
        completionRatePct: 100,
        sessionsCount: 3,
        uniqueViewersCount: 2,
        daysSinceLastView: 25, // Long past 7 days
        isCompleted: true,
      });

      expect(res.isDisengaged).toBe(false);
      expect(res.isReengaged).toBe(false);
      expect(res.recencyPenalty).toBe(0);
      expect(res.score).toBe(86);
    });
  });

  describe('evaluateDocumentEngagement (Outbox Events & Storage)', () => {
    it('evaluates document engagement and emits outbox event on disengagement transition', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        title: 'Enterprise Master Services Agreement',
        status: 'sent',
        organizationId: 'org-1',
        createdAt: new Date(Date.now() - 10 * 86400000),
        lastViewedAt: new Date(Date.now() - 8 * 86400000), // 8 days ago
      });

      const summary = await service.evaluateDocumentEngagement('doc-1', 'org-1');

      expect(summary.isDisengaged).toBe(true);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'analytics.engagement.disengaged',
            organizationId: 'org-1',
            aggregateId: 'doc-1',
          }),
        }),
      );
    });

    it('emits reengaged outbox event when dormant deal becomes reengaged', async () => {
      // Seed repository engagement state showing previous dormancy
      await repository.saveEngagementScore('doc-2', 'org-1', {
        documentId: 'doc-2',
        score: 30,
        breakdown: {
          timeOnPageScore: 10,
          completionScore: 10,
          returnVisitsScore: 5,
          uniqueViewersScore: 5,
          recencyPenalty: 35,
        },
        isDisengaged: true,
        isReengaged: false,
        daysSinceLastView: 12,
        calculatedAt: new Date(Date.now() - 86400000).toISOString(),
      });

      // Now document has a fresh view today
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-2',
        title: 'Consulting SOW',
        status: 'viewed',
        organizationId: 'org-1',
        createdAt: new Date(Date.now() - 15 * 86400000),
        lastViewedAt: new Date(), // Active right now
      });

      const summary = await service.evaluateDocumentEngagement('doc-2', 'org-1');

      expect(summary.isReengaged).toBe(true);
      expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'analytics.engagement.reengaged',
            organizationId: 'org-1',
            aggregateId: 'doc-2',
          }),
        }),
      );
    });
  });
});
