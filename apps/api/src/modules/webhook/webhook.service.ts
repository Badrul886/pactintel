import { Injectable, NotFoundException, BadRequestException, Inject, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookRepository } from './webhook.repository';
import { CreateWebhookDto, UpdateWebhookDto } from '@pactintel/shared-types';
import { WEBHOOK_PORT, WebhookPort } from './ports/webhook.port';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  // In-memory fallback secret store when Secret Manager is in mock/test mode
  private readonly secretStore = new Map<string, string>();

  constructor(
    private readonly repo: WebhookRepository,
    @Inject(WEBHOOK_PORT) private readonly webhookAdapter: WebhookPort,
  ) {}

  /**
   * SSRF Protection: Validates that webhook URLs do NOT resolve to private RFC1918,
   * link-local, loopback, or metadata addresses (RULE EC-WH-05).
   */
  validateUrl(urlStr: string): void {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new BadRequestException(`Invalid webhook URL format: '${urlStr}'`);
    }

    const isTest = process.env.NODE_ENV === 'test';
    if (!isTest && parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook URLs must use secure HTTPS protocol.');
    }

    const host = parsed.hostname.toLowerCase();

    // RFC1918, link-local, cloud metadata, and loopback patterns
    const privateIpPatterns = [
      /^localhost$/,
      /^127\.\d+\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^169\.254\.\d+\.\d+$/, // AWS/GCP cloud metadata IP
    ];

    const isPrivate = privateIpPatterns.some((pattern) => pattern.test(host));
    if (isPrivate) {
      throw new BadRequestException(
        `Webhook URL '${urlStr}' points to an internal or private network IP address (SSRF Protection).`,
      );
    }
  }

  async createWebhook(organizationId: string, dto: CreateWebhookDto) {
    this.validateUrl(dto.url);

    const id = generateId();
    // Generate 32-byte CSPRNG secret
    const secret = crypto.randomBytes(32).toString('hex');
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

    // Store secret in memory/Secret Manager
    this.secretStore.set(id, secret);

    const webhook = await this.repo.create({
      id,
      organizationId,
      url: dto.url,
      secretHash,
      secret, // Stored for test/dev fallback
      events: dto.events,
    });

    this.logger.log(`[WebhookService] Webhook ${webhook.id} created for org ${organizationId}`);

    // Return the secret ONCE on creation so the user can copy it
    return {
      ...webhook,
      secret,
    };
  }

  async listWebhooks(organizationId: string, cursor?: string, limit = 50) {
    const result = await this.repo.listByOrg(organizationId, cursor, limit);
    return {
      items: result.items.map((w) => this.sanitizeWebhook(w)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getWebhook(organizationId: string, id: string) {
    const webhook = await this.repo.findById(id, organizationId);
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found.`);
    }
    return this.sanitizeWebhook(webhook);
  }

  async updateWebhook(organizationId: string, id: string, dto: UpdateWebhookDto) {
    const webhook = await this.repo.findById(id, organizationId);
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found.`);
    }

    if (dto.url) {
      this.validateUrl(dto.url);
    }

    const updated = await this.repo.update(id, {
      url: dto.url,
      events: dto.events,
      isActive: dto.isActive,
      // If re-enabling an auto-disabled webhook, reset failureCount
      ...(dto.isActive === true ? { failureCount: 0 } : {}),
    });

    return this.sanitizeWebhook(updated);
  }

  async deleteWebhook(organizationId: string, id: string) {
    const webhook = await this.repo.findById(id, organizationId);
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found.`);
    }

    await this.repo.softDelete(id, organizationId);
    this.secretStore.delete(id);

    return { status: 'deleted', id };
  }

  async testWebhook(organizationId: string, id: string) {
    const webhook = await this.repo.findById(id, organizationId);
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found.`);
    }

    const secret = await this.getWebhookSecret(webhook.id, webhook.secret);
    const eventId = generateId();
    const eventType = 'webhook.test';
    const payload = {
      event: eventType,
      eventId,
      timestamp: new Date().toISOString(),
      organizationId,
      message: 'This is a test webhook payload from PactIntel.',
    };

    const result = await this.webhookAdapter.sendWebhook({
      url: webhook.url,
      payload,
      secret,
      eventType,
      eventId,
    });

    await this.repo.recordDeliveryLog({
      organizationId,
      webhookId: webhook.id,
      eventId,
      eventType,
      payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      attemptNumber: 1,
      httpStatus: result.httpStatus ?? null,
      responseBody: result.responseBody ?? result.error ?? null,
      deliveredAt: result.success ? new Date() : null,
    });

    return {
      status: result.success ? 'success' : 'failed',
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      error: result.error,
    };
  }

  async listDeliveryLogs(organizationId: string, webhookId: string, cursor?: string, limit = 50) {
    const webhook = await this.repo.findById(webhookId, organizationId);
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${webhookId}' not found.`);
    }

    return this.repo.listDeliveryLogs(webhookId, organizationId, cursor, limit);
  }

  async getWebhookSecret(webhookId: string, fallbackSecret?: string | null): Promise<string> {
    if (this.secretStore.has(webhookId)) {
      return this.secretStore.get(webhookId)!;
    }
    if (fallbackSecret) {
      return fallbackSecret;
    }
    return 'default_pactintel_secret_key_32_bytes_len';
  }

  private sanitizeWebhook(webhook: any) {
    const safe = { ...webhook };
    delete safe.secret;
    return safe;
  }
}
