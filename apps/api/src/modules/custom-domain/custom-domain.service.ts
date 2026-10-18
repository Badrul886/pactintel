import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { CustomDomainRepository } from './custom-domain.repository';
import { CloudflareSaasAdapter } from './adapters/cloudflare/cloudflare-saas.adapter';
import { validateDomain } from './dto/create-custom-domain.dto';
import { CustomDomain } from '@prisma/client';

export interface CustomDomainWithDns extends CustomDomain {
  dnsInstructions?: {
    type: string;
    name: string;
    value: string;
    fallbackOrigin: string;
    instructions: string;
  };
}

@Injectable()
export class CustomDomainService {
  private readonly logger = new Logger(CustomDomainService.name);

  constructor(
    private readonly customDomainRepo: CustomDomainRepository,
    private readonly cloudflareAdapter: CloudflareSaasAdapter,
  ) {}

  async create(organizationId: string, rawDomain: string): Promise<CustomDomainWithDns> {
    const domain = rawDomain.toLowerCase().trim();

    if (!validateDomain(domain)) {
      throw new BadRequestException(`Invalid domain format: ${domain}`);
    }

    const existing = await this.customDomainRepo.findByOrgAndDomain(organizationId, domain);
    if (existing) {
      throw new ConflictException(
        `Custom domain ${domain} is already registered for this organization.`,
      );
    }

    // Provision hostname via Cloudflare SaaS adapter (ADP-001)
    const provisionResult = await this.cloudflareAdapter.provisionHostname(domain, organizationId);

    const record = await this.customDomainRepo.create({
      organizationId,
      domain,
      cloudflareHostnameId: provisionResult.hostnameId,
      sslStatus: provisionResult.sslStatus,
    });

    this.logger.log(
      `[CustomDomainService] Created domain ${record.domain} (ID: ${record.id}) for org ${organizationId}`,
    );

    return {
      ...record,
      dnsInstructions: {
        type: provisionResult.verificationRecord.type,
        name: provisionResult.verificationRecord.name,
        value: provisionResult.verificationRecord.value,
        fallbackOrigin: 'cname.pactintel.com',
        instructions: `Create a ${provisionResult.verificationRecord.type} DNS record for '${provisionResult.verificationRecord.name}' pointing to '${provisionResult.verificationRecord.value}'.`,
      },
    };
  }

  async findAll(organizationId: string): Promise<CustomDomain[]> {
    return this.customDomainRepo.list(organizationId);
  }

  async findById(id: string, organizationId: string): Promise<CustomDomain> {
    const record = await this.customDomainRepo.findById(id, organizationId);
    if (!record) {
      throw new NotFoundException(`Custom domain with id '${id}' not found.`);
    }
    return record;
  }

  async delete(id: string, organizationId: string): Promise<{ success: boolean }> {
    const record = await this.findById(id, organizationId);

    if (record.cloudflareHostnameId) {
      try {
        await this.cloudflareAdapter.deleteHostname(record.cloudflareHostnameId);
      } catch (err: any) {
        this.logger.warn(
          `[CustomDomainService] Deprovision error on delete: ${err.message}. Proceeding with soft delete.`,
        );
      }
    }

    await this.customDomainRepo.softDelete(id, organizationId);
    this.logger.log(`[CustomDomainService] Soft-deleted domain ${id} for org ${organizationId}`);
    return { success: true };
  }

  async verify(id: string, organizationId: string): Promise<CustomDomain> {
    const record = await this.findById(id, organizationId);

    if (!record.cloudflareHostnameId) {
      return record;
    }

    const statusResult = await this.cloudflareAdapter.getHostnameStatus(
      record.cloudflareHostnameId,
    );
    let verifiedAt = record.verifiedAt;

    if (statusResult.sslStatus === 'active' && !verifiedAt) {
      verifiedAt = new Date();
    }

    const updated = await this.customDomainRepo.updateSslStatus(
      id,
      organizationId,
      statusResult.sslStatus,
      verifiedAt || undefined,
    );

    return updated;
  }
}
