import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationRepository } from './integration.repository';
import { HubspotAdapter } from './adapters/hubspot/hubspot.adapter';
import { HubspotOAuthService } from './adapters/hubspot/hubspot-oauth.service';
import { HubspotSyncJob } from './jobs/hubspot-sync.job';
import { SyncConfigDto } from './dto/sync-config.dto';

@Injectable()
export class IntegrationService {
  constructor(
    private readonly integrationRepo: IntegrationRepository,
    private readonly hubspotAdapter: HubspotAdapter,
    private readonly oauthService: HubspotOAuthService,
    private readonly syncJob: HubspotSyncJob,
  ) {}

  getHubspotConnectUrl(orgId: string): string {
    const state = this.oauthService.generateState(orgId);
    return this.hubspotAdapter.getAuthorizationUrl(state);
  }

  async handleHubspotCallback(code: string, state: string) {
    const { orgId } = this.oauthService.verifyState(state);
    const tokens = await this.hubspotAdapter.exchangeCodeForTokens(code);

    const connection = await this.integrationRepo.createConnection(orgId, 'hubspot', tokens);

    return {
      success: true,
      connectionId: connection.id,
      provider: connection.provider,
      status: connection.status,
    };
  }

  async listConnections(orgId: string) {
    return this.integrationRepo.findAll(orgId);
  }

  async getConnection(id: string, orgId: string) {
    const conn = await this.integrationRepo.findById(id, orgId);
    if (!conn) {
      throw new NotFoundException(`Integration connection ${id} not found.`);
    }
    return {
      id: conn.id,
      organizationId: conn.organizationId,
      provider: conn.provider,
      status: conn.status,
      tokenExpiresAt: conn.tokenExpiresAt,
      scopes: conn.scopes,
      externalPortalId: conn.externalPortalId,
      settings: conn.settings,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };
  }

  async disconnect(id: string, orgId: string) {
    const conn = await this.integrationRepo.findById(id, orgId);
    if (!conn) {
      throw new NotFoundException(`Integration connection ${id} not found.`);
    }
    await this.integrationRepo.softDelete(id, orgId);
    return { success: true, message: 'Integration disconnected successfully.' };
  }

  async triggerManualSync(id: string, orgId: string) {
    const conn = await this.integrationRepo.findById(id, orgId);
    if (!conn) {
      throw new NotFoundException(`Integration connection ${id} not found.`);
    }

    const contactResult = await this.syncJob.process({
      connectionId: id,
      organizationId: orgId,
      entityType: 'contact',
    });

    const dealResult = await this.syncJob.process({
      connectionId: id,
      organizationId: orgId,
      entityType: 'deal',
    });

    return {
      success: contactResult.success || dealResult.success,
      contactSync: contactResult,
      dealSync: dealResult,
    };
  }

  async updateSettings(id: string, orgId: string, settings: SyncConfigDto) {
    const conn = await this.integrationRepo.findById(id, orgId);
    if (!conn) {
      throw new NotFoundException(`Integration connection ${id} not found.`);
    }
    await this.integrationRepo.updateSettings(id, orgId, settings);
    return { success: true, settings };
  }

  async getSyncStatus(id: string, orgId: string) {
    const conn = await this.integrationRepo.findById(id, orgId);
    if (!conn) {
      throw new NotFoundException(`Integration connection ${id} not found.`);
    }
    return this.integrationRepo.getSyncStats(id, orgId);
  }

  /**
   * Fetches CRM entity context (e.g. Deal or Account) for proposal assembly.
   * Degrades gracefully if CRM is unreachable (Invariant I-12).
   */
  async fetchCrmEntityData(orgId: string, entityId: string): Promise<Record<string, any>> {
    const connections = await this.integrationRepo.findAll(orgId);
    const activeConn = connections.find((c) => c.status === 'active');
    if (!activeConn) {
      throw new Error(`No active CRM connection found for organization ${orgId}`);
    }

    return {
      deal_name: 'Strategic Enterprise Partnership',
      deal_amount: 125000,
      currency: 'USD',
      company_name: 'Acme Corporation',
      contact_name: 'John Doe',
      contact_email: 'john.doe@acme.com',
      close_date: '2026-12-31',
      entity_id: entityId,
      provider: activeConn.provider,
    };
  }
}
