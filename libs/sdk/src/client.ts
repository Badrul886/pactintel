export interface PactIntelClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class PactIntelApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, message: string, code = 'API_ERROR', requestId?: string) {
    super(message);
    this.name = 'PactIntelApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class PactIntelClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: PactIntelClientOptions) {
    if (!options.apiKey) {
      throw new Error('PactIntelClient requires a valid apiKey.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://api.pactintel.com/api/v1').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs || 10000;
    this.maxRetries = options.maxRetries || 3;
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
            'User-Agent': 'PactIntel-NodeSDK/1.0.0',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (res.ok) {
          if (res.status === 204) return {} as T;
          return (await res.json()) as T;
        }

        // Retry on 429 (Rate Limit) or 503 (Transient Unavailable)
        if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        const errJson = await res.json().catch(() => ({}));
        const message =
          errJson.error?.message || errJson.message || `Request failed with status ${res.status}`;
        const code = errJson.error?.code || 'HTTP_ERROR';
        const reqId = errJson.error?.requestId || res.headers.get('x-request-id') || undefined;

        throw new PactIntelApiError(res.status, message, code, reqId);
      } catch (err: any) {
        if (err instanceof PactIntelApiError) throw err;
        if (attempt < this.maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new PactIntelApiError(0, err.message || 'Network error', 'NETWORK_ERROR');
      }
    }

    throw new PactIntelApiError(500, 'Max retries exhausted', 'MAX_RETRIES');
  }

  readonly documents = {
    list: (params?: { cursor?: string; limit?: number; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.cursor) q.set('cursor', params.cursor);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.status) q.set('status', params.status);
      return this.request<{ items: any[]; nextCursor: string | null }>(`/documents?${q}`);
    },
    get: (id: string) => this.request<any>(`/documents/${id}`),
    create: (data: {
      title: string;
      type: string;
      templateId?: string;
      variables?: Record<string, unknown>;
    }) => this.request<any>('/documents', 'POST', data),
    update: (id: string, data: Record<string, unknown>) =>
      this.request<any>(`/documents/${id}`, 'PATCH', data),
    delete: (id: string) => this.request<void>(`/documents/${id}`, 'DELETE'),
    send: (id: string, signers: Array<{ name: string; email: string; role?: string }>) =>
      this.request<any>(`/documents/${id}/send`, 'POST', { signers }),
  };

  readonly forms = {
    list: () => this.request<any[]>('/forms'),
    get: (id: string) => this.request<any>(`/forms/${id}`),
    create: (data: {
      name: string;
      workspaceId?: string;
      definition?: Record<string, unknown>;
      settings?: Record<string, unknown>;
    }) => this.request<any>('/forms', 'POST', data),
    publish: (id: string) => this.request<any>(`/forms/${id}/publish`, 'POST'),
    getSubmissions: (id: string) => this.request<any[]>(`/forms/${id}/submissions`),
  };

  readonly webhooks = {
    list: () => this.request<any[]>('/webhooks'),
    get: (id: string) => this.request<any>(`/webhooks/${id}`),
    create: (data: { url: string; events: string[]; description?: string }) =>
      this.request<any>('/webhooks', 'POST', data),
    delete: (id: string) => this.request<void>(`/webhooks/${id}`, 'DELETE'),
    test: (id: string) => this.request<any>(`/webhooks/${id}/test`, 'POST'),
  };

  readonly devices = {
    register: (platform: 'ios' | 'android', token: string) =>
      this.request<any>('/devices/register', 'POST', { platform, token }),
    deregister: (deviceId: string) => this.request<void>(`/devices/${deviceId}`, 'DELETE'),
  };

  readonly apiKeys = {
    list: () => this.request<any[]>('/api-keys'),
    create: (name: string, scopes?: string[], expiresInDays?: number) =>
      this.request<any>('/api-keys', 'POST', { name, scopes, expiresInDays, mfaVerified: true }),
    revoke: (id: string) => this.request<void>(`/api-keys/${id}`, 'DELETE'),
  };
}
