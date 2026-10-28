import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { MeilisearchAdapter } from './adapters/search/meilisearch.adapter';
import { PostgresFtsAdapter } from './adapters/search/postgres-fts.adapter';
import { AiGateway } from '../ai/gateway/ai.gateway';
import { SearchQueryOptions, SearchQueryResult } from './ports/search.port';
import { CreateCustomExtractionFieldDto } from '@pactintel/shared-types';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly repository: PortfolioRepository,
    private readonly meilisearchAdapter: MeilisearchAdapter,
    private readonly postgresFtsAdapter: PostgresFtsAdapter,
    private readonly aiGateway: AiGateway,
  ) {}

  /**
   * Search portfolio agreements and clauses.
   * Primary: Meilisearch (typo-tolerant, faceted, rapid ranking).
   * Invariant I-12: Transparent fallback to PostgreSQL FTS when Meilisearch is degraded/offline.
   */
  async search(options: SearchQueryOptions): Promise<SearchQueryResult> {
    try {
      return await this.meilisearchAdapter.search(options);
    } catch (err: any) {
      this.logger.warn(
        `[Search Degradation] Meilisearch primary search failed: ${err.message}. Gracefully falling back to PostgresFtsAdapter.`,
      );
      return await this.postgresFtsAdapter.search(options);
    }
  }

  async getDashboardMetrics(organizationId: string) {
    return this.repository.getPortfolioDashboardMetrics(organizationId);
  }

  async listCustomFields(organizationId: string) {
    return this.repository.findCustomFields(organizationId);
  }

  async createCustomField(organizationId: string, dto: CreateCustomExtractionFieldDto) {
    return this.repository.createCustomField({
      organizationId,
      fieldName: dto.fieldName,
      description: dto.description,
      fieldType: dto.fieldType,
    });
  }

  async deleteCustomField(id: string, organizationId: string) {
    return this.repository.deleteCustomField(id, organizationId);
  }

  /**
   * Generates AI Portfolio Executive Intelligence & Risk Assessment Report.
   */
  async generatePortfolioReport(
    organizationId: string,
    userId: string,
    options?: { focusArea?: string },
  ) {
    const metrics = await this.repository.getPortfolioDashboardMetrics(organizationId);
    const { items: pendingObligations } = await this.repository.findObligations(organizationId, {
      hasPendingUpdate: true,
      limit: 10,
    });
    const { items: counterparties } = await this.repository.findCounterparties(organizationId, {
      limit: 20,
    });

    const portfolioSummary = {
      overview: metrics,
      pendingAmendmentReviewsCount: pendingObligations.length,
      samplePendingObligations: pendingObligations.map((o) => ({
        fieldName: o.fieldName,
        documentTitle: o.document?.title,
        pendingUpdate: o.pendingUpdate,
      })),
      topCounterparties: counterparties.map((c) => ({
        name: c.canonicalName,
        agreementsCount: c._count.documents,
      })),
    };

    const aiResult = await this.aiGateway.generate(
      'portfolio-report',
      {
        portfolioData: JSON.stringify(portfolioSummary, null, 2),
        focusArea: options?.focusArea || 'Executive Renewal Deadlines and High-Risk Exposure',
      },
      {
        organizationId,
        userId,
      },
    );

    return {
      report: aiResult.content,
      generatedAt: new Date().toISOString(),
      tokensUsed: aiResult.tokensUsed,
    };
  }
}
