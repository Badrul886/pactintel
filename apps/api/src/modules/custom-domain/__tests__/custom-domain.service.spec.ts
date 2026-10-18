import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CustomDomainService } from '../custom-domain.service';
import { CustomDomainRepository } from '../custom-domain.repository';
import { CloudflareSaasAdapter } from '../adapters/cloudflare/cloudflare-saas.adapter';
import { DomainHealthCheckJob } from '../jobs/domain-health-check.job';
import { NotificationService } from '../../notification/notification.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CustomDomainModule (Sprint 4.3)', () => {
  let service: CustomDomainService;
  let job: DomainHealthCheckJob;
  let customDomainRepo: jest.Mocked<CustomDomainRepository>;
  let cloudflareAdapter: jest.Mocked<CloudflareSaasAdapter>;
  let notificationService: jest.Mocked<NotificationService>;
  let prisma: jest.Mocked<PrismaService>;

  const orgId = '01a14030-e688-788d-b41c-29a9d6afad11';

  beforeEach(async () => {
    customDomainRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByDomain: jest.fn(),
      findByOrgAndDomain: jest.fn(),
      list: jest.fn(),
      updateSslStatus: jest.fn(),
      updateHealthCheck: jest.fn(),
      softDelete: jest.fn(),
      findAllActiveHostnames: jest.fn(),
    } as any;

    cloudflareAdapter = {
      provisionHostname: jest.fn(),
      getHostnameStatus: jest.fn(),
      deleteHostname: jest.fn(),
    } as any;

    notificationService = {
      notifyUser: jest.fn(),
    } as any;

    prisma = {
      user: {
        findFirst: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomDomainService,
        DomainHealthCheckJob,
        { provide: CustomDomainRepository, useValue: customDomainRepo },
        { provide: CloudflareSaasAdapter, useValue: cloudflareAdapter },
        { provide: NotificationService, useValue: notificationService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CustomDomainService>(CustomDomainService);
    job = module.get<DomainHealthCheckJob>(DomainHealthCheckJob);
  });

  describe('CustomDomainService', () => {
    it('throws BadRequestException if domain format is invalid', async () => {
      await expect(service.create(orgId, 'not_a_valid_domain')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(orgId, 'https://sub.domain.com')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(orgId, '..invalid..')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if domain is already registered for this organization', async () => {
      customDomainRepo.findByOrgAndDomain.mockResolvedValueOnce({
        id: 'cd-1',
        organizationId: orgId,
        domain: 'docs.acme.com',
        cloudflareHostnameId: 'cf-1',
        sslStatus: 'active',
        verifiedAt: new Date(),
        lastHealthCheck: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      await expect(service.create(orgId, 'docs.acme.com')).rejects.toThrow(ConflictException);
    });

    it('provisions hostname via Cloudflare and returns DNS verification instructions', async () => {
      customDomainRepo.findByOrgAndDomain.mockResolvedValueOnce(null);
      cloudflareAdapter.provisionHostname.mockResolvedValueOnce({
        hostnameId: 'cf-host-12345',
        sslStatus: 'pending',
        verificationRecord: {
          type: 'CNAME',
          name: 'docs.client.org',
          value: 'cname.pactintel.com',
        },
      });

      customDomainRepo.create.mockResolvedValueOnce({
        id: 'cd-uuid-777',
        organizationId: orgId,
        domain: 'docs.client.org',
        cloudflareHostnameId: 'cf-host-12345',
        sslStatus: 'pending',
        verifiedAt: null,
        lastHealthCheck: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const res = await service.create(orgId, 'docs.client.org');

      expect(res.id).toBe('cd-uuid-777');
      expect(res.cloudflareHostnameId).toBe('cf-host-12345');
      expect(res.dnsInstructions).toBeDefined();
      expect(res.dnsInstructions?.name).toBe('docs.client.org');
      expect(res.dnsInstructions?.value).toBe('cname.pactintel.com');
      expect(cloudflareAdapter.provisionHostname).toHaveBeenCalledWith('docs.client.org', orgId);
    });

    it('verifies custom domain status and marks verifiedAt when active', async () => {
      customDomainRepo.findById.mockResolvedValueOnce({
        id: 'cd-uuid-777',
        organizationId: orgId,
        domain: 'docs.client.org',
        cloudflareHostnameId: 'cf-host-12345',
        sslStatus: 'pending',
        verifiedAt: null,
        lastHealthCheck: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      cloudflareAdapter.getHostnameStatus.mockResolvedValueOnce({
        sslStatus: 'active',
        isActive: true,
      });

      customDomainRepo.updateSslStatus.mockResolvedValueOnce({
        id: 'cd-uuid-777',
        organizationId: orgId,
        domain: 'docs.client.org',
        cloudflareHostnameId: 'cf-host-12345',
        sslStatus: 'active',
        verifiedAt: new Date(),
        lastHealthCheck: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      const updated = await service.verify('cd-uuid-777', orgId);

      expect(updated.sslStatus).toBe('active');
      expect(cloudflareAdapter.getHostnameStatus).toHaveBeenCalledWith('cf-host-12345');
      expect(customDomainRepo.updateSslStatus).toHaveBeenCalledWith(
        'cd-uuid-777',
        orgId,
        'active',
        expect.any(Date),
      );
    });

    it('soft-deletes custom domain and deprovisions Cloudflare hostname', async () => {
      customDomainRepo.findById.mockResolvedValueOnce({
        id: 'cd-uuid-777',
        organizationId: orgId,
        domain: 'docs.client.org',
        cloudflareHostnameId: 'cf-host-12345',
        sslStatus: 'active',
        verifiedAt: new Date(),
        lastHealthCheck: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

      cloudflareAdapter.deleteHostname.mockResolvedValueOnce();
      customDomainRepo.softDelete.mockResolvedValueOnce({
        id: 'cd-uuid-777',
        organizationId: orgId,
        domain: 'docs.client.org',
        cloudflareHostnameId: 'cf-host-12345',
        sslStatus: 'active',
        verifiedAt: new Date(),
        lastHealthCheck: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      });

      const result = await service.delete('cd-uuid-777', orgId);

      expect(result.success).toBe(true);
      expect(cloudflareAdapter.deleteHostname).toHaveBeenCalledWith('cf-host-12345');
      expect(customDomainRepo.softDelete).toHaveBeenCalledWith('cd-uuid-777', orgId);
    });
  });

  describe('DomainHealthCheckJob (RULE I-07 & RULE ACC-003)', () => {
    it('registers BullMQ scheduler on module init without using @Cron', async () => {
      await job.onModuleInit();
      expect(job.isSchedulerRegistered()).toBe(true);
    });

    it('processes domain health checks, updates status, and alerts admin on persistent error', async () => {
      customDomainRepo.findAllActiveHostnames.mockResolvedValueOnce([
        {
          id: 'cd-healthy',
          organizationId: orgId,
          domain: 'docs.acme.com',
          cloudflareHostnameId: 'cf-h1',
          sslStatus: 'active',
          verifiedAt: new Date(),
          lastHealthCheck: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
        {
          id: 'cd-failing',
          organizationId: orgId,
          domain: 'broken.acme.com',
          cloudflareHostnameId: 'cf-f2',
          sslStatus: 'error', // Previous check was error!
          verifiedAt: null,
          lastHealthCheck: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ]);

      cloudflareAdapter.getHostnameStatus
        .mockResolvedValueOnce({ sslStatus: 'active', isActive: true })
        .mockResolvedValueOnce({ sslStatus: 'error', isActive: false });

      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'admin-user-id',
        organizationId: orgId,
        role: 'admin',
      });

      const stats = await job.process();

      expect(stats.checked).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.errors).toBe(1);

      // Verify persistent error notification sent to org admin (RULE ACC-003)
      expect(notificationService.notifyUser).toHaveBeenCalledWith(
        'admin-user-id',
        orgId,
        expect.objectContaining({
          eventType: 'custom_domain.ssl_error',
          title: 'Custom Domain SSL Error',
        }),
      );
    });
  });
});
