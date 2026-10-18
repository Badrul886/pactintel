import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationRepository } from './integration.repository';
import { HubspotAdapter } from './adapters/hubspot/hubspot.adapter';
import { HubspotOAuthService } from './adapters/hubspot/hubspot-oauth.service';
import { HubspotSyncJob } from './jobs/hubspot-sync.job';
import { DocumentSignedListener } from './listeners/document-signed.listener';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [IntegrationController],
  providers: [
    IntegrationService,
    IntegrationRepository,
    HubspotAdapter,
    HubspotOAuthService,
    HubspotSyncJob,
    DocumentSignedListener,
    PrismaService,
  ],
  exports: [
    IntegrationService,
    IntegrationRepository,
    HubspotAdapter,
    HubspotSyncJob,
    DocumentSignedListener,
  ],
})
export class IntegrationModule {}
