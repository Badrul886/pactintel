import { evaluateCpqRules, PricingRuleDefinition, CpqEvaluationContext } from '../cpq-rules.engine';

describe('CpqRulesEngine (Pure Function Evaluation — RULE CPQ-001 & ADR-0048)', () => {
  const baseItems = [
    {
      id: 'item-1',
      productItemId: 'prod-enterprise-sku',
      name: 'Enterprise Platform License',
      quantity: 10,
      unitPrice: 1000, // 10 * 1000 = $10,000 subtotal
    },
    {
      id: 'item-2',
      productItemId: 'prod-support-sku',
      name: 'Premium 24/7 Support',
      quantity: 1,
      unitPrice: 2500, // 1 * 2500 = $2,500 subtotal
    },
  ];

  it('1. volume discount applies correctly when quantity threshold is met', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-vol-1',
        name: 'Tier 1 Volume Discount',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 5 },
        actions: { discountPercent: 15 }, // 15% off item 1
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
    };

    const result = evaluateCpqRules(ctx, rules);

    expect(result.totalBeforeDiscount).toBe('12500.00');
    // Item 1 qty is 10 >= 5 -> 15% discount on $10,000 = $1,500
    // Item 2 qty is 1 < 5 -> no discount
    expect(result.discountAmount).toBe('1500.00');
    expect(result.totalAfterDiscount).toBe('11000.00');
    expect(result.appliedRules).toHaveLength(1);
    expect(result.appliedRules[0].ruleId).toBe('rule-vol-1');
  });

  it('2. multiple rules with highest_wins stacking selects the larger discount', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-10-pct',
        name: '10% Promotion',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 5 },
        actions: { discountPercent: 10 }, // 10% of $10,000 = $1,000
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
      {
        id: 'rule-25-pct',
        name: '25% Partner Promotion',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 8 },
        actions: { discountPercent: 25 }, // 25% of $10,000 = $2,500 (wins)
        priority: 2,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
    };

    const result = evaluateCpqRules(ctx, rules);

    expect(result.discountAmount).toBe('2500.00');
    expect(result.totalAfterDiscount).toBe('10000.00');
    expect(result.appliedRules).toHaveLength(1);
    expect(result.appliedRules[0].ruleId).toBe('rule-25-pct');
  });

  it('3. multiple rules with stack_all stacking applies cumulatively', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-vol-10',
        name: '10% Volume Discount',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 5 },
        actions: { discountPercent: 10 }, // $1,000
        priority: 1,
        stackingMode: 'stack_all',
        isActive: true,
      },
      {
        id: 'rule-flat-500',
        name: 'Fixed $500 Credit',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 5 },
        actions: { discountAmount: 500 }, // $500
        priority: 2,
        stackingMode: 'stack_all',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
    };

    const result = evaluateCpqRules(ctx, rules);

    // Cumulative: $1,000 + $500 = $1,500 discount on item 1
    expect(result.discountAmount).toBe('1500.00');
    expect(result.totalAfterDiscount).toBe('11000.00');
    expect(result.appliedRules).toHaveLength(2);
  });

  it('4. time_based rule is ignored when evaluation timestamp is outside valid range', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-black-friday',
        name: 'Black Friday Sale',
        ruleType: 'time_based',
        conditions: {},
        actions: { discountPercent: 30 },
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
        validFrom: '2026-11-20T00:00:00Z',
        validUntil: '2026-11-30T23:59:59Z',
      },
    ];

    // Current eval date is October 2026 (outside Black Friday)
    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
      timestamp: new Date('2026-10-28T12:00:00Z'),
    };

    const result = evaluateCpqRules(ctx, rules);

    expect(result.discountAmount).toBe('0.00');
    expect(result.totalAfterDiscount).toBe('12500.00');
    expect(result.appliedRules).toHaveLength(0);
  });

  it('5. deal_value_threshold rule applies table-level discount and triggers approval if value exceeds limit', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-large-deal',
        name: 'Mega Deal 5% Rebate',
        ruleType: 'deal_value_threshold',
        conditions: { thresholdValue: 10000 },
        actions: { discountPercent: 5 }, // 5% of $12,500 = $625
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
      approvalThresholds: {
        dealValueGt: 10000, // Manager approval required if deal > $10,000
      },
    };

    const result = evaluateCpqRules(ctx, rules);

    // Total: $12,500 - $625 = $11,875
    expect(result.discountAmount).toBe('625.00');
    expect(result.totalAfterDiscount).toBe('11875.00');
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalReasons[0]).toContain('exceeds manager approval threshold of $10000.00');
  });

  it('6. discount_pct_gt triggers finance approval when total discount exceeds threshold', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-massive-discount',
        name: 'Executive Special',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 1 },
        actions: { discountPercent: 35 }, // 35% discount
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
      approvalThresholds: {
        discountPctGt: 20, // Finance approval required if discount > 20%
      },
    };

    const result = evaluateCpqRules(ctx, rules);

    expect(result.requiresApproval).toBe(true);
    expect(result.approvalReasons[0]).toContain('exceeds finance approval threshold of 20.00%');
  });

  it('7. restricted_product triggers legal approval when quote contains restricted SKU', () => {
    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
      approvalThresholds: {
        restrictedProductIds: ['prod-enterprise-sku'],
      },
    };

    const result = evaluateCpqRules(ctx, []);

    expect(result.requiresApproval).toBe(true);
    expect(result.approvalReasons[0]).toContain(
      'Quote contains restricted product(s) requiring legal approval: Enterprise Platform License',
    );
  });

  it('8. customer_segment rule matches deal attribute and applies targeted pricing', () => {
    const rules: PricingRuleDefinition[] = [
      {
        id: 'rule-healthcare-discount',
        name: 'Healthcare Vertical 10%',
        ruleType: 'customer_segment',
        conditions: { field: 'industry', value: 'healthcare' },
        actions: { discountPercent: 10 },
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: baseItems,
      dealAttributes: { industry: 'healthcare', region: 'EMEA' },
    };

    const result = evaluateCpqRules(ctx, rules);

    expect(result.discountAmount).toBe('1250.00'); // 10% of $12,500
    expect(result.totalAfterDiscount).toBe('11250.00');
    expect(result.appliedRules).toHaveLength(2);
  });

  it('9. unselected or optional items are excluded from total calculations', () => {
    const itemsWithDeselected = [
      ...baseItems,
      {
        id: 'item-3',
        productItemId: 'prod-optional-addon',
        name: 'Optional Migration Service',
        quantity: 1,
        unitPrice: 5000,
        isSelected: false, // Deselected by buyer
      },
    ];

    const ctx: CpqEvaluationContext = {
      lineItems: itemsWithDeselected,
    };

    const result = evaluateCpqRules(ctx, []);

    // Total should only reflect active items (12,500), ignoring the $5,000 unselected item
    expect(result.totalBeforeDiscount).toBe('12500.00');
    expect(result.totalAfterDiscount).toBe('12500.00');
  });
});
