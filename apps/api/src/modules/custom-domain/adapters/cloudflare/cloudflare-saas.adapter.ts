import { Injectable, Logger } from '@nestjs/common';
import {
  CustomDomainProviderPort,
  ProvisionHostnameResult,
  HostnameStatusResult,
} from '../../ports/custom-domain-provider.port';

@Injectable()
export class CloudflareSaasAdapter implements CustomDomainProviderPort {
  private readonly logger = new Logger(CloudflareSaasAdapter.name);

  private readonly apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
  private readonly zoneId = process.env.CLOUDFLARE_ZONE_ID || '';
  private readonly fallbackOrigin = process.env.CLOUDFLARE_FALLBACK_ORIGIN || 'cname.pactintel.com';
  private readonly apiBase = 'https://api.cloudflare.com/client/v4';

  async provisionHostname(domain: string, orgId: string): Promise<ProvisionHostnameResult> {
    this.logger.log(`[CloudflareSaas] Provisioning custom hostname: ${domain} for org: ${orgId}`);

    // If Cloudflare credentials are configured, execute real API request
    if (this.apiToken && this.zoneId) {
      try {
        const res = await fetch(`${this.apiBase}/zones/${this.zoneId}/custom_hostnames`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            hostname: domain,
            ssl: {
              method: 'http',
              type: 'dv',
              settings: { min_tls_version: '1.2' },
            },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`Cloudflare API error ${res.status}: ${JSON.stringify(errData)}`);
        }

        const data = (await res.json()) as {
          result: {
            id: string;
            ssl?: { status?: string };
            ownership_verification?: { type?: string; name?: string; value?: string };
          };
        };

        const result = data.result;
        return {
          hostnameId: result.id,
          sslStatus: result.ssl?.status || 'pending',
          verificationRecord: {
            type: result.ownership_verification?.type || 'CNAME',
            name: result.ownership_verification?.name || domain,
            value: result.ownership_verification?.value || this.fallbackOrigin,
          },
        };
      } catch (err: any) {
        this.logger.error(
          `[CloudflareSaas] Failed to provision hostname on Cloudflare: ${err.message}`,
        );
        throw err;
      }
    }

    // Default mock / test provisioning (ADP-001 safe fallback)
    const mockHostnameId = `cf-host-${Buffer.from(domain).toString('hex').slice(0, 16)}`;
    return {
      hostnameId: mockHostnameId,
      sslStatus: 'pending',
      verificationRecord: {
        type: 'CNAME',
        name: domain,
        value: this.fallbackOrigin,
      },
    };
  }

  async getHostnameStatus(hostnameId: string): Promise<HostnameStatusResult> {
    this.logger.log(`[CloudflareSaas] Checking status for hostnameId: ${hostnameId}`);

    if (this.apiToken && this.zoneId) {
      try {
        const res = await fetch(
          `${this.apiBase}/zones/${this.zoneId}/custom_hostnames/${hostnameId}`,
          {
            headers: {
              Authorization: `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!res.ok) {
          throw new Error(`Cloudflare status check failed: HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          result: {
            status: string;
            ssl?: { status?: string };
          };
        };

        const sslRaw = data.result.ssl?.status || 'pending';
        const sslStatus: 'pending' | 'active' | 'error' | 'pending_validation' =
          sslRaw === 'active'
            ? 'active'
            : sslRaw === 'validation_timed_out' || sslRaw === 'failed'
              ? 'error'
              : 'pending';

        return {
          sslStatus,
          isActive: data.result.status === 'active' && sslStatus === 'active',
        };
      } catch (err: any) {
        this.logger.error(`[CloudflareSaas] Status check error: ${err.message}`);
        return { sslStatus: 'error', isActive: false };
      }
    }

    // Fallback for mock/test
    return {
      sslStatus: 'active',
      isActive: true,
    };
  }

  async deleteHostname(hostnameId: string): Promise<void> {
    this.logger.log(`[CloudflareSaas] Deleting custom hostname: ${hostnameId}`);

    if (this.apiToken && this.zoneId) {
      const res = await fetch(
        `${this.apiBase}/zones/${this.zoneId}/custom_hostnames/${hostnameId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        },
      );

      if (!res.ok && res.status !== 404) {
        throw new Error(`Cloudflare deletion failed: HTTP ${res.status}`);
      }
    }
  }
}
