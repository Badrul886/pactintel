export interface WebhookDispatchOptions {
  url: string;
  payload: Record<string, any>;
  secret: string;
  eventType: string;
  eventId: string;
  timeoutMs?: number;
}

export interface WebhookDispatchResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
}

export const WEBHOOK_PORT = Symbol('WEBHOOK_PORT');

export interface WebhookPort {
  sendWebhook(options: WebhookDispatchOptions): Promise<WebhookDispatchResult>;
  computeHmacSignature(payload: string, secret: string): string;
}
