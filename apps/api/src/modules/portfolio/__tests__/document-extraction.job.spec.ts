import { Test, TestingModule } from '@nestjs/testing';
import { DocumentExtractionJob } from '../jobs/document-extraction.job';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../ai/gateway/ai.gateway';
import { ObligationService } from '../obligation.service';
import { CounterpartyService } from '../counterparty.service';
import { PortfolioRepository } from '../portfolio.repository';
import { SEARCH_PORT } from '../ports/search.port';
import { OCR_PORT } from '../ports/ocr.port';

describe('DocumentExtractionJob (Sprint 3.5 — Extraction Pipeline)', () => {
  let job: DocumentExtractionJob;
  let prisma: any;
  let aiGateway: jest.Mocked<AiGateway>;
  let obligationService: jest.Mocked<ObligationService>;
  let counterpartyService: jest.Mocked<CounterpartyService>;
  let searchPort: any;
  let ocrPort: any;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';
  const mockDocId = '0192a000-0000-7000-8000-000000000002';
  const mockVersionId = '0192a000-0000-7000-8000-000000000003';

  beforeEach(async () => {
    const mockPrisma = {
      document: {
        findFirst: jest.fn(),
      },
    };

    const mockAi = {
      generate: jest.fn(),
    };

    const mockObligationSvc = {
      recordExtractedObligations: jest.fn(),
    };

    const mockCpSvc = {
      findOrCreateByName: jest.fn(),
      linkDocumentToCounterparty: jest.fn(),
    };

    const mockRepo = {
      findCustomFields: jest.fn().mockResolvedValue([]),
    };

    searchPort = {
      indexDocument: jest.fn(),
      search: jest.fn(),
      deleteDocument: jest.fn(),
      healthCheck: jest.fn(),
    };

    ocrPort = {
      extractText: jest.fn().mockResolvedValue({
        text: 'Scanned Contract Content',
        confidence: 0.95,
        isScannedPdf: true,
      }),
      healthCheck: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentExtractionJob,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiGateway, useValue: mockAi },
        { provide: ObligationService, useValue: mockObligationSvc },
        { provide: CounterpartyService, useValue: mockCpSvc },
        { provide: PortfolioRepository, useValue: mockRepo },
        { provide: SEARCH_PORT, useValue: searchPort },
        { provide: OCR_PORT, useValue: ocrPort },
      ],
    }).compile();

    job = module.get<DocumentExtractionJob>(DocumentExtractionJob);
    prisma = module.get(PrismaService);
    aiGateway = module.get(AiGateway);
    obligationService = module.get(ObligationService);
    counterpartyService = module.get(CounterpartyService);
  });

  it('runs complete extraction pipeline: OCR -> AI Gateway -> Counterparty link -> Obligations -> Search indexing', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: mockDocId,
      organizationId: mockOrgId,
      title: 'Vendor Master Services Agreement',
      status: 'active',
      type: 'msa',
      versions: [
        {
          id: mockVersionId,
          versionNumber: 1,
          contentSnapshot: 'Vendor shall deliver services on time.',
        },
      ],
    } as any);

    aiGateway.generate.mockResolvedValue({
      content: JSON.stringify({
        counterparty: {
          name: 'Stripe, Inc.',
          domain: 'stripe.com',
        },
        obligations: [
          {
            fieldKey: 'payment_terms',
            fieldValue: 'Net 30 days',
            dueDate: '2026-12-31T00:00:00.000Z',
            confidenceScore: 0.98,
          },
        ],
      }),
      taskId: 'document-extraction',
      tokensUsed: 1200,
    });

    counterpartyService.findOrCreateByName.mockResolvedValue({
      id: 'cp-stripe',
      canonicalName: 'Stripe',
      aliases: [],
    } as any);

    const result = await job.processExtraction({
      documentId: mockDocId,
      organizationId: mockOrgId,
      userId: 'user-1',
    });

    expect(result?.success).toBe(true);
    expect(result?.counterpartyName).toBe('Stripe');
    expect(counterpartyService.linkDocumentToCounterparty).toHaveBeenCalledWith(
      mockDocId,
      'cp-stripe',
      mockOrgId,
    );
    expect(obligationService.recordExtractedObligations).toHaveBeenCalledWith(
      mockDocId,
      mockVersionId,
      mockOrgId,
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'payment_terms',
          fieldValue: 'Net 30 days',
        }),
      ]),
      1,
    );
    expect(searchPort.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockDocId,
        title: 'Vendor Master Services Agreement',
        counterpartyName: 'Stripe',
      }),
    );
  });

  it('triggers OcrPort when file buffer is provided for scanned documents', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: mockDocId,
      organizationId: mockOrgId,
      title: 'Scanned Paper Contract',
      status: 'active',
      type: 'contract',
      versions: [{ id: mockVersionId, versionNumber: 1 }],
    } as any);

    aiGateway.generate.mockResolvedValue({
      content: JSON.stringify({ obligations: [] }),
      taskId: 'document-extraction',
      tokensUsed: 500,
    });

    await job.processExtraction({
      documentId: mockDocId,
      organizationId: mockOrgId,
      userId: 'user-1',
      fileBufferBase64: Buffer.from('PDF_SCAN_DATA').toString('base64'),
      mimeType: 'application/pdf',
    });

    expect(ocrPort.extractText).toHaveBeenCalled();
  });
});
