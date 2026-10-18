import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { generateId } from '@pactintel/shared-utils';
import { AnalyticsRepository, BufferedViewerSession } from './analytics.repository';
import { DocumentAnalyticsSummary } from '@pactintel/shared-types';

export const TRANSPARENT_1X1_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly repository: AnalyticsRepository) {}

  /**
   * Tracks a document view via 1x1 transparent tracking GIF (RULE AN-001 & ACC-001).
   * Generates or reuses session cookie.
   * Emits outbox event 'analytics.document_viewed_first_time' only on first view for session.
   */
  async recordPixelView(
    documentSlug: string,
    cookieSessionId?: string,
    ipAddress?: string,
    country?: string,
    viewerEmail?: string,
  ): Promise<{
    gifBuffer: Buffer;
    sessionId: string;
    isFirstView: boolean;
    documentId: string | null;
  }> {
    const sessionId = cookieSessionId || generateId();
    const document = await this.repository.findDocumentBySlugOrId(documentSlug);

    if (!document) {
      // Return 1x1 GIF so client viewer never crashes even if slug is unmatched
      return {
        gifBuffer: TRANSPARENT_1X1_GIF,
        sessionId,
        isFirstView: false,
        documentId: null,
      };
    }

    const existingSession = await this.repository.getSession(sessionId, document.id);

    if (!existingSession) {
      // First view for this unique session (RULE ACC-001)
      const newSession: BufferedViewerSession = {
        sessionId,
        organizationId: document.organizationId,
        documentId: document.id,
        viewerEmail: viewerEmail || null,
        startedAt: new Date(),
        lastActiveAt: new Date(),
        ipAddress: ipAddress || null,
        country: country || null,
        durationMs: 0,
      };

      // Buffer into Pub/Sub simulation (RULE AN-001: never direct ClickHouse insert)
      await this.repository.bufferFirstView(newSession);

      // Write transactional outbox event for first view notification triggers
      await this.repository.recordFirstViewOutbox(
        document.organizationId,
        document.id,
        sessionId,
        viewerEmail,
      );

      this.logger.log(
        `[Analytics] First view recorded for doc ${document.id} (session ${sessionId})`,
      );

      return {
        gifBuffer: TRANSPARENT_1X1_GIF,
        sessionId,
        isFirstView: true,
        documentId: document.id,
      };
    }

    // Returning heartbeat ping
    await this.repository.updateHeartbeat(sessionId, document.id, 0);

    return {
      gifBuffer: TRANSPARENT_1X1_GIF,
      sessionId,
      isFirstView: false,
      documentId: document.id,
    };
  }

  /**
   * Heartbeat reading telemetry.
   * Max duration per heartbeat chunk: 1 hour (3,600,000 ms).
   */
  async recordHeartbeat(
    documentSlug: string,
    sessionId: string,
    durationMs: number,
  ): Promise<void> {
    if (durationMs > 3600000 || durationMs < 0) {
      throw new BadRequestException('durationMs must be between 0 and 3,600,000 ms');
    }

    const document = await this.repository.findDocumentBySlugOrId(documentSlug);
    if (!document) return;

    await this.repository.updateHeartbeat(sessionId, document.id, durationMs);
  }

  /**
   * Returns document analytics metrics adhering to RULE ACC-001.
   * Unique views = COUNT(DISTINCT session_id).
   */
  async getDocumentAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<DocumentAnalyticsSummary> {
    const metrics = await this.repository.getDocumentMetrics(documentId, organizationId);

    return {
      documentId,
      uniqueViews: metrics.uniqueViews,
      totalDurationSeconds: metrics.totalDurationSeconds,
      lastViewedAt: metrics.lastViewedAt ? metrics.lastViewedAt.toISOString() : null,
      sessionsCount: metrics.sessionsCount,
    };
  }
}
