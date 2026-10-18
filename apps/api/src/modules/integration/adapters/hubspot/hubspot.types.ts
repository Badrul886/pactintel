export interface CrmContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface CrmDeal {
  name: string;
  amount: number;
  stage?: string;
  pipeline?: string;
  closeDate?: Date;
}

export interface HubspotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class RetryableError extends Error {
  public readonly retryAfter: number;

  constructor(message: string, retryAfterMs = 2000) {
    super(message);
    this.name = 'RetryableError';
    this.retryAfter = retryAfterMs;
  }
}

export class IntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationAuthError';
  }
}
