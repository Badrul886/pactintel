import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { SectionViewEvent } from '@pactintel/shared-types';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

describe('Section-Level Engagement Analytics (Phase 2 Sprint 2.1 & EC-ANALYTICS-01..05)', () => {
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
            slug: mockSlug,
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

  it('EC-ANALYTICS-01: should reject section batch exceeding 50 events with 422 Unprocessable Entity', async () => {
    const events: SectionViewEvent[] = [];
    for (let i = 0; i < 51; i++) {
      events.push({
        blockId: `block-${i}`,
        durationMs: 1000,
        visibilityPct: 0.5,
      });
    }

    await expect(
      service.recordSectionEvents(mockSlug, 'session-batch-overflow', events),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('EC-ANALYTICS-02: should reject batch if durationMs sum per session per minute > 120,000ms (replay attack defense)', async () => {
    const sessionId = 'session-replay-test';

    // Batch 1: 70,000 ms
    await service.recordSectionEvents(mockSlug, sessionId, [
      { blockId: 'b1', durationMs: 70000, visibilityPct: 0.8 },
    ]);

    // Batch 2: 60,000 ms (total in 1 minute = 130,000 ms > 120,000 ms threshold)
    await expect(
      service.recordSectionEvents(mockSlug, sessionId, [
        { blockId: 'b2', durationMs: 60000, visibilityPct: 0.8 },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('EC-ANALYTICS-03: should swallow Pub/Sub buffer failures and log without throwing 5xx to recipient', async () => {
    jest
      .spyOn(repository, 'bufferSectionViews')
      .mockRejectedValueOnce(new Error('Pub/Sub unavailable'));
    const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

    // Should not throw
    await expect(
      service.recordSectionEvents(mockSlug, 'session-pubsub-err', [
        { blockId: 'b1', durationMs: 5000, visibilityPct: 0.5 },
      ]),
    ).resolves.not.toThrow();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to buffer section views: Pub/Sub unavailable'),
      expect.any(String),
    );
    loggerSpy.mockRestore();
  });

  it('EC-ANALYTICS-04: should successfully record view for block_id even if deleted client-side', async () => {
    await service.recordSectionEvents(mockSlug, 'session-block-4', [
      {
        blockId: 'nonexistent-block-xyz',
        durationMs: 8000,
        visibilityPct: 1.0,
        sectionTitle: 'Deleted Section',
      },
    ]);

    const sections = await service.getSectionAnalytics(mockDocId, mockOrgId);
    expect(sections.length).toBe(1);
    expect(sections[0].blockId).toBe('nonexistent-block-xyz');
    expect(sections[0].totalDurationMs).toBe(8000);
    expect(sections[0].avgVisibilityPct).toBe(1.0);
    expect(sections[0].uniqueSessions).toBe(1);
  });

  it('should validate duration bounds (0 <= durationMs <= 3,600,000)', async () => {
    await expect(
      service.recordSectionEvents(mockSlug, 's1', [
        { blockId: 'b1', durationMs: -1, visibilityPct: 0.5 },
      ]),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.recordSectionEvents(mockSlug, 's1', [
        { blockId: 'b1', durationMs: 3600001, visibilityPct: 0.5 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('should validate visibility bounds (0.0 <= visibilityPct <= 1.0)', async () => {
    await expect(
      service.recordSectionEvents(mockSlug, 's1', [
        { blockId: 'b1', durationMs: 500, visibilityPct: 1.5 },
      ]),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.recordSectionEvents(mockSlug, 's1', [
        { blockId: 'b1', durationMs: 500, visibilityPct: -0.1 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accurately aggregate section engagement metrics across multiple sessions and cache result', async () => {
    // Session 1 views block-A for 10s at 100% visibility
    await service.recordSectionEvents(mockSlug, 'sess-1', [
      { blockId: 'block-A', durationMs: 10000, visibilityPct: 1.0, sectionTitle: 'Pricing Clause' },
      { blockId: 'block-B', durationMs: 5000, visibilityPct: 0.5, sectionTitle: 'Signatures' },
    ]);

    // Session 2 views block-A for 20s at 50% visibility
    await service.recordSectionEvents(mockSlug, 'sess-2', [
      { blockId: 'block-A', durationMs: 20000, visibilityPct: 0.5, sectionTitle: 'Pricing Clause' },
    ]);

    const sections = await service.getSectionAnalytics(mockDocId, mockOrgId);
    expect(sections.length).toBe(2);

    const blockA = sections.find((s) => s.blockId === 'block-A')!;
    expect(blockA.totalDurationMs).toBe(30000); // 10s + 20s
    expect(blockA.uniqueSessions).toBe(2); // sess-1 and sess-2
    expect(blockA.avgVisibilityPct).toBe(0.75); // (1.0 + 0.5) / 2
    expect(blockA.viewsCount).toBe(2);

    const blockB = sections.find((s) => s.blockId === 'block-B')!;
    expect(blockB.totalDurationMs).toBe(5000);
    expect(blockB.uniqueSessions).toBe(1);
    expect(blockB.avgVisibilityPct).toBe(0.5);

    // Verify cache hit: subsequent calls return cached data
    const cachedSections = await service.getSectionAnalytics(mockDocId, mockOrgId);
    expect(cachedSections).toEqual(sections);
  });

  it('should generate complete dashboard response with completion rate and viewer session details', async () => {
    // 1. Initial pixel views for 2 viewers
    await service.recordPixelView(
      mockSlug,
      'sess-1',
      '10.0.0.1',
      'US',
      'buyer1@client.com',
      'Mozilla/5.0 Desktop',
    );
    await service.recordPixelView(
      mockSlug,
      'sess-2',
      '10.0.0.2',
      'GB',
      'buyer2@client.com',
      'iPhone Mobile',
    );

    // 2. Section view telemetry
    await service.recordSectionEvents(mockSlug, 'sess-1', [
      { blockId: 'block-1', durationMs: 15000, visibilityPct: 0.8 },
      { blockId: 'block-2', durationMs: 12000, visibilityPct: 0.6 },
    ]);
    await service.recordSectionEvents(mockSlug, 'sess-2', [
      { blockId: 'block-1', durationMs: 10000, visibilityPct: 0.9 },
    ]);

    const fullAnalytics = await service.getFullDocumentAnalytics(mockDocId, mockOrgId);

    // Overview KPIs
    expect(fullAnalytics.summary.uniqueViews).toBe(2);
    expect(fullAnalytics.sections.length).toBe(2);

    // Completion rate (sections with avg visibility >= 0.5): both blocks qualify -> 100%
    expect(fullAnalytics.completionRate).toBe(100);

    // Viewer list
    expect(fullAnalytics.viewers.length).toBe(2);
    expect(fullAnalytics.viewers[0].viewerEmail).toBeDefined();
    expect(['Desktop', 'Mobile']).toContain(fullAnalytics.viewers[0].device);
  });
});
