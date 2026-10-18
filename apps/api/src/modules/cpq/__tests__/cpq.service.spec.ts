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
});
