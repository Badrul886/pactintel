import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { NotificationService } from '../../src/modules/notification/notification.service';
import { sha256 } from '@pactintel/shared-utils';

describe('Recipient Access Guard (RULE ACC-004 — Sprint 4.4)', () => {
  let docService: DocumentService;
  let docRepo: jest.Mocked<DocumentRepository>;
  let prisma: any;
  let notificationService: jest.Mocked<NotificationService>;

  const orgId = '01a14030-e688-788d-b41c-29a9d6afad11';
  const ownerId = '01a14030-e688-788d-b41c-29a9d6afad22';
  const docId = '01a14030-e688-788d-b41c-29a9d6afad33';
  const slug = 'enterprise-agreement-xyz123';

  const mockBrandKit = {
    id: 'bk-1',
    organizationId: orgId,
    name: 'Acme Corp Brand',
    primaryColor: '#2563EB',
    secondaryColor: '#1E40AF',
    accentColor: '#3B82F6',
    logoUrl: 'https://cdn.pactintel.com/logos/acme.png',
    faviconUrl: null,
    fontHeading: 'Inter',
    fontBody: 'Inter',
    customCss: null,
    removeBadge: false,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    docRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      recordView: jest.fn().mockResolvedValue({ id: docId }),
    } as any;

    notificationService = {
      notifyUser: jest.fn(),
    } as any;

    prisma = {
      document: {
        update: jest.fn().mockResolvedValue({ id: docId, status: 'expired' }),
        findFirst: jest.fn(),
      },
      brandKit: {
        findFirst: jest.fn().mockResolvedValue(mockBrandKit),
      },
      outboxEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLogEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: DocumentRepository, useValue: docRepo },
        { provide: DocumentOutboxService, useValue: { writeOutbox: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    docService = module.get<DocumentService>(DocumentService);
  });

  it('Test 1 — expired link: returns HTTP 200 denial with EXPIRED status and brand kit', async () => {
    const pastDate = new Date(Date.now() - 1000 * 3600); // 1 hour ago
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Expired Agreement',
      status: 'sent',
      expiresAt: pastDate,
      domainRestriction: [],
      maxViews: null,
      passwordHash: null,
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    const result = await docService.validateRecipientAccess(slug);

    expect(result.accessible).toBe(false);
    expect(result.denialType).toBe('EXPIRED');
    expect(result.status).toBe('EXPIRED');
    expect(result.brandKit).toBeDefined();
    expect(result.brandKit?.primaryColor).toBe('#2563EB');
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: docId },
      data: { status: 'expired' },
    });
  });

  it('Test 2 — wrong domain: returns HTTP 200 denial with DOMAIN_RESTRICTED status and brand kit', async () => {
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Domain Restricted NDA',
      status: 'sent',
      expiresAt: new Date(Date.now() + 1000 * 3600 * 24), // tomorrow
      domainRestriction: ['partner.com', 'client.org'],
      maxViews: null,
      passwordHash: null,
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    const result = await docService.validateRecipientAccess(
      slug,
      undefined,
      'intruder@competitor.com',
    );

    expect(result.accessible).toBe(false);
    expect(result.denialType).toBe('DOMAIN_RESTRICTED');
    expect(result.status).toBe('DOMAIN_RESTRICTED');
    expect(result.brandKit).toBeDefined();
    expect(result.allowedDomains).toEqual(['partner.com', 'client.org']);
  });

  it('Test 3 — view limit exceeded: returns HTTP 200 denial when distinct session count >= max_views for new session', async () => {
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Limited Access Teaser',
      status: 'sent',
      expiresAt: new Date(Date.now() + 1000 * 3600 * 24),
      domainRestriction: [],
      maxViews: 2,
      passwordHash: null,
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    // Mock 2 existing unique viewer sessions recorded in outbox
    prisma.outboxEvent.findMany.mockResolvedValueOnce([
      { payload: { sessionId: 'sess-alpha' } },
      { payload: { sessionId: 'sess-beta' } },
    ]);

    // A brand new session arrives
    const result = await docService.validateRecipientAccess(
      slug,
      undefined,
      undefined,
      'sess-gamma-new',
    );

    expect(result.accessible).toBe(false);
    expect(result.denialType).toBe('VIEW_LIMIT_EXCEEDED');
    expect(result.status).toBe('VIEW_LIMIT_EXCEEDED');
    expect(result.maxViews).toBe(2);
    expect(result.brandKit).toBeDefined();
  });

  it('Test 4 — password required: returns HTTP 200 denial with PASSWORD_REQUIRED and brand kit', async () => {
    const rawPass = 'PactSecret2026!';
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Password Vault Agreement',
      status: 'sent',
      expiresAt: new Date(Date.now() + 1000 * 3600 * 24),
      domainRestriction: [],
      maxViews: null,
      passwordHash: sha256(rawPass),
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    // No password provided
    const resultNoPass = await docService.validateRecipientAccess(slug);
    expect(resultNoPass.accessible).toBe(false);
    expect(resultNoPass.denialType).toBe('PASSWORD_REQUIRED');
    expect(resultNoPass.brandKit).toBeDefined();

    // Wrong password provided
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Password Vault Agreement',
      status: 'sent',
      expiresAt: new Date(Date.now() + 1000 * 3600 * 24),
      domainRestriction: [],
      maxViews: null,
      passwordHash: sha256(rawPass),
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    const resultWrongPass = await docService.validateRecipientAccess(slug, 'WrongPass123!');
    expect(resultWrongPass.accessible).toBe(false);
    expect(resultWrongPass.denialType).toBe('PASSWORD_REQUIRED');
    expect(resultWrongPass.error).toBe('Incorrect password');
  });

  it('Test 5 — order test (RULE ACC-004): when link expired AND domain restricted AND limit exceeded AND password set -> EXPIRED is checked first', async () => {
    const pastDate = new Date(Date.now() - 1000 * 3600);
    docRepo.findBySlug.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      slug,
      title: 'Multi-Restricted Proposal',
      status: 'sent',
      expiresAt: pastDate, // Expiration is true!
      domainRestriction: ['internal.com'], // Mismatch!
      maxViews: 1, // Exceeded!
      passwordHash: sha256('secret'), // Password required!
      organization: { id: orgId, name: 'Acme Corp' },
      versions: [],
    } as any);

    // Call with invalid email, no password, new session
    const result = await docService.validateRecipientAccess(
      slug,
      undefined,
      'external@other.com',
      'new-session-id',
    );

    // Expiration MUST take precedence according to strict order
    expect(result.accessible).toBe(false);
    expect(result.denialType).toBe('EXPIRED');
    expect(result.status).toBe('EXPIRED');
  });

  it('Test 6 — request access endpoint: writes audit_log_entry and notifies document owner', async () => {
    prisma.document.findFirst.mockResolvedValueOnce({
      id: docId,
      organizationId: orgId,
      ownerId,
      title: 'Master Service Agreement',
      deletedAt: null,
    });

    const res = await docService.requestAccess(
      docId,
      {
        requesterEmail: 'carol@partner.com',
        requesterName: 'Carol Danvers',
        message: 'Please grant access for legal review.',
      },
      {
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 Chrome',
      },
    );

    expect(res.status).toBe('accepted');

    // Audit log check
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgId,
        action: 'access_requested',
        resourceType: 'document',
        resourceId: docId,
        ipAddress: '198.51.100.42',
      }),
    });

    // Notification check
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      ownerId,
      orgId,
      expect.objectContaining({
        eventType: 'access_requested',
        title: 'Document Access Requested',
      }),
    );
  });
});
