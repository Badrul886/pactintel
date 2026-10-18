import { Injectable } from '@nestjs/common';
import { PrismaClient, Document, OutboxEvent } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';

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
}

@Injectable()
export class AnalyticsRepository {
  private prisma: PrismaClient;

  // Pub/Sub buffer & ClickHouse buffer storage (RULE AN-001)
  private sessionsBuffer: Map<string, BufferedViewerSession> = new Map();

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
    this.sessionsBuffer.set(key, session);
  }

  async updateHeartbeat(sessionId: string, documentId: string, durationMs: number): Promise<void> {
    const key = `${documentId}:${sessionId}`;
    const existing = this.sessionsBuffer.get(key);
    if (existing) {
      existing.lastActiveAt = new Date();
      existing.durationMs += durationMs;
      this.sessionsBuffer.set(key, existing);
    }
  }

  // --- Analytics Aggregations (RULE ACC-001: Unique views = COUNT(DISTINCT session_id)) ---

  async getDocumentMetrics(
    documentId: string,
    organizationId: string,
  ): Promise<{
    uniqueViews: number;
    totalDurationSeconds: number;
    lastViewedAt: Date | null;
    sessionsCount: number;
  }> {
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
      // RULE ACC-001: COUNT(DISTINCT session_id)
      uniqueViews: uniqueSessionIds.size,
      totalDurationSeconds: Math.floor(totalDurationMs / 1000),
      lastViewedAt: latestView,
      sessionsCount: matchingSessions.length,
    };
  }

  // For testing verification
  clearBuffer(): void {
    this.sessionsBuffer.clear();
  }
}
