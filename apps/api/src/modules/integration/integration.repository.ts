import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationConnection, CrmSyncEvent } from '@prisma/client';
import { generateId, secureRandom, aesGcmEncrypt, aesGcmDecrypt } from '@pactintel/shared-utils';

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class IntegrationRepository {
  // Cell Master KMS key for integration tokens envelope encryption
  private readonly masterKey = Buffer.from(
    (process.env.INTEGRATION_KMS_MASTER_KEY || 'pactintel_kms_cell_master_key_32b!')
      .padEnd(32, '0')
      .slice(0, 32),
    'utf8',
  );
  private readonly kmsKeyId =
    process.env.KMS_KEY_INTEGRATIONS ||
    'projects/pactintel-prod-us1/locations/global/keyRings/pactintel/cryptoKeys/integration-tokens';

  constructor(private readonly prisma: PrismaService) {}

  async createConnection(
    orgId: string,
    provider: string,
    tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
    externalPortalId?: string,
  ): Promise<IntegrationConnection> {
    const id = generateId();

    // 1. Envelope Encryption for OAuth tokens
    const dek = secureRandom(32);
    const plaintextPayload = JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    const encryptedPayload = aesGcmEncrypt(plaintextPayload, dek);
    const dekCiphertext = aesGcmEncrypt(dek, this.masterKey);

    return this.prisma.$transaction(async (tx) => {
      const connection = await tx.integrationConnection.create({
        data: {
          id,
          organizationId: orgId,
          provider,
          status: 'active',
          encryptedOauthToken: new Uint8Array(encryptedPayload),
          dekCiphertext: new Uint8Array(dekCiphertext),
          kmsKeyId: this.kmsKeyId,
          tokenExpiresAt: tokens.expiresAt,
          externalPortalId: externalPortalId || null,
          scopes: ['contacts', 'deals'],
          settings: {},
        },
      });

      // Outbox event (Architecture Invariant I-06 & Sprint 5.2)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'integration.connected',
          aggregateType: 'integration_connection',
          aggregateId: connection.id,
          payload: {
            connectionId: connection.id,
            organizationId: orgId,
            provider: connection.provider,
            externalPortalId: connection.externalPortalId,
          },
        },
      });

      return connection;
    });
  }

  async findAll(
    orgId: string,
  ): Promise<Omit<IntegrationConnection, 'encryptedOauthToken' | 'dekCiphertext'>[]> {
    return this.prisma.integrationConnection.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        provider: true,
        status: true,
        kmsKeyId: true,
        tokenExpiresAt: true,
        scopes: true,
        externalPortalId: true,
        syncCursor: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId?: string): Promise<IntegrationConnection | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.integrationConnection.findFirst({ where });
  }

  async findActiveByOrg(orgId: string, provider = 'hubspot'): Promise<IntegrationConnection[]> {
    return this.prisma.integrationConnection.findMany({
      where: {
        organizationId: orgId,
        provider,
        status: 'active',
        deletedAt: null,
      },
    });
  }

  async decryptTokens(connection: IntegrationConnection): Promise<DecryptedTokens> {
    if (!connection.encryptedOauthToken || !connection.dekCiphertext) {
      throw new Error(`Integration connection ${connection.id} is missing encrypted tokens.`);
    }

    // 1. Decrypt DEK using Master KMS key
    const dek = aesGcmDecrypt(Buffer.from(connection.dekCiphertext), this.masterKey);

    // 2. Decrypt token payload using DEK
    const plaintextBuffer = aesGcmDecrypt(Buffer.from(connection.encryptedOauthToken), dek);
    const parsed = JSON.parse(plaintextBuffer.toString('utf8'));

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  }

  async updateTokens(
    id: string,
    orgId: string,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: Date },
  ): Promise<void> {
    const existing = await this.findById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Connection ${id} not found.`);
    }

    const currentTokens = await this.decryptTokens(existing);
    const newRefreshToken = tokens.refreshToken || currentTokens.refreshToken;

    const dek = secureRandom(32);
    const plaintextPayload = JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: newRefreshToken,
    });
    const encryptedPayload = aesGcmEncrypt(plaintextPayload, dek);
    const dekCiphertext = aesGcmEncrypt(dek, this.masterKey);

    await this.prisma.integrationConnection.update({
      where: { id },
      data: {
        encryptedOauthToken: new Uint8Array(encryptedPayload),
        dekCiphertext: new Uint8Array(dekCiphertext),
        tokenExpiresAt: tokens.expiresAt,
        status: 'active',
        updatedAt: new Date(),
      },
    });
  }

  async updateStatus(
    id: string,
    orgId: string,
    status: 'active' | 'revoked' | 'error',
  ): Promise<void> {
    await this.prisma.integrationConnection.updateMany({
      where: { id, organizationId: orgId },
      data: { status, updatedAt: new Date() },
    });
  }

  async updateSettings(id: string, orgId: string, settings: any): Promise<void> {
    await this.prisma.integrationConnection.updateMany({
      where: { id, organizationId: orgId },
      data: { settings, updatedAt: new Date() },
    });
  }

  async softDelete(id: string, orgId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.integrationConnection.updateMany({
        where: { id, organizationId: orgId },
        data: { deletedAt: new Date(), status: 'revoked' },
      });

      // Outbox event (Architecture Invariant I-06 & Sprint 5.2)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'integration.revoked',
          aggregateType: 'integration_connection',
          aggregateId: id,
          payload: {
            connectionId: id,
            organizationId: orgId,
          },
        },
      });
    });
  }

  async recordSyncEvent(data: {
    organizationId: string;
    connectionId: string;
    entityType: 'contact' | 'deal' | 'company';
    entityIdLocal?: string;
    entityIdExternal?: string;
    direction: 'push' | 'pull';
    status: 'success' | 'error' | 'skipped';
    changes?: any;
    errorMessage?: string;
  }): Promise<CrmSyncEvent> {
    return this.prisma.crmSyncEvent.create({
      data: {
        id: generateId(),
        organizationId: data.organizationId,
        connectionId: data.connectionId,
        entityType: data.entityType,
        entityIdLocal: data.entityIdLocal || null,
        entityIdExternal: data.entityIdExternal || null,
        direction: data.direction,
        status: data.status,
        changes: data.changes || {},
        errorMessage: data.errorMessage || null,
      },
    });
  }

  async getSyncStats(connectionId: string, orgId: string) {
    const totalEvents = await this.prisma.crmSyncEvent.count({
      where: { connectionId, organizationId: orgId },
    });
    const successEvents = await this.prisma.crmSyncEvent.count({
      where: { connectionId, organizationId: orgId, status: 'success' },
    });
    const errorEvents = await this.prisma.crmSyncEvent.count({
      where: { connectionId, organizationId: orgId, status: 'error' },
    });
    const lastEvent = await this.prisma.crmSyncEvent.findFirst({
      where: { connectionId, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      totalEvents,
      successEvents,
      errorEvents,
      lastSyncAt: lastEvent?.createdAt || null,
      lastSyncStatus: lastEvent?.status || null,
    };
  }
}
