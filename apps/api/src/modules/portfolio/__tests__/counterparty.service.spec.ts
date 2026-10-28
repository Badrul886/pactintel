import { Test, TestingModule } from '@nestjs/testing';
import { CounterpartyService } from '../counterparty.service';
import { PortfolioRepository } from '../portfolio.repository';
import { PrismaService } from '../../../prisma/prisma.service';

describe('CounterpartyService (Sprint 3.5 — Normalization & Deduplication)', () => {
  let service: CounterpartyService;
  let repository: jest.Mocked<PortfolioRepository>;
  let prisma: any;

  const mockOrgId = '0192a000-0000-7000-8000-000000000001';
  const mockCpId = '0192a000-0000-7000-8000-000000000002';

  beforeEach(async () => {
    const mockRepo = {
      findCounterpartyByName: jest.fn(),
      findCounterpartyById: jest.fn(),
      findCounterparties: jest.fn(),
      createCounterparty: jest.fn(),
      updateCounterparty: jest.fn(),
    };

    const mockPrisma = {
      document: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CounterpartyService,
        { provide: PortfolioRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CounterpartyService>(CounterpartyService);
    repository = module.get(PortfolioRepository);
    prisma = module.get(PrismaService);
  });

  describe('normalizeName', () => {
    it('strips common corporate suffixes and trims whitespace', () => {
      expect(service.normalizeName('Acme, Inc.')).toBe('acme');
      expect(service.normalizeName('Acme LLC')).toBe('acme');
      expect(service.normalizeName('Acme Corporation')).toBe('acme');
      expect(service.normalizeName('Global Logistics Ltd.')).toBe('global logistics');
      expect(service.normalizeName('Tech Co.')).toBe('tech');
    });
  });

  describe('findOrCreateByName', () => {
    it('returns existing counterparty on exact match', async () => {
      repository.findCounterpartyByName.mockResolvedValue({
        id: mockCpId,
        canonicalName: 'Acme Corp',
        aliases: [],
      } as any);

      const result = await service.findOrCreateByName(mockOrgId, 'Acme Corp');
      expect(result.id).toBe(mockCpId);
      expect(repository.createCounterparty).not.toHaveBeenCalled();
    });

    it('deduplicates via normalized matching and appends new alias', async () => {
      repository.findCounterpartyByName.mockResolvedValue(null);
      repository.findCounterparties.mockResolvedValue({
        items: [
          {
            id: mockCpId,
            canonicalName: 'Acme Inc.',
            aliases: ['Acme Global'],
          },
        ],
        total: 1,
      } as any);

      const result = await service.findOrCreateByName(mockOrgId, 'Acme LLC');
      expect(result.id).toBe(mockCpId);
      expect(repository.updateCounterparty).toHaveBeenCalledWith(
        mockCpId,
        mockOrgId,
        expect.objectContaining({
          aliases: expect.arrayContaining(['Acme Global', 'Acme LLC']),
        }),
      );
    });

    it('creates new counterparty if no match found', async () => {
      repository.findCounterpartyByName.mockResolvedValue(null);
      repository.findCounterparties.mockResolvedValue({ items: [], total: 0 } as any);
      repository.createCounterparty.mockResolvedValue({
        id: mockCpId,
        canonicalName: 'New Horizon Ventures',
        aliases: [],
      } as any);

      const result = await service.findOrCreateByName(mockOrgId, 'New Horizon Ventures');
      expect(result.id).toBe(mockCpId);
      expect(repository.createCounterparty).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalName: 'New Horizon Ventures',
          organizationId: mockOrgId,
        }),
      );
    });
  });

  describe('linkDocumentToCounterparty', () => {
    it('updates document with counterpartyId', async () => {
      repository.findCounterpartyById.mockResolvedValue({
        id: mockCpId,
        organizationId: mockOrgId,
      } as any);

      prisma.document.update.mockResolvedValue({ id: 'doc-1', counterpartyId: mockCpId } as any);

      await service.linkDocumentToCounterparty('doc-1', mockCpId, mockOrgId);
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { counterpartyId: mockCpId },
      });
    });
  });
});
