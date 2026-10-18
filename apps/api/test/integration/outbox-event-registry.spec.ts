import { TemplateRepository } from '../../src/modules/template/template.repository';
import { TemplateService } from '../../src/modules/template/template.service';
import { AnalyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { IntegrationRepository } from '../../src/modules/integration/integration.repository';
import { CustomDomainRepository } from '../../src/modules/custom-domain/custom-domain.repository';
import { DomainHealthCheckJob } from '../../src/modules/custom-domain/jobs/domain-health-check.job';

/**
 * Sprint 5.2 — Outbox Event Registry Integration Suite
 * Verifies Architecture Invariant I-06:
 * All 7 Phase 1 side-effects must write to outbox_events in the same transactional context
 * as the triggering mutation.
 */
describe('Sprint 5.2 — Outbox Event Registry (7 Phase 1 Events)', () => {
  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';

  let outboxStore: any[] = [];
  let templateStore: any[] = [];
  let documentStore: any[] = [];
  let connectionStore: any[] = [];
  let domainStore: any[] = [];
  let mockPrisma: any;

  beforeEach(() => {
    outboxStore = [];
    templateStore = [];
    documentStore = [];
    connectionStore = [];
    domainStore = [];

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => {
        if (typeof callback === 'function') {
          return callback(mockPrisma);
        }
        return Promise.all(callback);
      }),
      outboxEvent: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          outboxStore.push(data);
          return data;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          return outboxStore.filter((evt) => {
            if (where.organizationId && evt.organizationId !== where.organizationId) return false;
            if (where.eventType && evt.eventType !== where.eventType) return false;
            return true;
          });
        }),
      },
      template: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          templateStore.push(data);
          return data;
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          return (
            templateStore.find(
              (t) => t.id === where.id && t.organizationId === where.organizationId,
            ) || null
          );
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const t = templateStore.find((x) => x.id === where.id);
          if (t && data.usageCount?.increment) {
            t.usageCount = (t.usageCount || 0) + data.usageCount.increment;
          }
          return t;
        }),
      },
      document: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          documentStore.push(data);
          return data;
        }),
      },
      documentVersion: {
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
      },
      integrationConnection: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          connectionStore.push(data);
          return data;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          connectionStore.forEach((c) => {
            if (c.id === where.id && c.organizationId === where.organizationId) {
              Object.assign(c, data);
            }
          });
          return { count: 1 };
        }),
      },
      customDomain: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          domainStore.push(data);
          return data;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const d = domainStore.find((x) => x.id === where.id);
          if (d) Object.assign(d, data);
          return d;
        }),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: userId, organizationId: orgId, role: 'admin' }),
      },
    };
  });

  // 1. template.created
  test('Event 1: template.created is emitted atomically when creating a template', async () => {
    const templateRepo = new TemplateRepository(mockPrisma as any);
    const result = await templateRepo.create(orgId, {
      workspaceId: 'ws-1',
      title: 'Enterprise Standard NDA',
      category: 'nda',
      content: { sections: [{ heading: 'Recitals', text: 'Whereas...' }] },
    });

    expect(result).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    const event = outboxStore.find((e) => e.eventType === 'template.created');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('template');
    expect(event.aggregateId).toBe(result.id);
    expect(event.organizationId).toBe(orgId);
    expect((event.payload as any).title).toBe('Enterprise Standard NDA');
  });

  // 2. document.created_from_template
  test('Event 2: document.created_from_template is emitted atomically during copy-on-create', async () => {
    const templateRepo = new TemplateRepository(mockPrisma as any);
    const existingTemplate = {
      id: 'tmpl-100',
      organizationId: orgId,
      workspaceId: 'ws-1',
      title: 'Sales Contract',
      content: { sections: [] },
      usageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    templateStore.push(existingTemplate);

    const templateService = new TemplateService(templateRepo, mockPrisma as any);
    const created = await templateService.createDocumentFromTemplate(orgId, userId, 'tmpl-100', {
      title: 'Acme Sales Contract',
    });

    expect(created.document).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    const event = outboxStore.find((e) => e.eventType === 'document.created_from_template');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('document');
    expect(event.aggregateId).toBe(created.document.id);
    expect((event.payload as any).templateId).toBe('tmpl-100');
    expect((event.payload as any).ownerId).toBe(userId);
  });

  // 3. analytics.document_viewed_first_time
  test('Event 3: analytics.document_viewed_first_time is recorded on first document view', async () => {
    const analyticsRepo = new AnalyticsRepository(mockPrisma as any);
    const event = await analyticsRepo.recordFirstViewOutbox(
      orgId,
      'doc-456',
      'session-xyz',
      'buyer@enterprise.com',
    );

    expect(event).toBeDefined();
    expect(event.eventType).toBe('analytics.document_viewed_first_time');
    expect(event.aggregateType).toBe('document');
    expect(event.aggregateId).toBe('doc-456');
    expect((event.payload as any).sessionId).toBe('session-xyz');
    expect((event.payload as any).viewerEmail).toBe('buyer@enterprise.com');
  });

  // 4. integration.connected
  test('Event 4: integration.connected is emitted atomically when storing OAuth tokens', async () => {
    const integrationRepo = new IntegrationRepository(mockPrisma as any);
    const conn = await integrationRepo.createConnection(
      orgId,
      'hubspot',
      {
        accessToken: 'access_mock_123',
        refreshToken: 'refresh_mock_123',
        expiresAt: new Date(Date.now() + 3600000),
      },
      'hubspot_portal_999',
    );

    expect(conn).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    const event = outboxStore.find((e) => e.eventType === 'integration.connected');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('integration_connection');
    expect(event.aggregateId).toBe(conn.id);
    expect((event.payload as any).provider).toBe('hubspot');
    expect((event.payload as any).externalPortalId).toBe('hubspot_portal_999');
  });

  // 5. integration.revoked
  test('Event 5: integration.revoked is emitted atomically on disconnection', async () => {
    const integrationRepo = new IntegrationRepository(mockPrisma as any);
    connectionStore.push({
      id: 'conn-to-revoke',
      organizationId: orgId,
      provider: 'hubspot',
      status: 'active',
      deletedAt: null,
    });

    await integrationRepo.softDelete('conn-to-revoke', orgId);
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    const event = outboxStore.find((e) => e.eventType === 'integration.revoked');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('integration_connection');
    expect(event.aggregateId).toBe('conn-to-revoke');
    expect((event.payload as any).connectionId).toBe('conn-to-revoke');
  });

  // 6. custom_domain.provisioned
  test('Event 6: custom_domain.provisioned is emitted atomically upon creation', async () => {
    const domainRepo = new CustomDomainRepository(mockPrisma as any);
    const domain = await domainRepo.create({
      organizationId: orgId,
      domain: 'docs.clientcorp.com',
      cloudflareHostnameId: 'cf_host_123',
      sslStatus: 'pending',
    });

    expect(domain).toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    const event = outboxStore.find((e) => e.eventType === 'custom_domain.provisioned');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('custom_domain');
    expect(event.aggregateId).toBe(domain.id);
    expect((event.payload as any).domain).toBe('docs.clientcorp.com');
    expect((event.payload as any).cloudflareHostnameId).toBe('cf_host_123');
  });

  // 7. custom_domain.ssl_error
  test('Event 7: custom_domain.ssl_error is emitted on persistent domain SSL verification failure', async () => {
    const domainRepo = new CustomDomainRepository(mockPrisma as any);
    const cloudflareAdapter = {
      getHostnameStatus: jest.fn().mockResolvedValue({
        sslStatus: 'error',
        isActive: false,
      }),
    };
    const notificationService = {
      notifyUser: jest.fn().mockResolvedValue(true),
    };

    const targetDomain = {
      id: 'domain-err-1',
      organizationId: orgId,
      domain: 'broken.clientcorp.com',
      cloudflareHostnameId: 'cf_broken_999',
      sslStatus: 'error', // Previous status was error -> triggers persistent error
      verifiedAt: null,
    };
    domainRepo.findAllActiveHostnames = jest.fn().mockResolvedValue([targetDomain]);
    domainRepo.updateHealthCheck = jest.fn().mockResolvedValue(targetDomain);

    const healthCheckJob = new DomainHealthCheckJob(
      domainRepo,
      cloudflareAdapter as any,
      notificationService as any,
      mockPrisma as any,
    );

    const result = await healthCheckJob.process();
    expect(result.errors).toBe(1);

    const event = outboxStore.find((e) => e.eventType === 'custom_domain.ssl_error');
    expect(event).toBeDefined();
    expect(event.aggregateType).toBe('custom_domain');
    expect(event.aggregateId).toBe('domain-err-1');
    expect((event.payload as any).domain).toBe('broken.clientcorp.com');
    expect((event.payload as any).sslStatus).toBe('error');
  });
});
