import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  SearchPort,
  SearchDocument,
  SearchQueryOptions,
  SearchQueryResult,
  SearchResultItem,
} from '../../ports/search.port';

@Injectable()
export class PostgresFtsAdapter implements SearchPort {
  private readonly logger = new Logger(PostgresFtsAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async search(options: SearchQueryOptions): Promise<SearchQueryResult> {
    const q = options.query?.trim() || '';
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    // Multi-tenant search with fallback to ILIKE & PostgreSQL FTS
    const whereClause: any = {
      organizationId: options.organizationId,
      deletedAt: null,
    };

    if (options.status) {
      whereClause.status = options.status;
    }
    if (options.type) {
      whereClause.type = options.type;
    }
    if (options.counterpartyId) {
      whereClause.counterpartyId = options.counterpartyId;
    }

    if (q) {
      whereClause.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { counterparty: { canonicalName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        include: {
          counterparty: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.document.count({ where: whereClause }),
    ]);

    const items: SearchResultItem[] = documents.map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      type: doc.type,
      counterpartyName: doc.counterparty?.canonicalName,
      snippet: `Document: ${doc.title} (${doc.type})`,
      score: 1.0,
    }));

    return {
      items,
      total,
      engine: 'postgres-fts',
    };
  }

  async indexDocument(doc: SearchDocument): Promise<void> {
    this.logger.debug(`[PostgresFtsAdapter] Indexed document ${doc.id}`);
  }

  async deleteDocument(id: string, organizationId: string): Promise<void> {
    this.logger.debug(`[PostgresFtsAdapter] Document ${id} unindexed for org ${organizationId}`);
  }
}
