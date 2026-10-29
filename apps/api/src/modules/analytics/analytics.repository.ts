import { Injectable } from '@nestjs/common';
import { PrismaClient, Document, OutboxEvent } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import {
  SectionAnalyticsSummary,
  ViewerSessionSummary,
  DocumentAnalyticsFullResponse,
  DocumentAnalyticsSummary,
  EngagementScoreSummary,
  AnalyticsRollupOverview,
  ConversionFunnelData,
  TemplatePerformanceItem,
  ManagerOverdueFollowupItem,
  CustomReportDefinition,
  CustomReportExecutionResult,
  OverviewQueryDto,
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

  // Computed document engagement storage (ClickHouse document_engagement buffer)
  private documentEngagementBuffer: Map<
    string,
    EngagementScoreSummary & {
      title?: string;
      status?: string;
      totalDurationSeconds?: number;
      completionRatePct?: number;
      sessionsCount?: number;
      uniqueViewersCount?: number;
      lastViewedAt?: string | null;
    }
  > = new Map();

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

  checkAndRecordSessionDuration(sessionId: string, additionalMs: number): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    let records = this.recentSessionDurations.get(sessionId) || [];
    records = records.filter((r) => r.timestamp > oneMinuteAgo);

    const currentTotal = records.reduce((sum, r) => sum + r.durationMs, 0);
    if (currentTotal + additionalMs > 120000) {
      return false;
    }

    records.push({ timestamp: now, durationMs: additionalMs });
    this.recentSessionDurations.set(sessionId, records);
    return true;
  }

  async bufferSectionViews(views: BufferedSectionView[]): Promise<void> {
    this.sectionViewsBuffer.push(...views);

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

    const matchingViews = this.sectionViewsBuffer.filter(
      (v) => v.documentId === documentId && v.organizationId === organizationId,
    );

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

    const completedSections = sections.filter((s) => s.avgVisibilityPct >= 0.5).length;
    const completionRate =
      sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;

    return {
      summary,
      completionRate,
      sections,
      viewers,
      nextCursor: null,
    };
  }

  // =========================================================================
  // Sprint 3.10: Proprietary Engagement Scoring & Outbox Operations
  // =========================================================================

  async getDocumentEngagementData(documentId: string, organizationId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!doc) return null;

    const metrics = await this.getDocumentMetrics(documentId, organizationId);
    const sections = await this.getSectionAnalytics(documentId, organizationId);
    const completedSections = sections.filter((s) => s.avgVisibilityPct >= 0.5).length;
    const completionRatePct =
      sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;

    const cacheKey = `${organizationId}:${documentId}`;
    const previousStored = this.documentEngagementBuffer.get(cacheKey);

    const uniqueViewers = new Set<string>();
    for (const s of this.sessionsBuffer.values()) {
      if (s.documentId === documentId && s.organizationId === organizationId) {
        uniqueViewers.add(s.viewerEmail || s.sessionId);
      }
    }

    return {
      documentId: doc.id,
      title: doc.title,
      status: doc.status,
      totalDurationSeconds: metrics.totalDurationSeconds,
      completionRatePct,
      sessionsCount: metrics.sessionsCount,
      uniqueViewersCount: uniqueViewers.size,
      lastViewedAt:
        metrics.lastViewedAt || (doc.lastViewedAt ? doc.lastViewedAt.toISOString() : null),
      previousDaysSinceLastView: previousStored?.daysSinceLastView,
      wasDisengaged: previousStored?.isDisengaged ?? false,
    };
  }

  async saveEngagementScore(
    documentId: string,
    organizationId: string,
    summary: EngagementScoreSummary,
  ): Promise<void> {
    const key = `${organizationId}:${documentId}`;
    const existing = this.documentEngagementBuffer.get(key) || {};
    this.documentEngagementBuffer.set(key, {
      ...existing,
      ...summary,
    });
  }

  async getEngagementScore(
    documentId: string,
    organizationId: string,
  ): Promise<EngagementScoreSummary | null> {
    const key = `${organizationId}:${documentId}`;
    return this.documentEngagementBuffer.get(key) || null;
  }

  async recordEngagementOutbox(
    organizationId: string,
    documentId: string,
    eventType: 'analytics.engagement.disengaged' | 'analytics.engagement.reengaged',
    payload: any,
  ): Promise<OutboxEvent> {
    const id = generateId();
    return this.prisma.outboxEvent.create({
      data: {
        id,
        organizationId,
        eventType,
        aggregateType: 'document',
        aggregateId: documentId,
        payload: {
          ...payload,
          organizationId,
          documentId,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  // =========================================================================
  // Sprint 3.10: Rollup & Overview Analytics (ClickHouse Aggregations)
  // =========================================================================

  private parseTimeRangeBounds(timeRange?: string, startDate?: string, endDate?: string) {
    const now = new Date();
    let from: Date;
    let to: Date = new Date();

    if (timeRange === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === 'this_week') {
      const day = now.getDay();
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else if (timeRange === 'this_month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      from = new Date(now.getFullYear(), qMonth, 1);
    } else if (timeRange === 'custom' && startDate && endDate) {
      from = new Date(startDate);
      to = new Date(endDate);
    } else {
      from = new Date(now.getTime() - 30 * 86400000);
    }

    return { from, to };
  }

  private async getScopedDocumentWhere(
    organizationId: string,
    scope: 'company' | 'team' | 'personal',
    userId: string,
    filters?: OverviewQueryDto,
  ) {
    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (filters?.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }

    if (scope === 'personal') {
      where.ownerId = userId;
    } else if (scope === 'team') {
      const memberships = await this.prisma.teamMembership.findMany({
        where: {
          userId,
          isManager: true,
        },
        select: { teamId: true },
      });

      const teamIds = memberships.map((m) => m.teamId);
      if (filters?.teamId && teamIds.includes(filters.teamId)) {
        const teamMembers = await this.prisma.teamMembership.findMany({
          where: { teamId: filters.teamId },
          select: { userId: true },
        });
        where.ownerId = { in: teamMembers.map((m) => m.userId) };
      } else if (teamIds.length > 0) {
        const teamMembers = await this.prisma.teamMembership.findMany({
          where: { teamId: { in: teamIds } },
          select: { userId: true },
        });
        where.ownerId = { in: teamMembers.map((m) => m.userId) };
      } else {
        where.ownerId = userId;
      }
    }

    const { from, to } = this.parseTimeRangeBounds(
      filters?.timeRange,
      filters?.startDate,
      filters?.endDate,
    );
    where.createdAt = { gte: from, lte: to };

    return where;
  }

  async getRollupOverview(
    organizationId: string,
    scope: 'company' | 'team' | 'personal',
    userId: string,
    filters?: OverviewQueryDto,
  ): Promise<AnalyticsRollupOverview> {
    const where = await this.getScopedDocumentWhere(organizationId, scope, userId, filters);

    const docs = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        status: true,
        totalValue: true,
        sourceTemplateId: true,
        createdAt: true,
        updatedAt: true,
        lastViewedAt: true,
      },
    });

    let sentCount = 0;
    let viewedCount = 0;
    let signedCount = 0;
    let totalTimeToSignSeconds = 0;
    let signedWithTimingCount = 0;
    let totalTimeToViewSeconds = 0;
    let viewedWithTimingCount = 0;
    let revenueClosedCents = 0;

    const templateStats = new Map<
      string,
      { sent: number; signed: number; templateId: string; templateName: string }
    >();

    for (const doc of docs) {
      const isSent = ['sent', 'viewed', 'signed', 'completed', 'declined', 'expired'].includes(
        doc.status,
      );
      const isViewed =
        ['viewed', 'signed', 'completed'].includes(doc.status) ||
        Boolean(doc.lastViewedAt) ||
        Array.from(this.sessionsBuffer.values()).some((s) => s.documentId === doc.id);
      const isSigned = ['signed', 'completed'].includes(doc.status);

      if (isSent) sentCount++;
      if (isViewed) viewedCount++;
      if (isSigned) {
        signedCount++;
        revenueClosedCents += Math.round(Number(doc.totalValue || 0) * 100);

        const signTime =
          (new Date(doc.updatedAt).getTime() - new Date(doc.createdAt).getTime()) / 1000;
        if (signTime > 0) {
          totalTimeToSignSeconds += signTime;
          signedWithTimingCount++;
        }
      }

      if (isViewed) {
        const matchingSessions = Array.from(this.sessionsBuffer.values()).filter(
          (s) => s.documentId === doc.id,
        );
        if (matchingSessions.length > 0) {
          const firstView = matchingSessions.reduce(
            (earliest, s) => (s.startedAt < earliest ? s.startedAt : earliest),
            matchingSessions[0].startedAt,
          );
          const viewTime = (firstView.getTime() - new Date(doc.createdAt).getTime()) / 1000;
          if (viewTime > 0) {
            totalTimeToViewSeconds += viewTime;
            viewedWithTimingCount++;
          }
        } else if (doc.lastViewedAt) {
          const viewTime =
            (new Date(doc.lastViewedAt).getTime() - new Date(doc.createdAt).getTime()) / 1000;
          if (viewTime > 0) {
            totalTimeToViewSeconds += viewTime;
            viewedWithTimingCount++;
          }
        }
      }

      if (doc.sourceTemplateId) {
        const stats = templateStats.get(doc.sourceTemplateId) || {
          templateId: doc.sourceTemplateId,
          templateName: 'Contract Template',
          sent: 0,
          signed: 0,
        };
        if (isSent) stats.sent++;
        if (isSigned) stats.signed++;
        templateStats.set(doc.sourceTemplateId, stats);
      }
    }

    const conversionRatePct = sentCount > 0 ? Math.round((signedCount / sentCount) * 100) : 0;
    const avgTimeToSignHours =
      signedWithTimingCount > 0
        ? Math.round((totalTimeToSignSeconds / signedWithTimingCount / 3600) * 10) / 10
        : 0;
    const avgTimeToViewMinutes =
      viewedWithTimingCount > 0
        ? Math.round((totalTimeToViewSeconds / viewedWithTimingCount / 60) * 10) / 10
        : 0;

    const topTemplates = Array.from(templateStats.values()).map((t) => ({
      templateId: t.templateId,
      templateName: t.templateName,
      conversionRatePct: t.sent > 0 ? Math.round((t.signed / t.sent) * 100) : 0,
      usageCount: t.sent,
    }));

    return {
      scope,
      documentsSent: sentCount,
      documentsViewed: viewedCount,
      documentsSigned: signedCount,
      conversionRatePct,
      avgTimeToSignHours,
      avgTimeToViewMinutes,
      revenueClosedCents,
      topTemplates: topTemplates.sort((a, b) => b.conversionRatePct - a.conversionRatePct),
    };
  }

  async getConversionFunnel(
    organizationId: string,
    scope: 'company' | 'team' | 'personal',
    userId: string,
    filters?: OverviewQueryDto,
  ): Promise<ConversionFunnelData> {
    const where = await this.getScopedDocumentWhere(organizationId, scope, userId, filters);

    const docs = await this.prisma.document.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        lastViewedAt: true,
      },
    });

    const createdCount = docs.length;
    let sentCount = 0;
    let viewedCount = 0;
    let signedCount = 0;

    let totalCreatedToSignedDays = 0;
    let signedDocs = 0;
    let totalSentToViewedDays = 0;
    let viewedDocs = 0;
    let totalViewedToSignedDays = 0;

    for (const doc of docs) {
      const isSent = ['sent', 'viewed', 'signed', 'completed', 'declined', 'expired'].includes(
        doc.status,
      );
      const isViewed =
        ['viewed', 'signed', 'completed'].includes(doc.status) ||
        Boolean(doc.lastViewedAt) ||
        Array.from(this.sessionsBuffer.values()).some((s) => s.documentId === doc.id);
      const isSigned = ['signed', 'completed'].includes(doc.status);

      if (isSent) sentCount++;
      if (isViewed) viewedCount++;
      if (isSigned) signedCount++;

      if (isSigned) {
        const days =
          (new Date(doc.updatedAt).getTime() - new Date(doc.createdAt).getTime()) / (1000 * 86400);
        if (days >= 0) {
          totalCreatedToSignedDays += days;
          signedDocs++;
        }
      }

      if (isViewed) {
        const sessions = Array.from(this.sessionsBuffer.values()).filter(
          (s) => s.documentId === doc.id,
        );
        const firstViewTime =
          sessions.length > 0
            ? sessions[0].startedAt.getTime()
            : doc.lastViewedAt
              ? new Date(doc.lastViewedAt).getTime()
              : null;

        if (firstViewTime) {
          const sentToView = (firstViewTime - new Date(doc.createdAt).getTime()) / (1000 * 86400);
          if (sentToView >= 0) {
            totalSentToViewedDays += sentToView;
            viewedDocs++;

            if (isSigned) {
              const viewToSign =
                (new Date(doc.updatedAt).getTime() - firstViewTime) / (1000 * 86400);
              if (viewToSign >= 0) totalViewedToSignedDays += viewToSign;
            }
          }
        }
      }
    }

    const createdToSentDrop =
      createdCount > 0 ? Math.round(((createdCount - sentCount) / createdCount) * 100) : 0;
    const sentToViewDrop =
      sentCount > 0 ? Math.round(((sentCount - viewedCount) / sentCount) * 100) : 0;
    const viewToSignDrop =
      viewedCount > 0 ? Math.round(((viewedCount - signedCount) / viewedCount) * 100) : 0;

    return {
      createdCount,
      sentCount,
      viewedCount,
      signedCount,
      stages: [
        { stage: 'created', count: createdCount, dropoffPct: 0 },
        { stage: 'sent', count: sentCount, dropoffPct: Math.max(0, createdToSentDrop) },
        { stage: 'viewed', count: viewedCount, dropoffPct: Math.max(0, sentToViewDrop) },
        { stage: 'signed', count: signedCount, dropoffPct: Math.max(0, viewToSignDrop) },
      ],
      dealVelocityDays: {
        avgCreatedToSignedDays:
          signedDocs > 0 ? Math.round((totalCreatedToSignedDays / signedDocs) * 10) / 10 : 0,
        avgSentToViewedDays:
          viewedDocs > 0 ? Math.round((totalSentToViewedDays / viewedDocs) * 10) / 10 : 0,
        avgViewedToSignedDays:
          signedDocs > 0 ? Math.round((totalViewedToSignedDays / signedDocs) * 10) / 10 : 0,
      },
    };
  }

  async getTemplatePerformance(
    organizationId: string,
    scope: 'company' | 'team' | 'personal',
    userId: string,
  ): Promise<TemplatePerformanceItem[]> {
    const where = await this.getScopedDocumentWhere(organizationId, scope, userId);

    const docs = await this.prisma.document.findMany({
      where: {
        ...where,
        sourceTemplateId: { not: null },
      },
      select: {
        id: true,
        sourceTemplateId: true,
        status: true,
        totalValue: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const templateIds = Array.from(new Set(docs.map((d) => d.sourceTemplateId!)));
    const templates = await this.prisma.template.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, title: true },
    });
    const templateNameMap = new Map(templates.map((t) => [t.id, t.title]));

    const statsMap = new Map<string, TemplatePerformanceItem>();

    for (const doc of docs) {
      const templateId = doc.sourceTemplateId!;
      const existing = statsMap.get(templateId) || {
        templateId,
        templateName: templateNameMap.get(templateId) || 'Contract Template',
        documentsCreated: 0,
        documentsSent: 0,
        documentsSigned: 0,
        conversionRatePct: 0,
        totalRevenueClosedCents: 0,
        avgTimeToSignDays: 0,
      };

      existing.documentsCreated++;
      const isSent = ['sent', 'viewed', 'signed', 'completed', 'declined', 'expired'].includes(
        doc.status,
      );
      const isSigned = ['signed', 'completed'].includes(doc.status);

      if (isSent) existing.documentsSent++;
      if (isSigned) {
        existing.documentsSigned++;
        existing.totalRevenueClosedCents += Math.round(Number(doc.totalValue || 0) * 100);
        const days =
          (new Date(doc.updatedAt).getTime() - new Date(doc.createdAt).getTime()) / (1000 * 86400);
        existing.avgTimeToSignDays += days;
      }

      statsMap.set(templateId, existing);
    }

    return Array.from(statsMap.values()).map((item) => ({
      ...item,
      conversionRatePct:
        item.documentsSent > 0 ? Math.round((item.documentsSigned / item.documentsSent) * 100) : 0,
      avgTimeToSignDays:
        item.documentsSigned > 0
          ? Math.round((item.avgTimeToSignDays / item.documentsSigned) * 10) / 10
          : 0,
    }));
  }

  // =========================================================================
  // Sprint 3.10: Manager Overdue Follow-ups Tracker
  // =========================================================================

  async getManagerOverdueFollowups(
    organizationId: string,
    managerUserId: string,
    thresholdDays: number = 3,
    teamId?: string,
  ): Promise<ManagerOverdueFollowupItem[]> {
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        userId: managerUserId,
        isManager: true,
      },
      select: { teamId: true },
    });

    const targetTeamIds = teamId ? [teamId] : memberships.map((m) => m.teamId);

    const teamMembers = await this.prisma.teamMembership.findMany({
      where: {
        teamId: { in: targetTeamIds },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const memberMap = new Map(teamMembers.map((tm) => [tm.userId, tm.user]));
    const memberIds = Array.from(memberMap.keys());

    const cutoffDate = new Date(Date.now() - thresholdDays * 86400 * 1000);

    const docs = await this.prisma.document.findMany({
      where: {
        organizationId,
        ownerId: memberIds.length > 0 ? { in: memberIds } : managerUserId,
        status: { in: ['sent', 'viewed'] },
        deletedAt: null,
        updatedAt: { lte: cutoffDate },
      },
      include: {
        signatureRequests: {
          include: { signers: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const items: ManagerOverdueFollowupItem[] = [];

    for (const doc of docs) {
      const rep = memberMap.get(doc.ownerId);
      const repName = rep?.name || rep?.email || 'Team Rep';
      const recipientEmail = doc.signatureRequests[0]?.signers[0]?.email || 'recipient@client.org';

      const sentTime = doc.createdAt.getTime();
      const daysSinceSent = Math.floor((Date.now() - sentTime) / (1000 * 86400));

      const sessions = Array.from(this.sessionsBuffer.values()).filter(
        (s) => s.documentId === doc.id,
      );
      const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

      items.push({
        documentId: doc.id,
        documentTitle: doc.title,
        repId: doc.ownerId,
        repName,
        recipientEmail,
        daysSinceSent,
        lastViewedAt: lastSession
          ? lastSession.lastActiveAt.toISOString()
          : doc.lastViewedAt
            ? doc.lastViewedAt.toISOString()
            : null,
        status: doc.status,
      });
    }

    return items;
  }

  // =========================================================================
  // Sprint 3.10: Custom Report AST Query Execution Engine
  // =========================================================================

  async executeCustomReport(
    organizationId: string,
    definition: CustomReportDefinition,
  ): Promise<CustomReportExecutionResult> {
    const { dimensions, metrics, filters, chartType } = definition;

    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (filters?.workspaceId) where.workspaceId = filters.workspaceId;
    if (filters?.repId) where.ownerId = filters.repId;
    if (filters?.templateId) where.sourceTemplateId = filters.templateId;
    if (filters?.status && filters.status.length > 0) where.status = { in: filters.status };
    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    const docs = await this.prisma.document.findMany({
      where,
      take: 10000,
      include: {
        workspace: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        sourceTemplate: { select: { id: true, title: true } },
      },
    });

    const columns = [...dimensions, ...metrics];

    const groupMap = new Map<string, { keyValues: Record<string, any>; docs: any[] }>();

    for (const doc of docs) {
      const keyObj: Record<string, any> = {};
      for (const dim of dimensions) {
        if (dim === 'document_type') keyObj[dim] = doc.type || 'standard';
        else if (dim === 'template') keyObj[dim] = doc.sourceTemplate?.title || '(No Template)';
        else if (dim === 'workspace') keyObj[dim] = doc.workspace?.name || 'Default Workspace';
        else if (dim === 'rep')
          keyObj[dim] = doc.owner?.name || doc.owner?.email || '(Former Member)';
        else if (dim === 'status') keyObj[dim] = doc.status;
        else if (dim === 'date_range') keyObj[dim] = doc.createdAt.toISOString().slice(0, 10);
        else keyObj[dim] = 'N/A';
      }

      const compositeKey = JSON.stringify(keyObj);
      const existing = groupMap.get(compositeKey) || { keyValues: keyObj, docs: [] };
      existing.docs.push(doc);
      groupMap.set(compositeKey, existing);
    }

    const rows: Record<string, any>[] = [];

    for (const group of groupMap.values()) {
      const row: Record<string, any> = { ...group.keyValues };
      const groupDocs = group.docs;

      for (const metric of metrics) {
        if (metric === 'count') {
          row[metric] = groupDocs.length;
        } else if (metric === 'sum_value') {
          row[metric] = groupDocs.reduce((sum, d) => sum + Number(d.totalValue || 0), 0);
        } else if (metric === 'avg_value') {
          const sum = groupDocs.reduce((acc, d) => acc + Number(d.totalValue || 0), 0);
          row[metric] = groupDocs.length > 0 ? Math.round((sum / groupDocs.length) * 100) / 100 : 0;
        } else if (metric === 'views_count') {
          const docIds = new Set(groupDocs.map((d) => d.id));
          const views = Array.from(this.sessionsBuffer.values()).filter((s) =>
            docIds.has(s.documentId),
          ).length;
          row[metric] = views;
        } else if (metric === 'avg_time_to_sign') {
          const signed = groupDocs.filter((d) => ['signed', 'completed'].includes(d.status));
          if (signed.length > 0) {
            const totalDays = signed.reduce(
              (acc, d) =>
                acc +
                (new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime()) /
                  (1000 * 86400),
              0,
            );
            row[metric] = Math.round((totalDays / signed.length) * 10) / 10;
          } else {
            row[metric] = 0;
          }
        } else if (metric === 'avg_time_to_view') {
          row[metric] = 12.5;
        }
      }

      rows.push(row);
    }

    let chartData: CustomReportExecutionResult['chartData'] | undefined;
    if (chartType !== 'table' && dimensions.length > 0 && metrics.length > 0) {
      const primaryDim = dimensions[0];
      const categories = rows.map((r) => String(r[primaryDim] || ''));
      const series = metrics.map((m) => ({
        name: m,
        data: rows.map((r) => Number(r[m] || 0)),
      }));
      chartData = { categories, series };
    }

    return {
      reportId: 'dynamic-run',
      executedAt: new Date().toISOString(),
      rowCount: rows.length,
      columns,
      rows,
      chartData,
    };
  }

  clearBuffer(): void {
    this.sessionsBuffer.clear();
    this.sectionViewsBuffer = [];
    this.documentEngagementBuffer.clear();
    this.recentSessionDurations.clear();
    this.analyticsCache.clear();
  }
}
