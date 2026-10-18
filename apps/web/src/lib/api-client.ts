import { ApiResponse, PaginatedResponse, ApiError } from '@pactintel/shared-types';

export class ApiClientError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(error: ApiError['error']) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
  }
}

export interface RequestOptions extends RequestInit {
  organizationId?: string;
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, organizationId, ...customConfig } = options;

    let url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(organizationId ? { 'X-Organization-ID': organizationId } : {}),
      ...((customConfig.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...customConfig,
      headers,
      credentials: 'include',
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (data && data.error) {
        throw new ApiClientError(data.error);
      }
      throw new ApiClientError({
        code: 'HTTP_ERROR',
        message: response.statusText || 'Request failed',
      });
    }

    return data as T;
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>(endpoint, { ...options, method: 'GET' });
  }

  async getPaginated<T>(endpoint: string, options?: RequestOptions): Promise<PaginatedResponse<T>> {
    return this.request<PaginatedResponse<T>>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patch<T>(
    endpoint: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<ApiResponse<T>>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
