import { Injectable, NotFoundException } from '@nestjs/common';
import { generateApiKey, sha256, generateId } from '@pactintel/shared-utils';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a new API key.
   * Returns plaintext key ONCE to the caller (RULE AUTH-002).
   */
  async createApiKey(
    organizationId: string,
    userId: string,
    name: string,
    scopes: string[] = ['*'],
    expiresInDays?: number,
  ) {
    const { plaintextKey, keyPrefix, keyHash } = generateApiKey();

    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400 * 1000) : null;

    const record = await this.prisma.apiKey.create({
      data: {
        id: generateId(), // UUIDv7 internal PK
        organizationId,
        name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt,
        createdBy: userId,
      },
    });

    return {
      apiKey: plaintextKey, // Plaintext returned once
      id: record.id,
      name: record.name,
      prefix: record.keyPrefix,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    };
  }

  /**
   * Validates an API key using SHA-256 index lookup (D-13, X-21).
   */
  async validateApiKey(plaintextKey: string) {
    const keyHash = sha256(plaintextKey);
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
      return null;
    }

    // Update last_used_at asynchronously
    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return key;
  }

  /**
   * Revokes an API key.
   */
  async revokeApiKey(organizationId: string, apiKeyId: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
    });

    if (!key) {
      throw new NotFoundException('API Key not found');
    }

    return this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Lists all active and revoked API keys for an organization.
   * Note: plaintext key is NEVER returned (RULE AUTH-002).
   */
  async listApiKeys(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
