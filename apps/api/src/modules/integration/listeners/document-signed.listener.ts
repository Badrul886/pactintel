import { Injectable, Logger } from '@nestjs/common';
import { IntegrationRepository } from '../integration.repository';
import { HubspotSyncJob } from '../jobs/hubspot-sync.job';

@Injectable()
export class DocumentSignedListener {
  private readonly logger = new Logger(DocumentSignedListener.name);

  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly syncJob: HubspotSyncJob,
  ) {}

  /**
   * Triggers CRM sync on 'document.signed' outbox event.
   * Architecture Invariant I-12: Non-critical external integrations MUST degrade gracefully.
   * A failure in HubSpot must NEVER disrupt or fail the document signing process!
   */
  async handleDocumentSigned(payload: {
    documentId: string;
    organizationId: string;
  }): Promise<void> {
    const { documentId, organizationId } = payload;
    this.logger.log(
      `[DocumentSignedListener] Outbox event 'document.signed' received for doc: ${documentId}`,
    );

    try {
      const activeConnections = await this.integrationRepo.findActiveByOrg(
        organizationId,
        'hubspot',
      );
      if (!activeConnections || activeConnections.length === 0) {
        return;
      }

      for (const connection of activeConnections) {
        try {
          // Sync Contact
          await this.syncJob.process({
            connectionId: connection.id,
            organizationId,
            entityType: 'contact',
            documentId,
          });

          // Sync Deal
          await this.syncJob.process({
            connectionId: connection.id,
            organizationId,
            entityType: 'deal',
            documentId,
          });
        } catch (innerErr: any) {
          // RULE I-12: Log and SWALLOW per-connection errors. Document remains signed!
          this.logger.error(
            `[DocumentSignedListener] CRM sync failed for connection ${connection.id}: ${innerErr.message}`,
          );
        }
      }
    } catch (err: any) {
      // RULE I-12: Outermost swallow ensures document operations are completely decoupled
      this.logger.error(
        `[DocumentSignedListener] Unexpected error in document-signed handler: ${err.message}`,
      );
    }
  }
}
