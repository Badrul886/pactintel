import { Injectable } from '@nestjs/common';
import { IntegrationPort } from '../../ports/integration.port';
import {
  CrmContact,
  CrmDeal,
  HubspotTokenResponse,
  RetryableError,
  IntegrationAuthError,
} from './hubspot.types';

@Injectable()
export class HubspotAdapter implements IntegrationPort {
  private readonly clientId = process.env.HUBSPOT_CLIENT_ID || 'mock_hubspot_client_id';
  private readonly clientSecret = process.env.HUBSPOT_CLIENT_SECRET || 'mock_hubspot_client_secret';
  private readonly redirectUri =
    process.env.HUBSPOT_REDIRECT_URI ||
    'http://localhost:4000/api/v1/integrations/hubspot/callback';
  private readonly apiBase = 'https://api.hubapi.com';

  getAuthorizationUrl(state: string): string {
    const scopes = [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
    ].join('%20');

    return (
      `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(this.clientId)}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&scope=${scopes}` +
      `&state=${encodeURIComponent(state)}`
    );
  }

  async exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    const res = await this.executeFetch(`${this.apiBase}/oauth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await res.json()) as HubspotTokenResponse;
    const expiresAt = new Date(Date.now() + (data.expires_in || 1800) * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    const res = await this.executeFetch(`${this.apiBase}/oauth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await res.json()) as HubspotTokenResponse;
    const expiresAt = new Date(Date.now() + (data.expires_in || 1800) * 1000);

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  }

  async upsertContact(token: string, contact: CrmContact): Promise<{ externalId: string }> {
    const payload = {
      properties: {
        email: contact.email,
        firstname: contact.firstName || '',
        lastname: contact.lastName || '',
        phone: contact.phone || '',
      },
    };

    const res = await this.executeFetch(`${this.apiBase}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { externalId: String(data.id || 'contact-mock-id') };
  }

  async upsertDeal(token: string, deal: CrmDeal): Promise<{ externalId: string }> {
    const payload = {
      properties: {
        dealname: deal.name,
        amount: String(deal.amount),
        dealstage: deal.stage || 'contractsent',
        pipeline: deal.pipeline || 'default',
        closedate: (deal.closeDate || new Date()).toISOString(),
      },
    };

    const res = await this.executeFetch(`${this.apiBase}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { externalId: String(data.id || 'deal-mock-id') };
  }

  async associateDealWithContact(token: string, dealId: string, contactId: string): Promise<void> {
    const url = `${this.apiBase}/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`;
    await this.executeFetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Safe fetch with standard timeout, 429 retryable backoff, and 401 auth handling (RULE ERR-002)
   */
  private async executeFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s circuit timeout

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 2000;
        throw new RetryableError(
          `HubSpot rate limit (429) exceeded. Retry after ${retryMs}ms`,
          retryMs,
        );
      }

      if (res.status === 401) {
        throw new IntegrationAuthError('HubSpot API authorization expired or invalid (401).');
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HubSpot API error (${res.status}): ${errorText}`);
      }

      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new RetryableError('HubSpot API request timed out (10s limit).', 2000);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
