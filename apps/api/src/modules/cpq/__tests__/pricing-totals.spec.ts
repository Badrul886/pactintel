import Decimal from 'decimal.js';
import { CpqService } from '../cpq.service';

describe('Pricing Totals Calculation Engine (Decimal.js)', () => {
  let cpqService: CpqService;

  beforeEach(() => {
    // CpqService does not need repository for pure calculatePricingTotals tests
    cpqService = new CpqService({} as any);
  });

  // Test 1: [{qty:2, price:100, discPct:10}] -> total=180
  it('Test 1: should calculate total 180 for 2 items @ $100 with 10% discount', () => {
    const table = {
      taxConfig: { taxRate: 0, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-1',
        name: 'Professional Consulting',
        quantity: 2,
        unitPrice: 100,
        discountPercent: 10,
        discountAmount: 0,
        isSelected: true,
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items);

    expect(new Decimal(result.total).toNumber()).toBe(180);
    expect(result.subtotal).toBe('180.00');
    expect(result.totalDiscount).toBe('20.00');
    expect(result.taxAmount).toBe('0.00');
    expect(result.total).toBe('180.00');
    expect(result.lineItems[0].net).toBe('180.00');
  });

  // Test 2: [required $500, optional(deselected) $150] -> total=500
  it('Test 2: should exclude deselected optional items and total 500', () => {
    const table = {
      taxConfig: { taxRate: 0, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-req',
        name: 'Required Core License',
        quantity: 1,
        unitPrice: 500,
        isOptional: false,
        isSelected: true,
      },
      {
        id: 'item-opt',
        name: 'Optional Add-on Support',
        quantity: 1,
        unitPrice: 150,
        isOptional: true,
        isSelected: false, // Deselected
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items);

    expect(new Decimal(result.total).toNumber()).toBe(500);
    expect(result.subtotal).toBe('500.00');
    expect(result.total).toBe('500.00');
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].id).toBe('item-req');
  });

  // Test 3: [{qty:1, price:1000}] + taxRate=0.08 -> tax=80, total=1080
  it('Test 3: should calculate tax of 80 and total 1080 with 8% tax excluded', () => {
    const table = {
      taxConfig: { taxRate: 0.08, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-service',
        name: 'Infrastructure Implementation',
        quantity: 1,
        unitPrice: 1000,
        isSelected: true,
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items);

    expect(new Decimal(result.taxAmount).toNumber()).toBe(80);
    expect(new Decimal(result.total).toNumber()).toBe(1080);
    expect(result.subtotal).toBe('1000.00');
    expect(result.taxAmount).toBe('80.00');
    expect(result.total).toBe('1080.00');
  });

  // Test 4: [{qty:1, price:1080}] + taxRate=0.08, taxIncluded=true -> extractedTax=80, total=1080
  it('Test 4: should extract 80 tax from 1080 subtotal with tax included', () => {
    const table = {
      taxConfig: { taxRate: 0.08, taxIncluded: true },
      settings: { currency: 'EUR' },
    };
    const items = [
      {
        id: 'item-vat',
        name: 'European Cloud Package',
        quantity: 1,
        unitPrice: 1080,
        isSelected: true,
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items);

    expect(new Decimal(result.taxAmount).toNumber()).toBe(80);
    expect(new Decimal(result.total).toNumber()).toBe(1080);
    expect(result.subtotal).toBe('1080.00');
    expect(result.taxAmount).toBe('80.00');
    expect(result.total).toBe('1080.00');
  });

  // Test 5: [{qty:3, price:33.33}] -> lineNet === 99.99 (NOT 99.99000000000001) -- Decimal.js safety test
  it('Test 5: should avoid JS floating point errors and result in exact 99.99', () => {
    const table = {
      taxConfig: { taxRate: 0, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-precision',
        name: 'Precision Micro-Licenses',
        quantity: 3,
        unitPrice: 33.33,
        isSelected: true,
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items);

    expect(result.lineItems[0].net).toBe('99.99');
    expect(result.total).toBe('99.99');
    // Direct string check to verify zero binary representation drift
    expect(result.total).not.toContain('000000000001');
    expect(new Decimal(result.total).equals('99.99')).toBe(true);
  });

  // Test 6: optional item(deselected) + buyerSelection(isSelected:true, qty:3, price:200) -> total=600
  it('Test 6: should dynamically override deselected optional item via buyerSelection to total 600', () => {
    const table = {
      taxConfig: { taxRate: 0, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-opt-override',
        name: 'Custom Domain Addon',
        quantity: 1,
        unitPrice: 200,
        isOptional: true,
        isSelected: false, // Originally deselected
      },
    ];

    const buyerSelections = [
      {
        lineItemId: 'item-opt-override',
        isSelected: true,
        quantity: 3,
      },
    ];

    const result = cpqService.calculatePricingTotals(table, items, buyerSelections);

    expect(new Decimal(result.total).toNumber()).toBe(600);
    expect(result.total).toBe('600.00');
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].quantity).toBe('3');
    expect(result.lineItems[0].net).toBe('600.00');
  });

  // Additional Edge Case: Table-level percentage and fixed discounts combined
  it('should apply table-level discount rules correctly after item discounts', () => {
    const table = {
      discountRules: [
        { type: 'percentage' as const, value: 10, label: '10% Early Bird' },
        { type: 'fixed' as const, value: 50, label: '$50 Coupon' },
      ],
      taxConfig: { taxRate: 0, taxIncluded: false },
      settings: { currency: 'USD' },
    };
    const items = [
      {
        id: 'item-1',
        name: 'Service Package',
        quantity: 1,
        unitPrice: 1000,
        isSelected: true,
      },
    ];

    // Item subtotal = 1000. Table 10% disc = 100. Table fixed disc = 50. Total discount = 150. Total = 850.
    const result = cpqService.calculatePricingTotals(table, items);

    expect(result.subtotal).toBe('1000.00');
    expect(result.totalDiscount).toBe('150.00');
    expect(result.total).toBe('850.00');
  });
});
