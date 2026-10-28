import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioController } from '../portfolio.controller';
import { PortfolioService } from '../portfolio.service';
import { ObligationService } from '../obligation.service';
import { CounterpartyService } from '../counterparty.service';
import { DocumentExtractionJob } from '../jobs/document-extraction.job';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { CaslGuard } from '../../../common/guards/casl.guard';

describe('PortfolioController (Sprint 3.5 — REST Endpoints)', () => {
  let controller: PortfolioController;
  let portfolioService: any;
  let obligationService: any;
  let counterpartyService: any;
  let extractionJob: any;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';
  const mockUserId = '0192a000-0000-7000-8000-000000000002';
  const mockReq = {
    user: {
      id: mockUserId,
      organizationId: mockOrgId,
    },
  };

  beforeEach(async () => {
    portfolioService = {
      getDashboardMetrics: jest.fn().mockResolvedValue({ totalAgreements: 5 }),
      search: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      listCustomFields: jest.fn().mockResolvedValue([]),
      createCustomField: jest.fn().mockResolvedValue({ id: 'cf-1' }),
      deleteCustomField: jest.fn().mockResolvedValue({ count: 1 }),
      generatePortfolioReport: jest.fn().mockResolvedValue({ report: 'Report content' }),
    };

    obligationService = {
      listObligations: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getObligationById: jest.fn().mockResolvedValue({ id: 'ob-1' }),
      verify: jest.fn().mockResolvedValue({ id: 'ob-1', isVerified: true }),
      confirmPendingUpdate: jest.fn().mockResolvedValue({ id: 'ob-1', isVerified: true }),
      dismissPendingUpdate: jest.fn().mockResolvedValue({ id: 'ob-1', isVerified: false }),
    };

    counterpartyService = {
      listCounterparties: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getCounterpartyById: jest.fn().mockResolvedValue({ id: 'cp-1' }),
      findOrCreateByName: jest.fn().mockResolvedValue({ id: 'cp-1', canonicalName: 'Acme' }),
    };

    extractionJob = {
      enqueue: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortfolioController],
      providers: [
        { provide: PortfolioService, useValue: portfolioService },
        { provide: ObligationService, useValue: obligationService },
        { provide: CounterpartyService, useValue: counterpartyService },
        { provide: DocumentExtractionJob, useValue: extractionJob },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaslGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PortfolioController>(PortfolioController);
  });

  it('getDashboard returns metrics for tenant', async () => {
    const res = await controller.getDashboard(mockReq);
    expect(res).toEqual({ totalAgreements: 5 });
    expect(portfolioService.getDashboardMetrics).toHaveBeenCalledWith(mockOrgId);
  });

  it('searchAgreements calls search with parameters', async () => {
    await controller.searchAgreements(
      mockReq,
      'service',
      undefined,
      undefined,
      undefined,
      '10',
      '0',
    );
    expect(portfolioService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'service',
        organizationId: mockOrgId,
        limit: 10,
        offset: 0,
      }),
    );
  });

  it('confirmAmendment delegates to ObligationService.confirmPendingUpdate', async () => {
    await controller.confirmAmendment(mockReq, 'ob-1');
    expect(obligationService.confirmPendingUpdate).toHaveBeenCalledWith('ob-1', mockOrgId);
  });

  it('dismissAmendment delegates to ObligationService.dismissPendingUpdate', async () => {
    await controller.dismissAmendment(mockReq, 'ob-1');
    expect(obligationService.dismissPendingUpdate).toHaveBeenCalledWith('ob-1', mockOrgId);
  });

  it('triggerExtraction dispatches background extraction job', async () => {
    await controller.triggerExtraction(mockReq, 'doc-123', { rawText: 'Sample contract text' });
    expect(extractionJob.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-123',
        organizationId: mockOrgId,
        userId: mockUserId,
        rawText: 'Sample contract text',
      }),
    );
  });
});
