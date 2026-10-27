import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookPort, WebhookDispatchOptions, WebhookDispatchResult } from '../ports/webhook.port';

@Injectable()
export class WebhookAdapter implements WebhookPort {
  private readonly logger = new Logger(WebhookAdapter.name);

  computeHmacSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  async sendWebhook(options: WebhookDispatchOptions): Promise<WebhookDispatchResult> {
    const { url, payload, secret, eventType, eventId } = options;
    const timeoutMs = options.timeoutMs ?? 10000; // 10s default (EC-WH-01)
    const payloadString = JSON.stringify(payload);
    const timestamp = Date.now();
    const signature = this.computeHmacSignature(payloadString, secret);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PactIntel-Signature': `t=${timestamp},v1=${signature}`,
          'X-PactIntel-Event': eventType,
          'X-PactIntel-Event-ID': eventId,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const text = await response.text().catch(() => '');
      const responseBody = text.substring(0, 2000); // Truncate response body

      if (response.ok) {
        return {
          success: true,
          httpStatus: response.status,
          responseBody,
        };
      }

      return {
        success: false,
        httpStatus: response.status,
        responseBody,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      this.logger.warn(
        `[WebhookAdapter] Dispatch to ${url} failed: ${isTimeout ? 'Timeout (>10s)' : err.message}`,
      );

      return {
        success: false,
        httpStatus: isTimeout ? 408 : 0,
        error: isTimeout ? 'Request timed out after 10000ms' : err.message,
      };
    }
  }
}
