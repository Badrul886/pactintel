import {
  AnalyticsService,
  TRANSPARENT_1X1_GIF,
} from '../../src/modules/analytics/analytics.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';

describe('Analytics Tracking & Telemetry (Sprint 3.1 & RULE AN-001 / ACC-001)', () => {
  let service: AnalyticsService;
  let repository: AnalyticsRepository;

  const mockOrgId = '11111111-1111-7111-8111-111111111111';
  const mockDocId = '22222222-2222-7222-8222-222222222222';
  const mockSlug = 'us1-enterprise-msa';

  beforeEach(() => {
    repository = new AnalyticsRepository();

    jest
      .spyOn(repository, 'findDocumentBySlugOrId')
      .mockImplementation(async (...args: unknown[]) => {
        const slugOrId = args[0] as string;
        if (slugOrId === mockSlug || slugOrId === mockDocId) {
          return {
            id: mockDocId,
            organizationId: mockOrgId,
            reference: mockSlug,
            title: 'Enterprise MSA',
          } as any;
        }
        return null;
      });

    jest.spyOn(repository, 'recordFirstViewOutbox').mockImplementation(async () => {
      return { id: 'outbox-1' } as any;
    });

    service = new AnalyticsService(repository);
  });

  afterEach(() => {
    repository.clearBuffer();
    jest.restoreAllMocks();
  });

  it('should return 1x1 transparent GIF bytes and generate new session cookie if absent', async () => {
    const result = await service.recordPixelView(mockSlug, undefined, '127.0.0.1', 'US');

    expect(result.gifBuffer).toEqual(TRANSPARENT_1X1_GIF);
    expect(result.gifBuffer.length).toBe(42); // 42 bytes transparent 1x1 gif
    expect(result.sessionId).toBeDefined();
    expect(result.isFirstView).toBe(true);
    expect(result.documentId).toBe(mockDocId);
    expect(repository.recordFirstViewOutbox).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate multiple views under the same session ID (RULE ACC-001 & AN-001)', async () => {
    const sessionId = 'session-test-unique-123';

    // First view
    const view1 = await service.recordPixelView(mockSlug, sessionId);
    expect(view1.isFirstView).toBe(true);
    expect(repository.recordFirstViewOutbox).toHaveBeenCalledTimes(1);

    // Second view with same session cookie
    const view2 = await service.recordPixelView(mockSlug, sessionId);
    expect(view2.isFirstView).toBe(false); // Returning session heartbeat
    expect(repository.recordFirstViewOutbox).toHaveBeenCalledTimes(1); // Outbox not duplicated

    // Check aggregated metrics per RULE ACC-001
    const metrics = await service.getDocumentAnalytics(mockDocId, mockOrgId);
    expect(metrics.uniqueViews).toBe(1); // COUNT(DISTINCT session_id) is 1
    expect(metrics.sessionsCount).toBe(1);
  });

  it('should count distinct sessions independently for accurate unique view telemetry', async () => {
    await service.recordPixelView(mockSlug, 'session-buyer-A');
    await service.recordPixelView(mockSlug, 'session-buyer-B');
    await service.recordPixelView(mockSlug, 'session-buyer-A'); // Repeated view from A

    const metrics = await service.getDocumentAnalytics(mockDocId, mockOrgId);
    expect(metrics.uniqueViews).toBe(2); // Buyer A and Buyer B
    expect(repository.recordFirstViewOutbox).toHaveBeenCalledTimes(2);
  });

  it('should accumulate reading duration on heartbeat updates', async () => {
    const sessionId = 'session-timer-456';
    await service.recordPixelView(mockSlug, sessionId);

    // Heartbeat ping 1: 30 seconds (30000 ms)
    await service.recordHeartbeat(mockSlug, sessionId, 30000);
    // Heartbeat ping 2: 30 seconds (30000 ms)
    await service.recordHeartbeat(mockSlug, sessionId, 30000);

    const metrics = await service.getDocumentAnalytics(mockDocId, mockOrgId);
    expect(metrics.totalDurationSeconds).toBe(60);
  });

  it('should reject heartbeat with durationMs exceeding 1 hour (3,600,000 ms)', async () => {
    await expect(service.recordHeartbeat(mockSlug, 'session-err', 3600001)).rejects.toThrow(
      'durationMs must be between 0 and 3,600,000 ms',
    );
  });

  it('should safely return 1x1 GIF even if document slug is unknown without throwing 500', async () => {
    const result = await service.recordPixelView('non-existent-slug');
    expect(result.gifBuffer).toEqual(TRANSPARENT_1X1_GIF);
    expect(result.documentId).toBeNull();
    expect(result.isFirstView).toBe(false);
  });
});
