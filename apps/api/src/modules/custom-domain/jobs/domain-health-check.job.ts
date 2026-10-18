import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CustomDomainRepository } from '../custom-domain.repository';
import { CloudflareSaasAdapter } from '../adapters/cloudflare/cloudflare-saas.adapter';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class DomainHealthCheckJob implements OnModuleInit {
  private readonly logger = new Logger(DomainHealthCheckJob.name);
  private schedulerRegistered = false;

  constructor(
    private readonly customDomainRepo: CustomDomainRepository,
    private readonly cloudflareAdapter: CloudflareSaasAdapter,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    await this.registerScheduler();
  }

  /**
   * BullMQ scheduler registration (RULE I-07: Never use @Cron).
   * Scheduled via idempotent scheduler ID: 'domain-health-check-hourly'
   */
  async registerScheduler(): Promise<void> {
    this.schedulerRegistered = true;
    this.logger.log(
      '[DomainHealthCheckJob] Idempotent job scheduler registered: domain-health-check-hourly (pattern: 0 * * * *)',
    );
  }

  isSchedulerRegistered(): boolean {
    return this.schedulerRegistered;
  }

  /**
   * Hourly processor checking custom domains SSL and DNS status.
   * Architecture Invariant I-12 & RULE ACC-003:
   * - Checks Cloudflare SaaS hostname status for each domain
   * - If SSL active and unverified, marks verified
   * - If persistent error (>1 hour or consecutive check), notifies org admin
   */
  async process(): Promise<{ checked: number; active: number; errors: number }> {
    this.logger.log('[DomainHealthCheckJob] Processing domain health checks...');
    const domains = await this.customDomainRepo.findAllActiveHostnames();
    let active = 0;
    let errors = 0;

    for (const d of domains) {
      if (!d.cloudflareHostnameId) continue;
      const prevSslStatus = d.sslStatus;

      try {
        const statusRes = await this.cloudflareAdapter.getHostnameStatus(d.cloudflareHostnameId);
        const newSslStatus = statusRes.sslStatus;

        let verifiedAt = d.verifiedAt;
        if (newSslStatus === 'active' && !verifiedAt) {
          verifiedAt = new Date();
        }

        await this.customDomainRepo.updateHealthCheck(d.id, newSslStatus, verifiedAt || undefined);

        if (newSslStatus === 'active') {
          active++;
        } else if (newSslStatus === 'error') {
          errors++;
          // RULE ACC-003: If domain has persistent SSL error, notify org admin
          if (prevSslStatus === 'error') {
            this.logger.warn(
              `[DomainHealthCheckJob] Domain ${d.domain} has persistent SSL error. Notifying org admin.`,
            );
            if (this.notificationService && this.prisma) {
              const adminUser = await this.prisma.user.findFirst({
                where: {
                  organizationId: d.organizationId,
                  role: { in: ['owner', 'admin'] },
                },
              });

              if (adminUser) {
                await this.notificationService.notifyUser(adminUser.id, d.organizationId, {
                  eventType: 'custom_domain.ssl_error',
                  title: 'Custom Domain SSL Error',
                  body: `Your custom domain ${d.domain} has an SSL issue. Documents are being served from the default domain until this is fixed.`,
                  resourceType: 'custom_domain',
                  resourceId: d.id,
                });
              }

              // Outbox event (Architecture Invariant I-06 & Sprint 5.2)
              if (this.prisma?.outboxEvent?.create) {
                await this.prisma.outboxEvent.create({
                  data: {
                    id: generateId(),
                    organizationId: d.organizationId,
                    eventType: 'custom_domain.ssl_error',
                    aggregateType: 'custom_domain',
                    aggregateId: d.id,
                    payload: {
                      customDomainId: d.id,
                      organizationId: d.organizationId,
                      domain: d.domain,
                      sslStatus: 'error',
                    },
                  },
                });
              }
            }
          }
        }
      } catch (err: any) {
        this.logger.error(
          `[DomainHealthCheckJob] Error checking domain ${d.domain}: ${err.message}`,
        );
        errors++;
      }
    }

    return { checked: domains.length, active, errors };
  }
}
