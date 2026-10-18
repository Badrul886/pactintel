import { Injectable, Logger } from '@nestjs/common';
import { IntegrationRepository } from '../integration.repository';
import { HubspotAdapter } from '../adapters/hubspot/hubspot.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { RetryableError, IntegrationAuthError } from '../adapters/hubspot/hubspot.types';

export interface HubspotSyncJobPayload {
  connectionId: string;
  organizationId: string;
  entityType: 'contact' | 'deal';
  documentId?: string;
}

@Injectable()
export class HubspotSyncJob {
  private readonly logger = new Logger(HubspotSyncJob.name);

  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly hubspotAdapter: HubspotAdapter,
    private readonly prisma: PrismaService,
  ) {}

  async process(
    payload: HubspotSyncJobPayload,
  ): Promise<{ success: boolean; externalId?: string }> {
    const { connectionId, organizationId, entityType, documentId } = payload;
    this.logger.log(
      `[HubSpotSync] Processing ${entityType} sync for conn ${connectionId} (doc: ${documentId || 'none'})`,
    );

    try {
      const connection = await this.integrationRepo.findById(connectionId, organizationId);
      if (!connection || connection.status !== 'active') {
        this.logger.warn(`[HubSpotSync] Connection ${connectionId} is not active. Skipping.`);
        await this.integrationRepo.recordSyncEvent({
          organizationId,
          connectionId,
          entityType,
          entityIdLocal: documentId,
          direction: 'push',
          status: 'skipped',
          errorMessage: 'Connection is not in active state.',
        });
        return { success: false };
      }

      // 1. Decrypt tokens
      let tokens = await this.integrationRepo.decryptTokens(connection);

      // 2. Check token expiration; refresh if expired
      if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
        this.logger.log(
          `[HubSpotSync] Access token for conn ${connectionId} is expired. Refreshing...`,
        );
        const refreshed = await this.hubspotAdapter.refreshAccessToken(tokens.refreshToken);
        await this.integrationRepo.updateTokens(connectionId, organizationId, {
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
        });
        tokens = { accessToken: refreshed.accessToken, refreshToken: tokens.refreshToken };
      }

      let externalId = '';

      // 3. Sync Contact or Deal
      if (entityType === 'contact') {
        // Load document counterparties if documentId present
        let contactEmail = 'recipient@client.org';
        let firstName = 'Valued';
        let lastName = 'Client';

        if (documentId) {
          const doc = await this.prisma.document.findUnique({
            where: { id: documentId },
            include: {
              signatureRequests: {
                include: { signers: true },
              },
            },
          });
          const firstSigner = doc?.signatureRequests?.[0]?.signers?.[0];
          if (firstSigner) {
            contactEmail = firstSigner.email;
            if (firstSigner.name) {
              firstName = firstSigner.name.split(' ')[0] || firstName;
              lastName = firstSigner.name.split(' ').slice(1).join(' ') || lastName;
            }
          }
        }

        const res = await this.hubspotAdapter.upsertContact(tokens.accessToken, {
          email: contactEmail,
          firstName,
          lastName,
        });
        externalId = res.externalId;
      } else {
        // Deal sync
        let dealName = 'Contract Agreement';
        let amount = 1000;

        if (documentId) {
          const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
          if (doc) {
            dealName = `${doc.title} - Signed`;
            amount = doc.totalValue ? parseFloat(doc.totalValue.toString()) : amount;
          }
        }

        const res = await this.hubspotAdapter.upsertDeal(tokens.accessToken, {
          name: dealName,
          amount,
          stage: 'closedwon',
        });
        externalId = res.externalId;
      }

      // 4. Record successful sync event
      await this.integrationRepo.recordSyncEvent({
        organizationId,
        connectionId,
        entityType,
        entityIdLocal: documentId,
        entityIdExternal: externalId,
        direction: 'push',
        status: 'success',
        changes: { externalId },
      });

      this.logger.log(
        `[HubSpotSync] Successfully synced ${entityType} -> external ID: ${externalId}`,
      );
      return { success: true, externalId };
    } catch (err: any) {
      this.logger.error(`[HubSpotSync] Failed to sync ${entityType}: ${err.message}`);

      // If auth revoked, mark connection as error
      if (err instanceof IntegrationAuthError) {
        await this.integrationRepo.updateStatus(connectionId, organizationId, 'error');
      }

      // Record failed sync event in audit trail
      await this.integrationRepo.recordSyncEvent({
        organizationId,
        connectionId,
        entityType,
        entityIdLocal: documentId,
        direction: 'push',
        status: 'error',
        errorMessage: err.message,
      });

      // Retryable errors should bubble up for BullMQ backoff retry
      if (err instanceof RetryableError) {
        throw err;
      }

      // Non-retryable error swallowed so queue job doesn't loop forever
      return { success: false };
    }
  }
}
