import { PublicSigningController } from '../../src/modules/signing/public-signing.controller';
import { SigningController } from '../../src/modules/signing/signing.controller';
import { SigningService } from '../../src/modules/signing/signing.service';
import { SiftRiskScoringAdapter } from '../../src/modules/signing/adapters/sift-risk.adapter';
import { BoldSignAdapter } from '../../src/modules/signing/adapters/boldsign.adapter';
import { VerificationReportService } from '../../src/modules/signing/verification-report.service';
import { sha256 } from '@pactintel/shared-utils';

describe('Risk-Adaptive Identity Verification Orchestration (Sprint 3.7)', () => {
  let publicController: PublicSigningController;
  let signingController: SigningController;
  let signingService: SigningService;
  let riskAdapter: SiftRiskScoringAdapter;
  let boldSignAdapter: BoldSignAdapter;
  let verificationReportService: VerificationReportService;
  let mockSigningRepo: any;
  let mockPrisma: any;
  let mockCls: any;

  const orgId = '0192a000-0000-7000-8000-000000000001';
  const signerId = '0192a000-0000-7000-8000-000000000002';
  const docId = '0192a000-0000-7000-8000-000000000003';
  const sigReqId = 'sigreq-adaptive-001';
  const token = 'token-adaptive-test-123';

  let currentSignerState: any;
  const preVerifiedMap = new Map<string, any>();
  const auditEventsList: any[] = [];
  const riskAssessmentsList: any[] = [];

  beforeEach(() => {
    preVerifiedMap.clear();
    auditEventsList.length = 0;
    riskAssessmentsList.length = 0;

    riskAdapter = new SiftRiskScoringAdapter();
    riskAdapter.resetCircuitBreaker();

    boldSignAdapter = new BoldSignAdapter();
    boldSignAdapter.resetCircuitBreaker();

    currentSignerState = {
      id: signerId,
      organizationId: orgId,
      signatureRequestId: sigReqId,
      email: 'officer@corporate.com',
      name: 'Officer Alex',
      status: 'sent',
      roleLabel: 'Signer',
      verificationMethod: 'adaptive',
      verificationAttempts: 0,
      kbaLockedAt: null,
      verificationResult: null,
      signingToken: token,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      signatureRequest: {
        id: sigReqId,
        documentId: docId,
        document: {
          id: docId,
          organizationId: orgId,
          title: 'Strategic Partnership Agreement',
          status: 'sent',
          currency: 'USD',
          totalValue: 50000,
          organization: { id: orgId, name: 'PactIntel Enterprise', slug: 'pactintel' },
          signatureEvents: auditEventsList,
        },
        documentVersion: {
          versionNumber: 1,
          contentSnapshot: { title: 'Terms' },
          contentHash: 'hash-content-123456',
        },
      },
    };

    mockPrisma = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue({
          planTier: 'business',
        }),
      },
      signer: {
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(currentSignerState, data);
          return currentSignerState;
        }),
      },
      signatureEvent: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          auditEventsList.push(data);
          return data;
        }),
      },
      riskAssessment: {
        create: jest.fn().mockImplementation(async ({ data }) => {
          riskAssessmentsList.push(data);
          return data;
        }),
        findMany: jest.fn().mockImplementation(async () => riskAssessmentsList),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(mockPrisma)),
    };

    mockSigningRepo = {
      findSignerByToken: jest.fn().mockImplementation(async () => currentSignerState),
      findSignerById: jest.fn().mockImplementation(async () => currentSignerState),
      findPreVerifiedSigner: jest.fn().mockImplementation(async (hash: string) => {
        return preVerifiedMap.get(hash) || null;
      }),
      recordPreVerification: jest
        .fn()
        .mockImplementation(async (hash: string, method: string, date: Date = new Date()) => {
          const record = {
            emailHash: hash,
            verificationMethod: method,
            verifiedAt: date,
            expiresAt: new Date(date.getTime() + 365 * 24 * 60 * 60 * 1000),
          };
          preVerifiedMap.set(hash, record);
          return record;
        }),
      recordPreVerifiedBypass: jest
        .fn()
        .mockImplementation(async (_org, _doc, _sId, method, date) => {
          currentSignerState.verificationResult = {
            preVerified: true,
            method,
            verifiedAt: date.toISOString(),
            status: 'passed',
          };
          currentSignerState.status = 'viewed';
          auditEventsList.push({
            eventType: 'risk_scoring_pre_verified',
            metadata: { method, verifiedAt: date.toISOString() },
          });
          return currentSignerState;
        }),
      recordRiskAssessment: jest.fn().mockImplementation(async (data: any) => {
        riskAssessmentsList.push(data);
        return data;
      }),
      findSignatureRequestWithVerificationHistory: jest.fn().mockImplementation(async () => ({
        id: sigReqId,
        document: currentSignerState.signatureRequest.document,
        documentVersion: currentSignerState.signatureRequest.documentVersion,
        signers: [currentSignerState],
      })),
    };

    const mockOutbox: any = { emit: jest.fn().mockResolvedValue({ id: 'out-1' }) };
    const mockNotif: any = { enqueueEmail: jest.fn().mockResolvedValue(true) };

    signingService = new SigningService(
      mockSigningRepo,
      mockOutbox,
      mockNotif,
      mockPrisma,
      boldSignAdapter,
      riskAdapter,
    );

    verificationReportService = new VerificationReportService(mockSigningRepo, mockPrisma);

    mockCls = {
      get: jest.fn().mockReturnValue(orgId),
    };

    publicController = new PublicSigningController(signingService);
    signingController = new SigningController(
      signingService,
      mockSigningRepo,
      mockCls,
      verificationReportService,
    );
  });

  describe('Adaptive Risk Evaluation Flow', () => {
    it('evaluates low-risk corporate recipient and dynamically assigns passcode', async () => {
      currentSignerState.email = 'executive@acme-corp.com';
      currentSignerState.signatureRequest.document.totalValue = 5000;

      const pageData = await publicController.getSignerDocument(token, {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Chrome/120' },
      } as any);

      expect(pageData.signer.verificationMethod).toBe('passcode');
      expect(pageData.signer.isPreVerified).toBe(false);
      expect(riskAssessmentsList.length).toBeGreaterThan(0);
      expect(riskAssessmentsList[0].riskLevel).toBe('low');
    });

    it('evaluates high-risk transaction (> $100k) and dynamically steps up to ID document', async () => {
      currentSignerState.email = 'trader@hedgefund.com';
      currentSignerState.signatureRequest.document.totalValue = 250000; // > $100k elevates tier

      const pageData = await publicController.getSignerDocument(token, {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Chrome/120' },
      } as any);

      expect(pageData.signer.verificationMethod).toBe('id_document');
      const latestAssessment = riskAssessmentsList[riskAssessmentsList.length - 1];
      expect(latestAssessment.riskLevel).toBe('high');
      expect(latestAssessment.assignedMethod).toBe('id_document');
    });
  });

  describe('Pre-Verified User Network Flow', () => {
    it('waives verification when signer email hash is recognized in pre-verified network', async () => {
      // Simulate that the user previously passed Government ID verification in another deal
      const emailHash = sha256(currentSignerState.email.toLowerCase().trim());
      await mockSigningRepo.recordPreVerification(emailHash, 'id_document', new Date());

      const pageData = await publicController.getSignerDocument(token, {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Chrome/120' },
      } as any);

      expect(pageData.signer.isPreVerified).toBe(true);
      const vResult = pageData.signer.verificationResult as any;
      expect(vResult?.preVerified).toBe(true);
      expect(vResult?.method).toBe('id_document');

      // Verify audit event was logged
      const preVerifiedEvent = auditEventsList.find(
        (e) => e.eventType === 'risk_scoring_pre_verified',
      );
      expect(preVerifiedEvent).toBeDefined();
    });
  });

  describe('Circuit Breaker Outage & Conservative Fallback (RULE RISK-001)', () => {
    it('applies conservative fallback to id_document when circuit breaker is tripped open', async () => {
      // Trip the circuit breaker
      for (let i = 0; i < 5; i++) {
        riskAdapter.recordFailure();
      }
      expect(riskAdapter.getCircuitBreakerStatus().isOpen).toBe(true);

      const pageData = await publicController.getSignerDocument(token, {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Chrome/120' },
      } as any);

      // Conservative fallback requires ID document, never fails open to unverified
      expect(pageData.signer.verificationMethod).toBe('id_document');

      const fallbackAssessment = riskAssessmentsList.find((ra) => ra.fallbackApplied === true);
      expect(fallbackAssessment).toBeDefined();

      const fallbackEvent = auditEventsList.find((e) => e.eventType === 'risk_scoring_fallback');
      expect(fallbackEvent).toBeDefined();
      expect(fallbackEvent.metadata.reason).toBe('vendor_unreachable');
    });
  });

  describe('Proof-of-Verification Report Export Endpoint', () => {
    it('exports structured JSON verification report with zero PII', async () => {
      const mockRes: any = {
        json: jest.fn().mockImplementation((data) => data),
      };

      const result: any = await signingController.getVerificationReport(sigReqId, 'json', mockRes);
      expect(mockRes.json).toHaveBeenCalled();
      expect(result.signatureRequestId).toBe(sigReqId);
      expect(result.complianceStandard).toContain('eIDAS');
      expect(result.signers).toHaveLength(1);
      expect(result.signers[0].emailMasked).toBe('o***r@corporate.com');
    });

    it('exports binary PDF verification report with Content-Type header', async () => {
      const mockRes: any = {
        setHeader: jest.fn(),
        send: jest.fn().mockImplementation((buf) => buf),
      };

      const pdfResult: any = await signingController.getVerificationReport(
        sigReqId,
        'pdf',
        mockRes,
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalled();
      expect(pdfResult).toBeInstanceOf(Buffer);
      expect((pdfResult as Buffer).toString('utf-8')).toContain('%PDF-1.4');
    });
  });
});
