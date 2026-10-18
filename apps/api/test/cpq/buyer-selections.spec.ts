import { CpqService } from '../../src/modules/cpq/cpq.service';
import { CpqRepository } from '../../src/modules/cpq/cpq.repository';
import Decimal from 'decimal.js';

describe('Integration Test: Buyer Pricing Selections Isolation (RULE CPQ-001)', () => {
  let cpqService: CpqService;
  let mockCpqRepo: Partial<CpqRepository>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const docId = '22222222-2222-7222-8222-222222222222';
  const tableId = '33333333-3333-7333-8333-333333333333';
  const requiredItemId = '44444444-4444-7444-8444-444444444444';
  const optionalItemId = '55555555-5555-7555-8555-555555555555';

  // In-memory tables simulating PostgreSQL tables
  let lineItemsStore: any[] = [];
  let buyerSelectionsStore: any[] = [];
  let documentsStore: any[] = [];

  beforeEach(() => {
    lineItemsStore = [
      {
        id: requiredItemId,
        pricingTableId: tableId,
        organizationId: orgId,
        name: 'Core SaaS License',
        quantity: new Decimal('1'),
        unitPrice: new Decimal('1000.00'),
        discountPercent: new Decimal('0'),
        discountAmount: new Decimal('0'),
        subtotal: new Decimal('1000.00'),
        isOptional: false,
        isSelected: true,
        sortOrder: 0,
      },
      {
        id: optionalItemId,
        pricingTableId: tableId,
        organizationId: orgId,
        name: 'Dedicated Support Package',
        quantity: new Decimal('1'),
        unitPrice: new Decimal('350.00'),
        discountPercent: new Decimal('0'),
        discountAmount: new Decimal('0'),
        subtotal: new Decimal('350.00'),
        isOptional: true,
        isSelected: false, // Deselected by default
        sortOrder: 1,
      },
    ];

    buyerSelectionsStore = [];

    documentsStore = [
      {
        id: docId,
        organizationId: orgId,
        title: 'Master Agreement',
        totalValue: '1000.00',
      },
    ];

    mockCpqRepo = {
      findPricingTableById: jest.fn().mockImplementation((id: string) => {
        if (id === tableId) {
          return Promise.resolve({
            id: tableId,
            documentId: docId,
            organizationId: orgId,
            displayFormat: 'line_items',
            discountRules: [],
            taxConfig: { taxRate: 0, taxLabel: 'Tax', taxIncluded: false },
            settings: { currency: 'USD', allowBuyerQuantityChange: true },
            lineItems: lineItemsStore,
          });
        }
        return Promise.resolve(null);
      }),

      upsertBuyerSelection: jest.fn().mockImplementation((params: any) => {
        const existingIdx = buyerSelectionsStore.findIndex(
          (b) =>
            b.pricingTableId === params.pricingTableId &&
            b.viewerSessionId === params.viewerSessionId,
        );
        if (existingIdx >= 0) {
          buyerSelectionsStore[existingIdx] = { ...buyerSelectionsStore[existingIdx], ...params };
          return Promise.resolve(buyerSelectionsStore[existingIdx]);
        }
        const created = { id: 'sel-uuid', ...params };
        buyerSelectionsStore.push(created);
        return Promise.resolve(created);
      }),

      updateDocumentTotalValue: jest.fn().mockImplementation((id: string, total: string) => {
        const doc = documentsStore.find((d) => d.id === id);
        if (doc) {
          doc.totalValue = total;
        }
        return Promise.resolve();
      }),

      updateLineItem: jest.fn().mockImplementation(() => {
        throw new Error('VIOLATION: updateLineItem must never be called during buyer selection!');
      }),
    };

    cpqService = new CpqService(mockCpqRepo as any);
  });

  it('RULE CPQ-001: buyer selection toggles optional item on, updates doc total, and NEVER mutates line_items table', async () => {
    // Initial snapshot of line items table
    const initialLineItemsSnapshot = JSON.stringify(lineItemsStore);

    // Recipient views and selects the optional package (qty: 2)
    const buyerInput = {
      viewerSessionId: 'sess-client-999',
      selections: [
        { lineItemId: requiredItemId, isSelected: true, quantity: 1 },
        { lineItemId: optionalItemId, isSelected: true, quantity: 2 }, // Toggled on with qty 2
      ],
    };

    const response = await cpqService.updateBuyerSelections(docId, tableId, buyerInput);

    // 1000 + (2 * 350) = 1700
    expect(response.total).toBe('1700.00');

    // 1. Verify buyer_pricing_selections row was created
    expect(buyerSelectionsStore).toHaveLength(1);
    expect(buyerSelectionsStore[0].viewerSessionId).toBe('sess-client-999');
    expect(buyerSelectionsStore[0].calculatedTotal).toBe('1700.00');

    // 2. Verify document.total_value was updated to 1700.00
    expect(documentsStore[0].totalValue).toBe('1700.00');

    // 3. INVARIANT CHECK: line_items table in DB remains 100% UNCHANGED
    expect(JSON.stringify(lineItemsStore)).toBe(initialLineItemsSnapshot);
    expect(mockCpqRepo.updateLineItem).not.toHaveBeenCalled();

    // Verify original line_item still has isSelected: false
    const dbOptionalItem = lineItemsStore.find((item) => item.id === optionalItemId);
    expect(dbOptionalItem.isSelected).toBe(false);
    expect(new Decimal(dbOptionalItem.quantity).toNumber()).toBe(1);
  });
});
