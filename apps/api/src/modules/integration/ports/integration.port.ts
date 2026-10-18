import { CrmContact, CrmDeal } from '../adapters/hubspot/hubspot.types';

export const INTEGRATION_PORT = 'INTEGRATION_PORT';

export interface IntegrationPort {
  getAuthorizationUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }>;
  upsertContact(token: string, contact: CrmContact): Promise<{ externalId: string }>;
  upsertDeal(token: string, deal: CrmDeal): Promise<{ externalId: string }>;
  associateDealWithContact(token: string, dealId: string, contactId: string): Promise<void>;
}
