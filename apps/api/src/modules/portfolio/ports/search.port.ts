export interface SearchDocument {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  counterpartyName?: string;
  status: string;
  type?: string;
  effectiveDate?: string;
  expirationDate?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchQueryOptions {
  query: string;
  organizationId: string;
  counterpartyId?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  status: string;
  type?: string;
  counterpartyName?: string;
  snippet?: string;
  score?: number;
}

export interface SearchQueryResult {
  items: SearchResultItem[];
  total: number;
  engine: 'meilisearch' | 'postgres-fts';
}

export interface SearchPort {
  search(options: SearchQueryOptions): Promise<SearchQueryResult>;
  indexDocument(doc: SearchDocument): Promise<void>;
  deleteDocument(id: string, organizationId: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
