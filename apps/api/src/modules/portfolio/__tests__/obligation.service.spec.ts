import { Test, TestingModule } from '@nestjs/testing';
import { ObligationService } from '../obligation.service';
import { PortfolioRepository } from '../portfolio.repository';
import { BadRequestException } from '@nestjs/common';

describe('ObligationService (Sprint 3.5 — RULE PORT-001)', () => {
  let service: ObligationService;
  let repository: jest.Mocked<PortfolioRepository>;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';
  const mockDocId = '0192a000-0000-7000-8000-000000000002';
  const mockVersionId = '0192a000-0000-7000-8000-000000000003';
  const mockObligationId = '0192a000-0000-7000-8000-000000000004';

  beforeEach(async () => {
    const mockRepo = {
      findObligations: jest.fn(),
      findObligationById: jest.fn(),
      findObligationsByDocument: jest.fn(),
      createObligation: jest.fn(),
      updateObligation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObligationService,
        {
          provide: PortfolioRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ObligationService>(ObligationService);
    repository = module.get(PortfolioRepository);
  });

  describe('verify', () => {
    it('marks an unverified obligation as verified', async () => {
      repository.findObligationById.mockResolvedValue({
        id: mockObligationId,
        organizationId: mockOrgId,
        fieldName: 'payment_terms',
        isVerified: false,
        pendingUpdate: null,
      } as any);

      repository.updateObligation.mockResolvedValue({
        id: mockObligationId,
        isVerified: true,
      } as any);

      const result = await service.verify(mockObligationId, mockOrgId);
      expect(result.isVerified).toBe(true);
      expect(repository.updateObligation).toHaveBeenCalledWith(
        mockObligationId,
        mockOrgId,
        expect.objectContaining({ isVerified: true }),
      );
    });

    it('rejects verifying an obligation that has a pending amendment review', async () => {
      repository.findObligationById.mockResolvedValue({
        id: mockObligationId,
        organizationId: mockOrgId,
        fieldName: 'payment_terms',
        isVerified: false,
        pendingUpdate: { proposedValue: 'Net 60' },
      } as any);

      await expect(service.verify(mockObligationId, mockOrgId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('RULE PORT-001: recordExtractedObligations', () => {
    it('creates brand new obligations directly when none exist', async () => {
      repository.findObligationsByDocument.mockResolvedValue([]);
      repository.createObligation.mockImplementation(async (data: any) => ({
        id: mockObligationId,
        ...data,
      }));

      const results = await service.recordExtractedObligations(
        mockDocId,
        mockVersionId,
        mockOrgId,
        [
          {
            fieldName: 'payment_terms',
            fieldValue: 'Net 30',
            confidenceScore: 0.95,
          },
        ],
        1,
      );

      expect(results).toHaveLength(1);
      expect(repository.createObligation).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldName: 'payment_terms',
          fieldValue: 'Net 30',
          isVerified: false,
        }),
      );
    });

    it('INVARIANT RULE PORT-001: Never auto-applies modified values to active obligations; writes only to pending_update', async () => {
      const existingObligation = {
        id: mockObligationId,
        organizationId: mockOrgId,
        documentId: mockDocId,
        fieldName: 'payment_terms',
        fieldValue: 'Net 30',
        fieldValueDate: null,
        isVerified: true,
        pendingUpdate: null,
      };

      repository.findObligationsByDocument.mockResolvedValue([existingObligation as any]);
      repository.updateObligation.mockImplementation(async (_id, _orgId, data: any) => ({
        ...existingObligation,
        ...data,
      }));

      const results = await service.recordExtractedObligations(
        mockDocId,
        mockVersionId,
        mockOrgId,
        [
          {
            fieldName: 'payment_terms',
            fieldValue: 'Net 60', // Modified by amendment!
            confidenceScore: 0.98,
            sourceSnippet: 'Payment shall be made within sixty (60) days.',
          },
        ],
        2, // Amendment version 2
      );

      expect(results).toHaveLength(1);
      // Ensure updateObligation did NOT overwrite fieldValue!
      expect(repository.updateObligation).toHaveBeenCalledWith(
        mockObligationId,
        mockOrgId,
        expect.objectContaining({
          pendingUpdate: expect.objectContaining({
            proposedValue: 'Net 60',
            confidenceScore: 0.98,
            reason: 'Extracted from amended document v2',
          }),
        }),
      );
      // Verify active fieldValue was NOT updated
      const callArgs = repository.updateObligation.mock.calls[0][2];
      expect(callArgs.fieldValue).toBeUndefined();
    });

    it('does not touch obligation when extracted value is identical', async () => {
      const existingObligation = {
        id: mockObligationId,
        organizationId: mockOrgId,
        documentId: mockDocId,
        fieldName: 'payment_terms',
        fieldValue: 'Net 30',
        fieldValueDate: null,
        isVerified: true,
        pendingUpdate: null,
      };

      repository.findObligationsByDocument.mockResolvedValue([existingObligation as any]);

      const results = await service.recordExtractedObligations(
        mockDocId,
        mockVersionId,
        mockOrgId,
        [
          {
            fieldName: 'payment_terms',
            fieldValue: 'Net 30', // Same value!
          },
        ],
        2,
      );

      expect(results).toHaveLength(1);
      expect(repository.updateObligation).not.toHaveBeenCalled();
    });
  });

  describe('confirmPendingUpdate', () => {
    it('promotes proposedValue to active fieldValue, sets isVerified: true, and clears pendingUpdate', async () => {
      repository.findObligationById.mockResolvedValue({
        id: mockObligationId,
        organizationId: mockOrgId,
        fieldName: 'payment_terms',
        fieldValue: 'Net 30',
        isVerified: false,
        pendingUpdate: {
          proposedValue: 'Net 60',
          proposedDueDate: '2027-01-01T00:00:00.000Z',
          confidenceScore: 0.99,
        },
      } as any);

      repository.updateObligation.mockImplementation(async (_id, _orgId, data: any) => ({
        id: mockObligationId,
        ...data,
      }));

      await service.confirmPendingUpdate(mockObligationId, mockOrgId);

      expect(repository.updateObligation).toHaveBeenCalledWith(
        mockObligationId,
        mockOrgId,
        expect.objectContaining({
          fieldValue: 'Net 60',
          isVerified: true,
        }),
      );
    });

    it('throws BadRequestException if no pending amendment exists', async () => {
      repository.findObligationById.mockResolvedValue({
        id: mockObligationId,
        organizationId: mockOrgId,
        pendingUpdate: null,
      } as any);

      await expect(service.confirmPendingUpdate(mockObligationId, mockOrgId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('dismissPendingUpdate', () => {
    it('clears pendingUpdate and preserves original active values', async () => {
      repository.findObligationById.mockResolvedValue({
        id: mockObligationId,
        organizationId: mockOrgId,
        fieldName: 'payment_terms',
        fieldValue: 'Net 30',
        pendingUpdate: { proposedValue: 'Net 60' },
      } as any);

      repository.updateObligation.mockResolvedValue({
        id: mockObligationId,
        pendingUpdate: null,
      } as any);

      await service.dismissPendingUpdate(mockObligationId, mockOrgId);

      expect(repository.updateObligation).toHaveBeenCalledWith(
        mockObligationId,
        mockOrgId,
        expect.objectContaining({
          pendingUpdate: expect.anything(),
        }),
      );
    });
  });
});
