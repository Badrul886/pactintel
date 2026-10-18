import { Injectable, Logger } from '@nestjs/common';

export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);
  private readonly defaultTimeoutMs = 10000; // 10s default per RULE ERR-002

  async request<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    const timeout = options.timeoutMs || this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `External HTTP call failed with status ${response.status}: ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`HTTP request to ${url} timed out after ${timeout}ms (RULE ERR-002)`);
        throw new Error(`External service request timed out after ${timeout}ms`);
      }
      this.logger.error(`HTTP request to ${url} encountered an error:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
