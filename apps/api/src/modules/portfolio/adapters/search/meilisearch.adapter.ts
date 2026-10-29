import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from '../../../../common/resilience/circuit-breaker';
import {
  SearchPort,
  SearchDocument,
  SearchQueryOptions,
  SearchQueryResult,
  SearchResultItem,
} from '../../ports/search.port';

@Injectable()
export class MeilisearchAdapter implements SearchPort {
  private readonly host: string;
  private readonly apiKey: string;
  private readonly indexName = 'documents';
  private readonly breaker = new CircuitBreaker({ name: 'meilisearch' });

  constructor() {
    this.host = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
    this.apiKey = process.env.MEILISEARCH_API_KEY || 'pactintel_local_master_key_12345';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(options: SearchQueryOptions): Promise<SearchQueryResult> {
    return this.breaker.execute(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Meilisearch service unavailable');
      }

      // Build Meilisearch filter string for multi-tenant isolation
      const filters: string[] = [`organizationId = "${options.organizationId}"`];
      if (options.status) {
        filters.push(`status = "${options.status}"`);
      }
      if (options.type) {
        filters.push(`type = "${options.type}"`);
      }
      if (options.counterpartyId) {
        filters.push(`counterpartyId = "${options.counterpartyId}"`);
      }

      const payload = {
        q: options.query,
        filter: filters.join(' AND '),
        limit: options.limit || 20,
        offset: options.offset || 0,
        attributesToHighlight: ['title', 'content'],
        attributesToCrop: ['content'],
        cropLength: 30,
      };

      const res = await fetch(`${this.host}/indexes/${this.indexName}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Meilisearch search failed with HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const items: SearchResultItem[] = (data.hits || []).map((hit: any) => ({
        id: hit.id,
        title: hit.title,
        status: hit.status,
        type: hit.type,
        counterpartyName: hit.counterpartyName,
        snippet: hit._formatted?.content || hit.content?.slice(0, 200),
        score: hit._rankingScore,
      }));

      return {
        items,
        total: data.estimatedTotalHits || items.length,
        engine: 'meilisearch',
      };
    });
  }

  async indexDocument(doc: SearchDocument): Promise<void> {
    return this.breaker.execute(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Meilisearch service unavailable');
      }

      const res = await fetch(`${this.host}/indexes/${this.indexName}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify([doc]),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Meilisearch document indexing failed with HTTP ${res.status}: ${errText}`);
      }
    });
  }

  async deleteDocument(id: string, _organizationId: string): Promise<void> {
    return this.breaker.execute(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        throw new Error('Meilisearch service unavailable');
      }

      const res = await fetch(`${this.host}/indexes/${this.indexName}/documents/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok && res.status !== 404) {
        const errText = await res.text();
        throw new Error(`Meilisearch delete failed with HTTP ${res.status}: ${errText}`);
      }
    });
  }
}
