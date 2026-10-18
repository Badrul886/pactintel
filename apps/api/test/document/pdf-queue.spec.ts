import { PdfService } from '../../src/modules/document/pdf/pdf.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('RULE PDF-001 & PDF-002: Asynchronous PDF Generation and Certificate of Completion', () => {
  let pdfService: PdfService;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const verId = '33333333-3333-7333-8333-333333333333';

  beforeEach(() => {
    mockPrisma = {
      document: {
        findFirst: jest.fn(),
      },
    };

    pdfService = new PdfService(mockPrisma as PrismaService);
  });

  describe('RULE PDF-001: Asynchronous Queueing', () => {
    it('queues PDF generation job and returns 202-compatible queued payload without blocking HTTP cycle', async () => {
      const result = await pdfService.queuePdfGeneration(orgId, docId, verId, 'user-requester-1');

      expect(result.status).toBe('queued');
      expect(result.jobId).toBeDefined();
      expect(typeof result.jobId).toBe('string');
      expect(result.message).toContain('worker-pdf pool');
    });
  });

  describe('RULE PDF-002: Certificate of Completion Audit Trail Data', () => {
    it('compiles signers, cryptographic content hash, and timestamped audit events into certificate data', async () => {
      const signedAt = new Date('2026-10-18T10:00:00Z');
      const createdAt = new Date('2026-10-18T09:00:00Z');

      mockPrisma.document.findFirst.mockResolvedValue({
        id: docId,
        title: 'Enterprise Master Service Agreement',
        organizationId: orgId,
        status: 'signed',
        createdAt,
        updatedAt: signedAt,
        organization: { name: 'Acme Technologies Inc.' },
        versions: [
          {
            id: verId,
            versionNumber: 2,
            contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            isCurrent: true,
          },
        ],
        signatureRequests: [
          {
            id: 'sig-req-1',
            signers: [
              {
                id: 'signer-1',
                name: 'Jane Doe',
                email: 'jane@client.com',
                status: 'signed',
                signedAt,
              },
            ],
          },
        ],
        signatureEvents: [
          {
            id: 'evt-1',
            eventType: 'document_viewed',
            ipAddress: '203.0.113.195',
            userAgent: 'Mozilla/5.0 Chrome/128',
            createdAt: new Date('2026-10-18T09:30:00Z'),
          },
          {
            id: 'evt-2',
            eventType: 'signature_completed',
            ipAddress: '203.0.113.195',
            userAgent: 'Mozilla/5.0 Chrome/128',
            createdAt: signedAt,
          },
        ],
      });

      const certificate = await pdfService.getCertificateOfCompletionData(orgId, docId);

      expect(certificate).not.toBeNull();
      expect(certificate?.certificateId).toBeDefined();
      expect(certificate?.documentTitle).toBe('Enterprise Master Service Agreement');
      expect(certificate?.contentHash).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );
      expect(certificate?.versionNumber).toBe(2);
      expect(certificate?.signers).toHaveLength(1);
      expect(certificate?.signers[0].email).toBe('jane@client.com');
      expect(certificate?.auditEvents).toHaveLength(2);
      expect(certificate?.auditEvents[1].eventType).toBe('signature_completed');
    });

    it('returns null if document does not exist for the organization', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      const certificate = await pdfService.getCertificateOfCompletionData(
        orgId,
        'non-existent-doc',
      );

      expect(certificate).toBeNull();
    });
  });
});
