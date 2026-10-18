import { DocumentService } from '../../src/modules/document/document.service';
import { DocumentRepository } from '../../src/modules/document/document.repository';
import { DocumentOutboxService } from '../../src/modules/document/outbox/document-outbox.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256 } from '@pactintel/shared-utils';

describe('RULE I18N-001: Recipient Document Viewer Access Gate (/d/:slug)', () => {
  let docService: DocumentService;
  let mockDocRepo: Partial<DocumentRepository>;
  let mockOutbox: Partial<DocumentOutboxService>;
  let mockPrisma: any;
  let mockTx: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const slug = 'confidential-msa-a1b2c3';

  beforeEach(() => {
    mockDocRepo = {
      findBySlug: jest.fn(),
      findById: jest.fn(),
    };

    mockOutbox = {
      emit: jest.fn().mockResolvedValue({ id: 'outbox-1' } as any),
    };

    mockTx = {
      document: {
        update: jest.fn().mockResolvedValue({ id: docId, status: 'viewed' }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
      document: {
        update: jest.fn().mockResolvedValue({ id: docId, status: 'expired' }),
      },
    };

    docService = new DocumentService(
      mockDocRepo as DocumentRepository,
      mockOutbox as DocumentOutboxService,
      mockPrisma as PrismaService,
    );
  });

  describe('Expiration Enforcement', () => {
    it('returns EXPIRED status and updates document status when expiresAt has passed', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000 * 24); // 1 day ago

      (mockDocRepo.findBySlug as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        slug,
        title: 'Expired Agreement',
        status: 'sent',
        expiresAt: pastDate,
        organization: { name: 'Acme Corp' },
        versions: [{ versionNumber: 1, contentSnapshot: {} }],
      });

      const result = await docService.validateRecipientAccess(slug);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('EXPIRED');
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: docId },
        data: { status: 'expired' },
      });
    });
  });

  describe('Password Protection Gate', () => {
    const password = 'SuperSecretPassword123!';
    const passwordHash = sha256(password);

    beforeEach(() => {
      (mockDocRepo.findBySlug as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        slug,
        title: 'Protected Contract',
        status: 'sent',
        passwordHash,
        organization: { name: 'Acme Corp' },
        versions: [{ versionNumber: 1, contentSnapshot: { type: 'doc' }, contentHash: 'hash-1' }],
      });
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'sent',
        slug,
      });
    });

    it('returns PASSWORD_REQUIRED when passwordAttempt is omitted', async () => {
      const result = await docService.validateRecipientAccess(slug);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('PASSWORD_REQUIRED');
      expect(result.title).toBe('Protected Contract');
    });

    it('returns PASSWORD_REQUIRED with error when passwordAttempt is incorrect', async () => {
      const result = await docService.validateRecipientAccess(slug, 'WrongPassword');
      expect(result.accessible).toBe(false);
      expect(result.denialType).toBe('PASSWORD_REQUIRED');
      expect(result.error).toBe('Incorrect password');
    });

    it('grants access when passwordAttempt matches passwordHash', async () => {
      const result = await docService.validateRecipientAccess(slug, password);

      expect(result.accessible).toBe(true);
      expect(result.document?.title).toBe('Protected Contract');
    });
  });

  describe('Domain Restriction Enforcement', () => {
    beforeEach(() => {
      (mockDocRepo.findBySlug as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        slug,
        title: 'Partner NDA',
        status: 'sent',
        domainRestriction: ['partner.com', 'subsidiary.org'],
        organization: { name: 'Acme Corp' },
        versions: [{ versionNumber: 1, contentSnapshot: {}, contentHash: 'hash-1' }],
      });
      (mockDocRepo.findById as jest.Mock).mockResolvedValue({
        id: docId,
        organizationId: orgId,
        status: 'sent',
        slug,
      });
    });

    it('returns EMAIL_REQUIRED when recipientEmail is missing on domain-restricted document', async () => {
      const result = await docService.validateRecipientAccess(slug);

      expect(result.accessible).toBe(false);
      expect(result.reason).toBe('EMAIL_REQUIRED');
      expect(result.allowedDomains).toEqual(['partner.com', 'subsidiary.org']);
    });

    it('returns DOMAIN_RESTRICTED when recipient email domain does not match allowed list', async () => {
      const result = await docService.validateRecipientAccess(
        slug,
        undefined,
        'attacker@external.com',
      );
      expect(result.accessible).toBe(false);
      expect(result.denialType).toBe('DOMAIN_RESTRICTED');
      expect(result.allowedDomains).toEqual(['partner.com', 'subsidiary.org']);
    });

    it('grants access and transitions sent document to viewed when email domain matches', async () => {
      const result = await docService.validateRecipientAccess(slug, undefined, 'legal@partner.com');

      expect(result.accessible).toBe(true);
      expect(result.document?.status).toBe('viewed');
      expect(mockTx.document.update).toHaveBeenCalledWith({
        where: { id: docId, organizationId: orgId },
        data: { status: 'viewed' },
      });
      expect(mockOutbox.emit).toHaveBeenCalledWith(mockTx, orgId, 'document.viewed', docId, {
        documentId: docId,
        status: 'viewed',
      });
    });
  });
});
