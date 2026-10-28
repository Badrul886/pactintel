import { VerificationReportService } from '../verification-report.service';
import { NotFoundException } from '@nestjs/common';

describe('VerificationReportService (Sprint 3.7 - AML/KYC Proof of Verification)', () => {
  let service: VerificationReportService;
  let mockSigningRepo: any;
  let mockPrisma: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const sigReqId = 'sigreq-report-001';
  const docId = 'doc-report-001';

  beforeEach(() => {
    mockSigningRepo = {
      findSignatureRequestWithVerificationHistory: jest
        .fn()
        .mockImplementation(async (id: string) => {
          if (id !== sigReqId) return null;
          return {
            id: sigReqId,
            document: {
              id: docId,
              organizationId: orgId,
              title: 'Master Consulting Agreement',
              organization: { id: orgId, name: 'Acme Legal Corp', slug: 'acme' },
              signatureEvents: [
                {
                  id: 'evt-1',
                  eventType: 'verification_passed',
                  metadata: { method: 'id_document', status: 'passed' },
                  createdAt: new Date(),
                },
              ],
            },
            documentVersion: {
              versionNumber: 1,
              contentHash: 'hash-doc-sha256-verified-12345',
              contentSnapshot: { title: 'Master Agreement Content' },
            },
            signers: [
              {
                id: 'signer-rep-1',
                name: 'Johnathan Doe',
                email: 'johnathan.doe@enterprise.com',
                roleLabel: 'Authorized Officer',
                status: 'signed',
                verificationMethod: 'id_document',
                verificationResult: {
                  status: 'passed',
                  confidenceScore: 99,
                  vendorReferenceId: 'bs_id_88291039',
                  biometricMatch: true,
                  verifiedAt: new Date().toISOString(),
                },
              },
              {
                id: 'signer-rep-2',
                name: 'Jane Smith',
                email: 'jane@partner.org',
                roleLabel: 'Managing Director',
                status: 'signed',
                verificationMethod: 'qes',
                verificationResult: {
                  status: 'passed',
                  certificateIssuer: 'D-Trust Qualified EU CA',
                  certificateSerial: 'DE-QTSP-123456',
                  verifiedAt: new Date().toISOString(),
                  preVerified: true,
                },
              },
            ],
          };
        }),
    };

    mockPrisma = {
      riskAssessment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ra-1',
            signerId: 'signer-rep-1',
            signatureRequestId: sigReqId,
            riskScore: 0.15,
            riskLevel: 'low',
            assignedMethod: 'id_document',
            fallbackApplied: false,
            createdAt: new Date(),
          },
        ]),
      },
    };

    service = new VerificationReportService(mockSigningRepo, mockPrisma);
  });

  describe('generateReportData', () => {
    it('generates structured compliance data with masked emails, document hash, and zero raw PII', async () => {
      const report = await service.generateReportData(orgId, sigReqId);

      expect(report.reportId).toBeDefined();
      expect(report.signatureRequestId).toBe(sigReqId);
      expect(report.documentId).toBe(docId);
      expect(report.documentHash).toContain('sha256:hash-doc-sha256-verified-12345');
      expect(report.complianceStandard).toContain('eIDAS');
      expect(report.signers).toHaveLength(2);

      // Verify email masking for zero PII leakage
      expect(report.signers[0].emailMasked).toBe('j***e@enterprise.com');
      expect(report.signers[0].verificationResult?.vendorReferenceId).toBe('bs_id_88291039');
      expect(report.signers[0].verificationResult?.biometricMatch).toBe(true);

      // Verify pre-verified signer entry
      expect(report.signers[1].isPreVerified).toBe(true);
      expect(report.signers[1].verificationResult?.certificateIssuer).toBe(
        'D-Trust Qualified EU CA',
      );
    });

    it('throws NotFoundException when signature request does not exist or org mismatch', async () => {
      await expect(service.generateReportData('wrong-org', sigReqId)).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.generateReportData(orgId, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateReportPdf', () => {
    it('generates a valid binary PDF buffer with certificate headers and legal attestation', async () => {
      const report = await service.generateReportData(orgId, sigReqId);
      const pdfBuffer = await service.generateReportPdf(report);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(500);

      const pdfString = pdfBuffer.toString('utf-8');
      expect(pdfString).toContain('%PDF-1.4');
      expect(pdfString).toContain('PACTINTEL IDENTITY ASSURANCE & COMPLIANCE CERTIFICATE');
      expect(pdfString).toContain('LEGAL & REGULATORY ATTESTATION');
      expect(pdfString).toContain('%%EOF');
    });
  });
});
