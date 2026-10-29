import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { EngagementScoreSummary } from '@pactintel/shared-types';

export interface ComputeScoreParams {
  totalDurationSeconds: number;
  completionRatePct: number;
  sessionsCount: number;
  uniqueViewersCount: number;
  daysSinceLastView: number;
  previousDaysSinceLastView?: number;
  isCompleted?: boolean;
}

@Injectable()
export class EngagementScoringService {
  private readonly logger = new Logger(EngagementScoringService.name);

  constructor(private readonly repository: AnalyticsRepository) {}

  /**
   * Computes multi-factor proprietary engagement score (0-100).
   * Edge cases handled:
   * - EC-ENGAGE-01: Bounce protection (< 3s dwell yields 0 time score).
   * - EC-ENGAGE-02: Dormancy / disengagement threshold (>= 7 days triggers -35 pt decay).
   * - EC-ENGAGE-03: Re-engagement detection (dormant deal reopened).
   * - EC-ENGAGE-04: Signed/completed document freezing.
   */
  calculateScore(params: ComputeScoreParams): EngagementScoreSummary['breakdown'] & {
    score: number;
    isDisengaged: boolean;
    isReengaged: boolean;
  } {
    const {
      totalDurationSeconds,
      completionRatePct,
      sessionsCount,
      uniqueViewersCount,
      daysSinceLastView,
      previousDaysSinceLastView = 0,
      isCompleted = false,
    } = params;

    // EC-ENGAGE-01: Bounce protection (if dwell is under 3 seconds, dwell time score is 0)
    let timeOnPageScore = 0;
    if (totalDurationSeconds >= 3) {
      timeOnPageScore = Math.min(40, Math.round((totalDurationSeconds / 300) * 40));
    }

    // Completion score: max 30 pts (based on section visibility)
    const clampedCompletionPct = Math.max(0, Math.min(100, completionRatePct));
    const completionScore = Math.round((clampedCompletionPct / 100) * 30);

    // Return visits score: max 15 pts (3 pts per return session)
    const returnVisitsScore = Math.min(15, Math.max(0, sessionsCount - 1) * 3);

    // Multiple viewers / stakeholders score: max 15 pts (5 pts per unique viewer)
    const uniqueViewersScore = Math.min(15, Math.max(0, uniqueViewersCount) * 5);

    let rawScore = timeOnPageScore + completionScore + returnVisitsScore + uniqueViewersScore;
    rawScore = Math.min(100, Math.max(0, rawScore));

    // EC-ENGAGE-04: Completed / signed contracts freeze their score without decay or disengagement
    if (isCompleted) {
      return {
        score: rawScore,
        timeOnPageScore,
        completionScore,
        returnVisitsScore,
        uniqueViewersScore,
        recencyPenalty: 0,
        isDisengaged: false,
        isReengaged: false,
      };
    }

    // EC-ENGAGE-02: Inactivity decay (>= 7 days)
    const isDisengaged = daysSinceLastView >= 7;
    const recencyPenalty = isDisengaged ? 35 : 0;
    const finalScore = Math.max(0, rawScore - recencyPenalty);

    // EC-ENGAGE-03: Re-engagement detection (dormant >= 7 days suddenly active within 1 day)
    const isReengaged = previousDaysSinceLastView >= 7 && daysSinceLastView < 1;

    return {
      score: finalScore,
      timeOnPageScore,
      completionScore,
      returnVisitsScore,
      uniqueViewersScore,
      recencyPenalty,
      isDisengaged,
      isReengaged,
    };
  }

  /**
   * Evaluates engagement score for a document, updates ClickHouse/repository store,
   * and writes transactional outbox events on state transitions (Invariant I-06).
   */
  async evaluateDocumentEngagement(
    documentId: string,
    organizationId: string,
  ): Promise<EngagementScoreSummary> {
    const docData = await this.repository.getDocumentEngagementData(documentId, organizationId);
    if (!docData) {
      // Document not found or has no activity
      return {
        documentId,
        score: 0,
        breakdown: {
          timeOnPageScore: 0,
          completionScore: 0,
          returnVisitsScore: 0,
          uniqueViewersScore: 0,
          recencyPenalty: 0,
        },
        isDisengaged: false,
        isReengaged: false,
        daysSinceLastView: 0,
        calculatedAt: new Date().toISOString(),
      };
    }

    const isCompleted = ['signed', 'declined', 'completed'].includes(
      (docData.status || '').toLowerCase(),
    );

    const now = Date.now();
    const lastViewTime = docData.lastViewedAt ? new Date(docData.lastViewedAt).getTime() : now;
    const daysSinceLastView = Math.max(0, Math.floor((now - lastViewTime) / (1000 * 60 * 60 * 24)));

    const result = this.calculateScore({
      totalDurationSeconds: docData.totalDurationSeconds,
      completionRatePct: docData.completionRatePct,
      sessionsCount: docData.sessionsCount,
      uniqueViewersCount: docData.uniqueViewersCount,
      daysSinceLastView,
      previousDaysSinceLastView: docData.previousDaysSinceLastView ?? daysSinceLastView,
      isCompleted,
    });

    const summary: EngagementScoreSummary = {
      documentId,
      score: result.score,
      breakdown: {
        timeOnPageScore: result.timeOnPageScore,
        completionScore: result.completionScore,
        returnVisitsScore: result.returnVisitsScore,
        uniqueViewersScore: result.uniqueViewersScore,
        recencyPenalty: result.recencyPenalty,
      },
      isDisengaged: result.isDisengaged,
      isReengaged: result.isReengaged,
      daysSinceLastView,
      calculatedAt: new Date().toISOString(),
    };

    // Save to repository / ClickHouse buffer
    await this.repository.saveEngagementScore(documentId, organizationId, summary);

    // Handle outbox events on state transition
    if (result.isDisengaged && !docData.wasDisengaged && !isCompleted) {
      this.logger.warn(
        `[EngagementScore] Document ${documentId} (org ${organizationId}) became DISENGAGED (score: ${result.score})`,
      );
      await this.repository.recordEngagementOutbox(
        organizationId,
        documentId,
        'analytics.engagement.disengaged',
        {
          documentId,
          score: result.score,
          daysSinceLastView,
          title: docData.title,
        },
      );
    } else if (result.isReengaged && !isCompleted) {
      this.logger.log(
        `[EngagementScore] Document ${documentId} (org ${organizationId}) RE-ENGAGED after dormancy (score: ${result.score})`,
      );
      await this.repository.recordEngagementOutbox(
        organizationId,
        documentId,
        'analytics.engagement.reengaged',
        {
          documentId,
          score: result.score,
          daysSinceLastView,
          title: docData.title,
        },
      );
    }

    return summary;
  }
}
