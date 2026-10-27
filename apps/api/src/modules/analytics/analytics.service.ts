import {
  Injectable,
  Logger,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { generateId } from '@pactintel/shared-utils';
import {
  AnalyticsRepository,
  BufferedViewerSession,
  BufferedSectionView,
} from './analytics.repository';
import {
  DocumentAnalyticsSummary,
  SectionViewEvent,
  SectionAnalyticsSummary,
  DocumentAnalyticsFullResponse,
} from '@pactintel/shared-types';

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
    userAgent?: string,
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
        viewsCount: 1,
        userAgent: userAgent || null,
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
   * Batch section-level engagement events (Sprint 2.1, RULE AN-001, EC-ANALYTICS-01..05).
   * - Max 50 events per batch
   * - Rate limit / replay defense: durationMs sum per session per minute < 120,000ms
   * - Pub/Sub buffer ONLY
   * - Resilient: errors swallowed and logged — never returns 5xx to recipient
   */
  async recordSectionEvents(
    documentSlug: string,
    sessionId: string,
    events: SectionViewEvent[],
  ): Promise<void> {
    // EC-ANALYTICS-01: Max 50 events per batch
    if (!events || events.length === 0) {
      return;
    }
    if (events.length > 50) {
      throw new UnprocessableEntityException('Section batch size cannot exceed 50 events');
    }

    // Calculate total duration for this batch and individual bounds
    let batchDurationSum = 0;
    for (const event of events) {
      if (event.durationMs < 0 || event.durationMs > 3600000) {
        throw new BadRequestException('durationMs must be between 0 and 3,600,000 ms');
      }
      if (event.visibilityPct < 0 || event.visibilityPct > 1) {
        throw new BadRequestException('visibilityPct must be between 0.0 and 1.0');
      }
      batchDurationSum += event.durationMs;
    }

    // EC-ANALYTICS-02: durationMs sum per session per minute < 120,000ms
    const isWithinRateLimit = this.repository.checkAndRecordSessionDuration(
      sessionId,
      batchDurationSum,
    );
    if (!isWithinRateLimit) {
      this.logger.warn(
        `[Analytics] Rate limit exceeded for session ${sessionId}: sum of durationMs > 120,000 ms/min`,
      );
      throw new UnprocessableEntityException(
        'Session telemetry volume exceeded rate limit window (max 120s per minute)',
      );
    }

    // Lookup document
    const document = await this.repository.findDocumentBySlugOrId(documentSlug);
    if (!document) {
      this.logger.debug(
        `[Analytics] Document not found for slug ${documentSlug}. Swallowing gracefully.`,
      );
      return;
    }

    // Construct buffered section view records (UUIDv7 via generateId())
    const sectionViews: BufferedSectionView[] = events.map((event) => ({
      eventId: generateId(),
      organizationId: document.organizationId,
      documentId: document.id,
      sessionId,
      blockId: event.blockId,
      sectionTitle: event.sectionTitle || null,
      durationMs: event.durationMs,
      visibilityPct: event.visibilityPct,
      scrollDepthPct: event.scrollDepthPct ?? event.visibilityPct,
      createdAt: new Date(),
    }));

    // EC-ANALYTICS-03: Pub/Sub buffer publish — swallow error and never return 5xx
    try {
      await this.repository.bufferSectionViews(sectionViews);
    } catch (err: any) {
      this.logger.error(`[Analytics] Failed to buffer section views: ${err.message}`, err.stack);
      // Swallow error — client recipient experience must never be disrupted
    }
  }

  /**
   * Returns section-level metrics for a document (cached for 5 min).
   * GET /api/v1/documents/:id/analytics/sections
   */
  async getSectionAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<SectionAnalyticsSummary[]> {
    return this.repository.getSectionAnalytics(documentId, organizationId);
  }

  /**
   * Returns full analytics dashboard payload (Overview KPIs, Heatmap, Viewer table).
   * GET /api/v1/documents/:id/analytics/full
   */
  async getFullDocumentAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<DocumentAnalyticsFullResponse> {
    return this.repository.getFullDocumentAnalytics(documentId, organizationId);
  }

  /**
   * Returns basic document analytics summary (ACC-001).
   */
  async getDocumentAnalytics(
    documentId: string,
    organizationId: string,
  ): Promise<DocumentAnalyticsSummary> {
    return this.repository.getDocumentMetrics(documentId, organizationId);
  }
}
