import { Injectable } from '@nestjs/common';
import { PrismaClient, Document, OutboxEvent } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import {
  SectionAnalyticsSummary,
  ViewerSessionSummary,
  DocumentAnalyticsFullResponse,
  DocumentAnalyticsSummary,
} from '@pactintel/shared-types';

export interface BufferedViewerSession {
  sessionId: string;
  organizationId: string;
  documentId: string;
  viewerEmail: string | null;
  startedAt: Date;
  lastActiveAt: Date;
  ipAddress: string | null;
  country: string | null;
  durationMs: number;
  viewsCount?: number;
  userAgent?: string | null;
}

export interface BufferedSectionView {
  eventId: string;
  organizationId: string;
  documentId: string;
  sessionId: string;
  blockId: string;
  sectionTitle: string | null;
  durationMs: number;
  visibilityPct: number;
  scrollDepthPct: number;
  createdAt: Date;
}

@Injectable()
export class AnalyticsRepository {
  private prisma: PrismaClient;

  // Pub/Sub buffer & ClickHouse buffer storage (RULE AN-001)
  private sessionsBuffer: Map<string, BufferedViewerSession> = new Map();
  private sectionViewsBuffer: BufferedSectionView[] = [];

  // Replay & Rate limiting window (1 minute sliding window per session) - RULE EC-ANALYTICS-02
  private recentSessionDurations: Map<string, { timestamp: number; durationMs: number }[]> =
    new Map();

  // 5-minute aggregation cache (RULE I-12 / Perf)
  private analyticsCache: Map<string, { data: any; expiresAt: number }> = new Map();

  constructor(prisma?: any) {
    this.prisma = prisma || new PrismaClient();
  }

  async findDocumentBySlugOrId(slugOrId: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
    });
  }

  async recordFirstViewOutbox(
    organizationId: string,
    documentId: string,
    sessionId: string,
    viewerEmail?: string,
  ): Promise<OutboxEvent> {
    const id = generateId();
    return this.prisma.outboxEvent.create({
      data: {
        id,
        organizationId,
        eventType: 'analytics.document_viewed_first_time',
        aggregateType: 'document',
        aggregateId: documentId,
        payload: {
          organizationId,
          documentId,
          sessionId,
          viewerEmail: viewerEmail || null,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  // --- Pub/Sub Buffer Operations (RULE AN-001: Never direct ClickHouse insert) ---

  async getSession(sessionId: string, documentId: string): Promise<BufferedViewerSession | null> {
    const key = `${documentId}:${sessionId}`;
    return this.sessionsBuffer.get(key) || null;
  }

  async bufferFirstView(session: BufferedViewerSession): Promise<void> {
    const key = `${session.documentId}:${session.sessionId}`;
    this.sessionsBuffer.set(key, {
      ...session,
      viewsCount: 1,
    });
  }

  async updateHeartbeat(sessionId: string, documentId: string, durationMs: number): Promise<void> {
    const key = `${documentId}:${sessionId}`;
    const existing = this.sessionsBuffer.get(key);
    if (existing) {
      existing.lastActiveAt = new Date();
      existing.durationMs += durationMs;
      existing.viewsCount = (existing.viewsCount || 1) + (durationMs === 0 ? 1 : 0);
      this.sessionsBuffer.set(key, existing);
    }
  }

  // --- Section Analytics Buffer & Rate Limiting ---

  /**
   * Validates duration limit per session per minute (EC-ANALYTICS-02).
   * durationMs sum per session per minute < 120,000ms.
   */
  checkAndRecordSessionDuration(sessionId: string, additionalMs: number): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let records = this.recentSessionDurations.get(sessionId) || [];
    // Filter to last 60 seconds
    records = records.filter((r) => r.timestamp > oneMinuteAgo);

    const currentTotal = records.reduce((sum, r) => sum + r.durationMs, 0);
    if (currentTotal + additionalMs > 120000) {
      return false; // Exceeds threshold (replay / anomaly)
    }

    records.push({ timestamp: now, durationMs: additionalMs });
    this.recentSessionDurations.set(sessionId, records);
    return true;
  }

  async bufferSectionViews(views: BufferedSectionView[]): Promise<void> {
    // In production, this dispatches to GCP Pub/Sub topic 'section-views-buffer' (RULE AN-001)
    // Buffered for batch ClickHouse ingestion
    this.sectionViewsBuffer.push(...views);

    // Invalidate document cache upon new telemetry
    if (views.length > 0) {
      const docId = views[0].documentId;
      this.analyticsCache.delete(`sections:${docId}`);
      this.analyticsCache.delete(`full:${docId}`);
    }
  }

  // --- Aggregations with 5-minute Cache ---

  async getSectionAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<SectionAnalyticsSummary[]> {
    const cacheKey = `sections:${documentId}`;
    const cached = this.analyticsCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    // Filter matching views
    const matchingViews = this.sectionViewsBuffer.filter(
      (v) => v.documentId === documentId && v.organizationId === organizationId,
    );

    // Group by blockId
    const blockMap = new Map<
      string,
      {
        sectionTitle: string | null;
        totalDurationMs: number;
        visibilitySum: number;
        viewsCount: number;
        uniqueSessions: Set<string>;
      }
    >();

    for (const view of matchingViews) {
      const existing = blockMap.get(view.blockId) || {
        sectionTitle: view.sectionTitle || null,
        totalDurationMs: 0,
        visibilitySum: 0,
        viewsCount: 0,
        uniqueSessions: new Set<string>(),
      };

      existing.totalDurationMs += view.durationMs;
      existing.visibilitySum += view.visibilityPct;
      existing.viewsCount += 1;
      existing.uniqueSessions.add(view.sessionId);
      if (!existing.sectionTitle && view.sectionTitle) {
        existing.sectionTitle = view.sectionTitle;
      }

      blockMap.set(view.blockId, existing);
    }

    const result: SectionAnalyticsSummary[] = Array.from(blockMap.entries()).map(
      ([blockId, data]) => ({
        blockId,
        sectionTitle: data.sectionTitle,
        totalDurationMs: data.totalDurationMs,
        avgVisibilityPct:
          data.viewsCount > 0 ? Math.round((data.visibilitySum / data.viewsCount) * 100) / 100 : 0,
        uniqueSessions: data.uniqueSessions.size,
        viewsCount: data.viewsCount,
      }),
    );

    // Cache for 5 minutes (300,000 ms)
    this.analyticsCache.set(cacheKey, {
      data: result,
      expiresAt: now + 300000,
    });

    return result;
  }

  async getViewerSessions(
    documentId: string,
    organizationId: string,
  ): Promise<ViewerSessionSummary[]> {
    const matching: ViewerSessionSummary[] = [];

    for (const session of this.sessionsBuffer.values()) {
      if (session.documentId === documentId && session.organizationId === organizationId) {
        matching.push({
          sessionId: session.sessionId,
          viewerEmail: session.viewerEmail,
          firstOpenedAt: session.startedAt.toISOString(),
          lastActiveAt: session.lastActiveAt.toISOString(),
          viewsCount: session.viewsCount || 1,
          timeSpentSeconds: Math.floor(session.durationMs / 1000),
          device: (session.userAgent || '').toLowerCase().includes('mobile') ? 'Mobile' : 'Desktop',
          country: session.country,
        });
      }
    }

    // Sort desc by firstOpenedAt
    return matching.sort(
      (a, b) => new Date(b.firstOpenedAt).getTime() - new Date(a.firstOpenedAt).getTime(),
    );
  }

  async getDocumentMetrics(
    documentId: string,
    organizationId: string,
  ): Promise<DocumentAnalyticsSummary> {
    const matchingSessions: BufferedViewerSession[] = [];
    const uniqueSessionIds = new Set<string>();

    for (const s of this.sessionsBuffer.values()) {
      if (s.documentId === documentId && s.organizationId === organizationId) {
        matchingSessions.push(s);
        uniqueSessionIds.add(s.sessionId);
      }
    }

    let totalDurationMs = 0;
    let latestView: Date | null = null;

    matchingSessions.forEach((s) => {
      totalDurationMs += s.durationMs;
      if (!latestView || s.lastActiveAt > latestView) {
        latestView = s.lastActiveAt;
      }
    });

    return {
      documentId,
      // RULE ACC-001: COUNT(DISTINCT session_id)
      uniqueViews: uniqueSessionIds.size,
      totalDurationSeconds: Math.floor(totalDurationMs / 1000),
      lastViewedAt: latestView ? (latestView as Date).toISOString() : null,
      sessionsCount: matchingSessions.length,
    };
  }

  async getFullDocumentAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<DocumentAnalyticsFullResponse> {
    const summary = await this.getDocumentMetrics(documentId, organizationId);
    const sections = await this.getSectionAnalytics(documentId, organizationId);
    const viewers = await this.getViewerSessions(documentId, organizationId);

    // Calculate document completion rate:
    // Sections that have >= 50% average visibility divided by total tracked sections
    const completedSections = sections.filter((s) => s.avgVisibilityPct >= 0.5).length;
    const completionRate =
      sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;

    return {
      summary,
      completionRate,
      sections,
      viewers,
      nextCursor: null, // End of cursor batch
    };
  }

  // For testing verification
  clearBuffer(): void {
    this.sessionsBuffer.clear();
    this.sectionViewsBuffer = [];
    this.recentSessionDurations.clear();
    this.analyticsCache.clear();
  }
}
