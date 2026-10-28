import { NotFoundException } from '@nestjs/common';
import { CpqService } from '../cpq.service';
import { CpqRepository } from '../cpq.repository';

describe('CpqService', () => {
  let service: CpqService;
  let mockRepo: jest.Mocked<CpqRepository>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const tableId = '33333333-3333-7333-8333-333333333333';
  const itemId = '44444444-4444-7444-8444-444444444444';

  const mockPricingTable: any = {
    id: tableId,
    documentId: docId,
    organizationId: orgId,
    displayFormat: 'line_items',
    discountRules: [],
    taxConfig: { taxRate: 0, taxLabel: 'Tax', taxIncluded: false },
    settings: {
      currency: 'USD',
      showDiscount: true,
      showTax: true,
      allowBuyerQuantityChange: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    lineItems: [
      {
        id: itemId,
        pricingTableId: tableId,
        organizationId: orgId,
        productItemId: null,
        name: 'Enterprise Consulting',
        description: null,
        quantity: 2,
        unitPrice: 500,
        discountPercent: 10,
        discountAmount: 0,
        subtotal: 1000,
        billingFrequency: 'one_time',
        isOptional: false,
        isSelected: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      createPricingTable: jest.fn().mockResolvedValue(mockPricingTable),
      findPricingTableById: jest.fn().mockResolvedValue(mockPricingTable),
      findPricingTablesByDocumentId: jest.fn().mockResolvedValue([mockPricingTable]),
      updatePricingTable: jest.fn().mockResolvedValue(mockPricingTable),
      deletePricingTable: jest.fn().mockResolvedValue(mockPricingTable),
      createLineItem: jest.fn().mockResolvedValue(mockPricingTable.lineItems[0]),
      findLineItemById: jest.fn().mockResolvedValue(mockPricingTable.lineItems[0]),
      findLineItemsByTableId: jest.fn().mockResolvedValue(mockPricingTable.lineItems),
      updateLineItem: jest.fn().mockResolvedValue(mockPricingTable.lineItems[0]),
      deleteLineItem: jest.fn().mockResolvedValue(mockPricingTable.lineItems[0]),
      reorderLineItems: jest.fn().mockResolvedValue(undefined),
      upsertBuyerSelection: jest.fn().mockResolvedValue({ id: 'sel-1' } as any),
      findBuyerSelection: jest.fn().mockResolvedValue(null),
      updateDocumentTotalValue: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new CpqService(mockRepo);
  });

  describe('createPricingTable', () => {
    it('should create a pricing table and compute initial totals', async () => {
      const result = await service.createPricingTable(orgId, {
        documentId: docId,
        displayFormat: 'line_items',
        discountRules: [],
        taxConfig: { taxRate: 0, taxLabel: 'Tax', taxIncluded: false },
        settings: {
          currency: 'USD',
          showDiscount: true,
          showTax: true,
          allowBuyerQuantityChange: false,
        },
      });

      expect(mockRepo.createPricingTable).toHaveBeenCalledWith(orgId, expect.any(Object));
      expect(result.id).toBe(tableId);
      // 2 * 500 - 10% = 900
      expect(result.totals.total).toBe('900.00');
    });
  });

  describe('getPricingTableById', () => {
    it('should return table and calculated totals when found', async () => {
      const result = await service.getPricingTableById(tableId, orgId);
      expect(result.id).toBe(tableId);
      expect(result.totals.subtotal).toBe('900.00');
    });

    it('should throw NotFoundException when table does not exist', async () => {
      mockRepo.findPricingTableById.mockResolvedValueOnce(null);
      await expect(service.getPricingTableById('non-existent', orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateBuyerSelections (RULE CPQ-001)', () => {
    it('should upsert buyer selection, recalculate totals, update document total value, and not touch line_items table', async () => {
      const dto = {
        viewerSessionId: 'sess-abc',
        selections: [
          {
            lineItemId: itemId,
            isSelected: true,
            quantity: 3, // Changed from 2 to 3
          },
        ],
      };

      const result = await service.updateBuyerSelections(docId, tableId, dto);

      // 3 * 500 - 10% = 1350
      expect(result.total).toBe('1350.00');
      expect(mockRepo.upsertBuyerSelection).toHaveBeenCalledWith({
        organizationId: orgId,
        documentId: docId,
        pricingTableId: tableId,
        viewerSessionId: 'sess-abc',
        selections: dto.selections,
        calculatedTotal: '1350.00',
      });
      expect(mockRepo.updateDocumentTotalValue).toHaveBeenCalledWith(docId, '1350.00');
      // Critical check: line_items table should NOT be updated directly
      expect(mockRepo.updateLineItem).not.toHaveBeenCalled();
    });
  });

  describe('Phase 3 Sprint 3.1 Enterprise CPQ Unit Tests', () => {
    it('createBundle() creates bundle with correct version number 1', async () => {
      const mockBundle: any = {
        id: 'bundle-1',
        organizationId: orgId,
        workspaceId: 'ws-1',
        name: 'Starter Enterprise Bundle',
        bundleType: 'fixed',
        fixedPrice: 5000,
        discountPercent: null,
        isActive: true,
        version: 1,
        items: [],
      };
      (mockRepo as any).createBundle = jest.fn().mockResolvedValue(mockBundle);

      const result = await service.createBundle(orgId, {
        workspaceId: 'ws-1',
        name: 'Starter Enterprise Bundle',
        bundleType: 'fixed',
        fixedPrice: 5000,
        items: [],
      });

      expect((mockRepo as any).createBundle).toHaveBeenCalledWith(orgId, expect.any(Object));
      expect(result.version).toBe(1);
    });

    it('updateBundle() increments version to preserve copy-on-create immutability', async () => {
      const updatedBundle: any = {
        id: 'bundle-1',
        organizationId: orgId,
        workspaceId: 'ws-1',
        name: 'Updated Bundle',
        bundleType: 'fixed',
        fixedPrice: 5500,
        discountPercent: null,
        isActive: true,
        version: 2, // Incremented version
        items: [],
      };
      (mockRepo as any).updateBundle = jest.fn().mockResolvedValue(updatedBundle);

      const result = await service.updateBundle('bundle-1', orgId, {
        name: 'Updated Bundle',
        fixedPrice: 5500,
      });

      expect((mockRepo as any).updateBundle).toHaveBeenCalledWith(
        'bundle-1',
        orgId,
        expect.any(Object),
      );
      expect(result.version).toBe(2);
    });

    it('evaluateRules() volume discount applies correctly through service', async () => {
      const mockRule: any = {
        id: 'rule-vol-1',
        name: 'Volume 10%',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 5 },
        actions: { discountPercent: 10 },
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      };
      (mockRepo as any).findPricingRules = jest.fn().mockResolvedValue([mockRule]);

      const result = await service.evaluateRules(orgId, {
        lineItems: [
          {
            id: 'li-1',
            name: 'Pro Seat',
            quantity: 10,
            unitPrice: 100, // $1,000 subtotal -> 10% = $100 discount
          },
        ],
        dealAttributes: {},
      });

      expect(result.totalBeforeDiscount).toBe('1000.00');
      expect(result.discountAmount).toBe('100.00');
      expect(result.totalAfterDiscount).toBe('900.00');
    });

    it('executePlaybook() returns filtered catalog for given deal attributes', async () => {
      const mockPlaybookService: any = {
        executePlaybook: jest.fn().mockResolvedValue({
          playbookId: 'pb-1',
          playbookName: 'Mid-Market SaaS Playbook',
          matchedCriteria: { industry: 'fintech' },
          eligibleCatalogItems: [{ id: 'prod-1', name: 'Fintech Compliance Engine' }],
          recommendedBundles: [],
          applicableRules: [],
          approvalWarnings: [],
        }),
      };

      const customService = new CpqService(mockRepo, mockPlaybookService);
      const result = await customService.executePlaybook(orgId, 'pb-1', {
        dealAttributes: { industry: 'fintech' },
      });

      expect(mockPlaybookService.executePlaybook).toHaveBeenCalledWith(orgId, 'pb-1', {
        dealAttributes: { industry: 'fintech' },
      });
      expect(result.eligibleCatalogItems).toHaveLength(1);
      expect(result.eligibleCatalogItems[0].name).toBe('Fintech Compliance Engine');
    });
  });
});
