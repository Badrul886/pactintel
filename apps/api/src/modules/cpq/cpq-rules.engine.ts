import Decimal from 'decimal.js';
import {
  CpqLineItemInput,
  CalculatedLineItemTotal,
  AppliedRuleDto,
  CpqEvaluationResultDto,
  PricingRuleType,
  StackingMode,
} from '@pactintel/shared-types';

export interface PricingRuleDefinition {
  id: string;
  name: string;
  ruleType: PricingRuleType;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  priority: number;
  stackingMode: StackingMode;
  isActive: boolean;
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
}

export interface CpqApprovalThresholds {
  dealValueGt?: number | string | Decimal | null;
  discountPctGt?: number | string | Decimal | null;
  restrictedProductIds?: string[];
}

export interface CpqEvaluationContext {
  lineItems: CpqLineItemInput[];
  dealAttributes?: Record<string, string | number | boolean>;
  orgId?: string;
  timestamp?: Date;
  approvalThresholds?: CpqApprovalThresholds;
}

interface IntermediateLineItem {
  id: string;
  productItemId?: string | null;
  name: string;
  quantity: Decimal;
  unitPrice: Decimal;
  baseSubtotal: Decimal;
  discountPercent: Decimal;
  discountAmount: Decimal;
  net: Decimal;
  billingFrequency: string;
  isOptional: boolean;
  isSelected: boolean;
  sortOrder: number;
  appliedRuleIds: string[];
}

/**
 * PURE FUNCTION: Evaluates CPQ pricing rules, discounts, and approval thresholds.
 * Zero database calls. Zero external APIs. Deterministic Decimal.js arithmetic (RULE CPQ-001).
 */
export function evaluateCpqRules(
  context: CpqEvaluationContext,
  rules: PricingRuleDefinition[] = [],
): CpqEvaluationResultDto {
  const evalTime = context.timestamp || new Date();
  const dealAttrs = context.dealAttributes || {};
  const activeItems = (context.lineItems || []).filter((item) => item.isSelected !== false);

  // 1. Initialize intermediate line items with exact Decimal precision
  const lineItemMap: IntermediateLineItem[] = activeItems.map((item, idx) => {
    const qty = new Decimal(item.quantity || 1);
    const price = new Decimal(item.unitPrice || 0);
    const subtotal = qty.mul(price).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const initPct = new Decimal(item.discountPercent || 0);
    let initAmt = new Decimal(item.discountAmount || 0);

    if (initPct.greaterThan(0)) {
      const pctDiscount = subtotal.mul(initPct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      initAmt = Decimal.max(initAmt, pctDiscount);
    }

    const net = Decimal.max(0, subtotal.minus(initAmt));

    return {
      id: item.id,
      productItemId: item.productItemId || null,
      name: item.name,
      quantity: qty,
      unitPrice: price,
      baseSubtotal: subtotal,
      discountPercent: initPct,
      discountAmount: initAmt,
      net,
      billingFrequency: item.billingFrequency || 'one_time',
      isOptional: item.isOptional || false,
      isSelected: true,
      sortOrder: item.sortOrder ?? idx,
      appliedRuleIds: [],
    };
  });

  // 2. Filter active rules valid at evalTime
  const validRules = rules
    .filter((r) => r.isActive !== false)
    .filter((r) => {
      if (r.validFrom) {
        const from = new Date(r.validFrom);
        if (evalTime < from) return false;
      }
      if (r.validUntil) {
        const until = new Date(r.validUntil);
        if (evalTime > until) return false;
      }
      return true;
    })
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  const appliedRules: AppliedRuleDto[] = [];

  // 3. Process Line-Item Level Rules (Volume, Segment, Time-Based targeting items)
  for (const item of lineItemMap) {
    const applicableItemRules: {
      rule: PricingRuleDefinition;
      calculatedDiscount: Decimal;
      description: string;
    }[] = [];

    for (const rule of validRules) {
      const cond = rule.conditions || {};
      const act = rule.actions || {};

      // Match item targets: if targetProductIds is specified, item must match
      if (
        cond.productItemIds &&
        Array.isArray(cond.productItemIds) &&
        cond.productItemIds.length > 0
      ) {
        if (!item.productItemId || !cond.productItemIds.includes(item.productItemId)) {
          continue;
        }
      }

      let matches = false;
      let ruleDesc = '';

      // Type A: volume_discount
      if (rule.ruleType === 'volume_discount') {
        const minQty = new Decimal(cond.minQuantity ?? 0);
        if (item.quantity.greaterThanOrEqualTo(minQty)) {
          matches = true;
          ruleDesc = `Volume discount for qty >= ${minQty.toString()}`;
        }
      }

      // Type B: customer_segment
      else if (rule.ruleType === 'customer_segment') {
        if (cond.field && cond.value !== undefined) {
          const attrVal = dealAttrs[cond.field];
          if (Array.isArray(cond.value)) {
            matches = cond.value.includes(attrVal);
          } else {
            matches = String(attrVal).toLowerCase() === String(cond.value).toLowerCase();
          }
          if (matches) {
            ruleDesc = `Customer segment match (${cond.field} = ${attrVal})`;
          }
        }
      }

      // Type C: time_based promotion targeting items
      else if (rule.ruleType === 'time_based') {
        matches = true;
        ruleDesc = `Promotional time-based pricing rule`;
      }

      if (matches) {
        let disc = new Decimal(0);
        if (act.discountPercent !== undefined && act.discountPercent !== null) {
          const pct = new Decimal(act.discountPercent);
          disc = item.baseSubtotal.mul(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        } else if (act.discountAmount !== undefined && act.discountAmount !== null) {
          disc = new Decimal(act.discountAmount);
        } else if (act.newUnitPrice !== undefined && act.newUnitPrice !== null) {
          const newPrice = new Decimal(act.newUnitPrice);
          const oldSub = item.baseSubtotal;
          const newSub = item.quantity.mul(newPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          disc = Decimal.max(0, oldSub.minus(newSub));
        }

        if (disc.greaterThan(0)) {
          applicableItemRules.push({
            rule,
            calculatedDiscount: disc,
            description: ruleDesc,
          });
        }
      }
    }

    if (applicableItemRules.length > 0) {
      // Apply stacking mode across item rules
      const stackingMode = applicableItemRules[0].rule.stackingMode || 'highest_wins';

      if (stackingMode === 'highest_wins') {
        // Find single rule with highest discount
        applicableItemRules.sort((a, b) =>
          b.calculatedDiscount.minus(a.calculatedDiscount).toNumber(),
        );
        const best = applicableItemRules[0];
        item.discountAmount = Decimal.max(item.discountAmount, best.calculatedDiscount);
        item.net = Decimal.max(0, item.baseSubtotal.minus(item.discountAmount));
        item.appliedRuleIds.push(best.rule.id);
        appliedRules.push({
          ruleId: best.rule.id,
          ruleName: best.rule.name,
          ruleType: best.rule.ruleType,
          discountAmount: best.calculatedDiscount.toFixed(2),
          targetLineItemId: item.id,
          description: best.description,
        });
      } else if (stackingMode === 'first_match') {
        const first = applicableItemRules[0];
        item.discountAmount = Decimal.max(item.discountAmount, first.calculatedDiscount);
        item.net = Decimal.max(0, item.baseSubtotal.minus(item.discountAmount));
        item.appliedRuleIds.push(first.rule.id);
        appliedRules.push({
          ruleId: first.rule.id,
          ruleName: first.rule.name,
          ruleType: first.rule.ruleType,
          discountAmount: first.calculatedDiscount.toFixed(2),
          targetLineItemId: item.id,
          description: first.description,
        });
      } else if (stackingMode === 'stack_all') {
        let totalItemDisc = item.discountAmount;
        for (const candidate of applicableItemRules) {
          totalItemDisc = totalItemDisc.plus(candidate.calculatedDiscount);
          item.appliedRuleIds.push(candidate.rule.id);
          appliedRules.push({
            ruleId: candidate.rule.id,
            ruleName: candidate.rule.name,
            ruleType: candidate.rule.ruleType,
            discountAmount: candidate.calculatedDiscount.toFixed(2),
            targetLineItemId: item.id,
            description: candidate.description,
          });
        }
        item.discountAmount = Decimal.min(item.baseSubtotal, totalItemDisc);
        item.net = Decimal.max(0, item.baseSubtotal.minus(item.discountAmount));
      }
    }
  }

  // 4. Compute Subtotals across line items
  let totalBeforeDiscount = new Decimal(0);
  let totalLineItemDiscounts = new Decimal(0);
  for (const item of lineItemMap) {
    totalBeforeDiscount = totalBeforeDiscount.plus(item.baseSubtotal);
    totalLineItemDiscounts = totalLineItemDiscounts.plus(item.discountAmount);
  }

  let subtotalAfterLineDiscounts = Decimal.max(
    0,
    totalBeforeDiscount.minus(totalLineItemDiscounts),
  );

  // 5. Process Table-Level Rules (e.g. deal_value_threshold)
  let tableLevelDiscount = new Decimal(0);
  const applicableTableRules: {
    rule: PricingRuleDefinition;
    calculatedDiscount: Decimal;
    description: string;
  }[] = [];

  for (const rule of validRules) {
    if (rule.ruleType === 'deal_value_threshold') {
      const cond = rule.conditions || {};
      const act = rule.actions || {};
      const thresholdVal = new Decimal(cond.thresholdValue ?? cond.minTotal ?? 0);

      // Compare against totalBeforeDiscount or current subtotal
      if (totalBeforeDiscount.greaterThanOrEqualTo(thresholdVal)) {
        let disc = new Decimal(0);
        if (act.discountPercent !== undefined && act.discountPercent !== null) {
          const pct = new Decimal(act.discountPercent);
          disc = subtotalAfterLineDiscounts
            .mul(pct)
            .div(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        } else if (act.discountAmount !== undefined && act.discountAmount !== null) {
          disc = new Decimal(act.discountAmount);
        }

        if (disc.greaterThan(0)) {
          applicableTableRules.push({
            rule,
            calculatedDiscount: disc,
            description: `Deal value threshold reached (total >= ${thresholdVal.toString()})`,
          });
        }
      }
    }
  }

  if (applicableTableRules.length > 0) {
    const tableStacking = applicableTableRules[0].rule.stackingMode || 'highest_wins';

    if (tableStacking === 'highest_wins') {
      applicableTableRules.sort((a, b) =>
        b.calculatedDiscount.minus(a.calculatedDiscount).toNumber(),
      );
      const best = applicableTableRules[0];
      tableLevelDiscount = best.calculatedDiscount;
      appliedRules.push({
        ruleId: best.rule.id,
        ruleName: best.rule.name,
        ruleType: best.rule.ruleType,
        discountAmount: best.calculatedDiscount.toFixed(2),
        description: best.description,
      });
    } else if (tableStacking === 'first_match') {
      const first = applicableTableRules[0];
      tableLevelDiscount = first.calculatedDiscount;
      appliedRules.push({
        ruleId: first.rule.id,
        ruleName: first.rule.name,
        ruleType: first.rule.ruleType,
        discountAmount: first.calculatedDiscount.toFixed(2),
        description: first.description,
      });
    } else if (tableStacking === 'stack_all') {
      for (const candidate of applicableTableRules) {
        tableLevelDiscount = tableLevelDiscount.plus(candidate.calculatedDiscount);
        appliedRules.push({
          ruleId: candidate.rule.id,
          ruleName: candidate.rule.name,
          ruleType: candidate.rule.ruleType,
          discountAmount: candidate.calculatedDiscount.toFixed(2),
          description: candidate.description,
        });
      }
    }
  }

  const finalTotalDiscount = Decimal.min(
    totalBeforeDiscount,
    totalLineItemDiscounts.plus(tableLevelDiscount),
  );
  const finalTotal = Decimal.max(0, totalBeforeDiscount.minus(finalTotalDiscount));

  // 6. Check CPQ Approval Thresholds
  const approvalReasons: string[] = [];
  let requiresApproval = false;
  const thresholds = context.approvalThresholds;

  if (thresholds) {
    // Condition A: Total deal value > threshold requires manager approval
    if (thresholds.dealValueGt !== undefined && thresholds.dealValueGt !== null) {
      const dealThreshold = new Decimal(thresholds.dealValueGt);
      if (finalTotal.greaterThan(dealThreshold)) {
        requiresApproval = true;
        approvalReasons.push(
          `Deal value $${finalTotal.toFixed(2)} exceeds manager approval threshold of $${dealThreshold.toFixed(2)}`,
        );
      }
    }

    // Condition B: Discount percentage > Y% requires finance approval
    if (thresholds.discountPctGt !== undefined && thresholds.discountPctGt !== null) {
      const maxDiscountPct = new Decimal(thresholds.discountPctGt);
      const effectivePct = totalBeforeDiscount.isZero()
        ? new Decimal(0)
        : finalTotalDiscount
            .div(totalBeforeDiscount)
            .mul(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (effectivePct.greaterThan(maxDiscountPct)) {
        requiresApproval = true;
        approvalReasons.push(
          `Total discount of ${effectivePct.toFixed(2)}% exceeds finance approval threshold of ${maxDiscountPct.toFixed(2)}%`,
        );
      }
    }

    // Condition C: Bundle/quote contains restricted product requiring legal approval
    if (
      thresholds.restrictedProductIds &&
      Array.isArray(thresholds.restrictedProductIds) &&
      thresholds.restrictedProductIds.length > 0
    ) {
      const restrictedSet = new Set(thresholds.restrictedProductIds);
      const matchedRestricted = lineItemMap.filter(
        (item) => item.productItemId && restrictedSet.has(item.productItemId),
      );

      if (matchedRestricted.length > 0) {
        requiresApproval = true;
        const names = matchedRestricted.map((m) => m.name).join(', ');
        approvalReasons.push(
          `Quote contains restricted product(s) requiring legal approval: ${names}`,
        );
      }
    }
  }

  // 7. Format output
  const finalLineItems: CalculatedLineItemTotal[] = lineItemMap.map((item) => {
    const lineDiscount = item.discountAmount;
    const lineNet = item.net;
    const effPct = item.baseSubtotal.isZero()
      ? new Decimal(0)
      : lineDiscount.div(item.baseSubtotal).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toFixed(2),
      discountPercent: effPct.toFixed(2),
      discountAmount: lineDiscount.toFixed(2),
      subtotal: item.baseSubtotal.toFixed(2),
      discount: lineDiscount.toFixed(2),
      net: lineNet.toFixed(2),
      lineDiscount: lineDiscount.toFixed(2),
      lineNet: lineNet.toFixed(2),
      isOptional: item.isOptional,
      isSelected: item.isSelected,
      billingFrequency: item.billingFrequency,
      sortOrder: item.sortOrder,
    };
  });

  return {
    appliedRules,
    finalLineItems,
    totalBeforeDiscount: totalBeforeDiscount.toFixed(2),
    totalAfterDiscount: finalTotal.toFixed(2),
    discountAmount: finalTotalDiscount.toFixed(2),
    requiresApproval,
    approvalReasons,
  };
}
