import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CpqRepository } from './cpq.repository';
import { CpqPlaybookService, PlaybookExecutionResult } from './cpq-playbook.service';
import { evaluateCpqRules } from './cpq-rules.engine';
import {
  CreatePricingTableDto,
  UpdatePricingTableDto,
  CreateLineItemDto,
  UpdateLineItemDto,
  UpdateBuyerSelectionsDto,
  ReorderLineItemsDto,
  PricingTableResponseDto,
  PricingTotalsResponse,
  CalculatedLineItemTotal,
  CreateBundleDto,
  UpdateBundleDto,
  CreateBundleItemDto,
  UpdateBundleItemDto,
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  CreatePlaybookDto,
  UpdatePlaybookDto,
  ExecutePlaybookDto,
  EvaluateCpqDto,
  CpqEvaluationResultDto,
} from '@pactintel/shared-types';

export interface PricingInputLineItem {
  id: string;
  name: string;
  quantity: number | string | Decimal;
  unitPrice: number | string | Decimal;
  discountPercent?: number | string | Decimal | null;
  discountAmount?: number | string | Decimal | null;
  billingFrequency?: string | null;
  isOptional?: boolean;
  isSelected?: boolean;
  sortOrder?: number;
}

export interface PricingInputTable {
  discountRules?: {
    type: 'percentage' | 'fixed';
    value: number;
    condition?: string;
    label?: string;
  }[];
  taxConfig?: { taxRate?: number; taxLabel?: string; taxIncluded?: boolean };
  settings?: {
    currency?: string;
    showDiscount?: boolean;
    showTax?: boolean;
    allowBuyerQuantityChange?: boolean;
  };
}

export interface BuyerSelectionOverride {
  lineItemId: string;
  isSelected: boolean;
  quantity?: number;
}

@Injectable()
export class CpqService {
  constructor(
    private readonly cpqRepo: CpqRepository,
    @Optional() private readonly playbookService?: CpqPlaybookService,
  ) {}

  /**
   * EXACT CALCULATION ALGORITHM (RULE CPQ-001 — Decimal.js only, no floating point)
   * 1. Merge buyerSelections into lineItems (override isSelected and optionally quantity)
   * 2. Filter to isSelected === true
   * 3. Per item:
   *    lineSubtotal = new Decimal(qty).mul(unitPrice).toDecimalPlaces(2)
   *    lineDiscount = 0; if discountPercent > 0: lineDiscount = lineSubtotal.mul(discountPercent/100).toDecimalPlaces(2)
   *    if discountAmount > 0: lineDiscount = Decimal.max(lineDiscount, discountAmount)
   *    lineNet = lineSubtotal.minus(lineDiscount)
   * 4. subtotal = sum(lineNet)
   * 5. Apply table-level discountRules -> tableDiscount
   * 6. discountedSubtotal = subtotal - tableDiscount
   * 7. Tax: if taxIncluded: taxAmount = discountedSubtotal * taxRate / (1 + taxRate); total = discountedSubtotal
   *    else: taxAmount = discountedSubtotal * taxRate; total = discountedSubtotal + taxAmount
   * 8. Return { subtotal, totalDiscount, taxAmount, total, lineItems }
   */
  public calculatePricingTotals(
    table: PricingInputTable,
    items: PricingInputLineItem[],
    buyerSelections?: BuyerSelectionOverride[],
  ): PricingTotalsResponse {
    // 1. Merge buyer selections
    const selectionMap = new Map<string, BuyerSelectionOverride>();
    if (buyerSelections) {
      buyerSelections.forEach((s) => selectionMap.set(s.lineItemId, s));
    }

    const mergedItems = items.map((item) => {
      const override = selectionMap.get(item.id);
      const isSelected = override ? override.isSelected : (item.isSelected ?? true);
      const quantity = override?.quantity !== undefined ? override.quantity : item.quantity;
      return {
        ...item,
        isSelected,
        quantity,
      };
    });

    // 2. Filter to isSelected === true
    const activeItems = mergedItems.filter((i) => i.isSelected);

    // 3. Per item calculation
    let itemDiscountsSum = new Decimal(0);
    const calculatedLineItems: CalculatedLineItemTotal[] = [];
    let netSum = new Decimal(0);

    for (const item of activeItems) {
      const qty = new Decimal(item.quantity.toString());
      const unitPrice = new Decimal(item.unitPrice.toString());
      const lineSubtotal = qty.mul(unitPrice).toDecimalPlaces(2);

      let lineDiscount = new Decimal(0);
      const discPct = new Decimal((item.discountPercent ?? 0).toString());
      if (discPct.greaterThan(0)) {
        lineDiscount = lineSubtotal.mul(discPct.div(100)).toDecimalPlaces(2);
      }

      const discAmt = new Decimal((item.discountAmount ?? 0).toString());
      if (discAmt.greaterThan(0)) {
        lineDiscount = Decimal.max(lineDiscount, discAmt).toDecimalPlaces(2);
      }

      const lineNet = lineSubtotal.minus(lineDiscount);
      itemDiscountsSum = itemDiscountsSum.plus(lineDiscount);
      netSum = netSum.plus(lineNet);

      calculatedLineItems.push({
        id: item.id,
        name: item.name,
        quantity: qty.toString(),
        unitPrice: unitPrice.toFixed(2),
        discountPercent: discPct.toString(),
        discountAmount: discAmt.toFixed(2),
        subtotal: lineSubtotal.toFixed(2),
        discount: lineDiscount.toFixed(2),
        net: lineNet.toFixed(2),
        isOptional: item.isOptional ?? false,
        isSelected: item.isSelected ?? true,
        billingFrequency: item.billingFrequency ?? 'one_time',
        sortOrder: item.sortOrder ?? 0,
      });
    }

    // 4. subtotal = sum(lineNet)
    const subtotal = netSum;

    // 5. Apply table-level discountRules -> tableDiscount
    let tableDiscount = new Decimal(0);
    if (table.discountRules && Array.isArray(table.discountRules)) {
      for (const rule of table.discountRules) {
        if (rule.type === 'percentage') {
          const ruleDisc = subtotal.mul(new Decimal(rule.value).div(100)).toDecimalPlaces(2);
          tableDiscount = tableDiscount.plus(ruleDisc);
        } else if (rule.type === 'fixed') {
          const ruleDisc = Decimal.min(new Decimal(rule.value), subtotal).toDecimalPlaces(2);
          tableDiscount = tableDiscount.plus(ruleDisc);
        }
      }
    }

    // 6. discountedSubtotal = subtotal - tableDiscount
    const discountedSubtotal = Decimal.max(0, subtotal.minus(tableDiscount));
    const totalDiscount = itemDiscountsSum.plus(tableDiscount);

    // 7. Tax calculation
    const taxRate = new Decimal((table.taxConfig?.taxRate ?? 0).toString());
    const taxIncluded = table.taxConfig?.taxIncluded ?? false;

    let taxAmount = new Decimal(0);
    let total = new Decimal(0);

    if (taxRate.greaterThan(0)) {
      if (taxIncluded) {
        // taxIncluded: taxAmount = discountedSubtotal * taxRate / (1 + taxRate); total = discountedSubtotal
        taxAmount = discountedSubtotal
          .mul(taxRate)
          .div(new Decimal(1).plus(taxRate))
          .toDecimalPlaces(2);
        total = discountedSubtotal;
      } else {
        // tax not included: taxAmount = discountedSubtotal * taxRate; total = discountedSubtotal + taxAmount
        taxAmount = discountedSubtotal.mul(taxRate).toDecimalPlaces(2);
        total = discountedSubtotal.plus(taxAmount);
      }
    } else {
      total = discountedSubtotal;
    }

    const currency = table.settings?.currency || 'USD';

    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
      currency,
      lineItems: calculatedLineItems,
    };
  }

  // --- Pricing Table Endpoints Logic ---

  async createPricingTable(
    orgId: string,
    dto: CreatePricingTableDto,
  ): Promise<PricingTableResponseDto> {
    const table = await this.cpqRepo.createPricingTable(orgId, dto);
    const totals = this.calculatePricingTotals(table as any, table.lineItems);

    return {
      id: table.id,
      documentId: table.documentId,
      organizationId: table.organizationId,
      displayFormat: table.displayFormat,
      discountRules: table.discountRules as any,
      taxConfig: table.taxConfig as any,
      settings: table.settings as any,
      totals,
      lineItems: table.lineItems,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  async getPricingTablesByDocument(
    documentId: string,
    orgId?: string,
  ): Promise<PricingTableResponseDto[]> {
    const tables = await this.cpqRepo.findPricingTablesByDocumentId(documentId, orgId);
    return tables.map((t) => {
      const totals = this.calculatePricingTotals(t as any, t.lineItems);
      return {
        id: t.id,
        documentId: t.documentId,
        organizationId: t.organizationId,
        displayFormat: t.displayFormat,
        discountRules: t.discountRules as any,
        taxConfig: t.taxConfig as any,
        settings: t.settings as any,
        totals,
        lineItems: t.lineItems,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });
  }

  async getPricingTableById(id: string, orgId?: string): Promise<PricingTableResponseDto> {
    const table = await this.cpqRepo.findPricingTableById(id, orgId);
    if (!table) {
      throw new NotFoundException(`Pricing table ${id} not found.`);
    }

    const totals = this.calculatePricingTotals(table as any, table.lineItems);
    return {
      id: table.id,
      documentId: table.documentId,
      organizationId: table.organizationId,
      displayFormat: table.displayFormat,
      discountRules: table.discountRules as any,
      taxConfig: table.taxConfig as any,
      settings: table.settings as any,
      totals,
      lineItems: table.lineItems,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  async updatePricingTable(
    id: string,
    orgId: string,
    dto: UpdatePricingTableDto,
  ): Promise<PricingTableResponseDto> {
    const existing = await this.cpqRepo.findPricingTableById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Pricing table ${id} not found.`);
    }

    const updated = await this.cpqRepo.updatePricingTable(id, orgId, dto);
    const totals = this.calculatePricingTotals(updated as any, updated.lineItems);

    return {
      id: updated.id,
      documentId: updated.documentId,
      organizationId: updated.organizationId,
      displayFormat: updated.displayFormat,
      discountRules: updated.discountRules as any,
      taxConfig: updated.taxConfig as any,
      settings: updated.settings as any,
      totals,
      lineItems: updated.lineItems,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deletePricingTable(id: string, orgId: string): Promise<void> {
    const existing = await this.cpqRepo.findPricingTableById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Pricing table ${id} not found.`);
    }
    await this.cpqRepo.deletePricingTable(id, orgId);
  }

  // --- Line Items Logic ---

  async addLineItem(orgId: string, dto: CreateLineItemDto) {
    const table = await this.cpqRepo.findPricingTableById(dto.pricingTableId, orgId);
    if (!table) {
      throw new NotFoundException(`Pricing table ${dto.pricingTableId} not found.`);
    }
    return this.cpqRepo.createLineItem(orgId, dto);
  }

  async getLineItems(pricingTableId: string, orgId?: string) {
    return this.cpqRepo.findLineItemsByTableId(pricingTableId, orgId);
  }

  async updateLineItem(id: string, orgId: string, dto: UpdateLineItemDto) {
    const existing = await this.cpqRepo.findLineItemById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Line item ${id} not found.`);
    }
    return this.cpqRepo.updateLineItem(id, orgId, dto);
  }

  async deleteLineItem(id: string, orgId: string) {
    const existing = await this.cpqRepo.findLineItemById(id, orgId);
    if (!existing) {
      throw new NotFoundException(`Line item ${id} not found.`);
    }
    return this.cpqRepo.deleteLineItem(id, orgId);
  }

  async reorderLineItems(pricingTableId: string, orgId: string, dto: ReorderLineItemsDto) {
    const table = await this.cpqRepo.findPricingTableById(pricingTableId, orgId);
    if (!table) {
      throw new NotFoundException(`Pricing table ${pricingTableId} not found.`);
    }
    await this.cpqRepo.reorderLineItems(pricingTableId, orgId, dto.order);
    return { success: true };
  }

  // --- Buyer Selections & Public Recipient Totals (RULE CPQ-001) ---

  async updateBuyerSelections(
    documentId: string,
    pricingTableId: string,
    dto: UpdateBuyerSelectionsDto,
  ): Promise<PricingTotalsResponse> {
    const table = await this.cpqRepo.findPricingTableById(pricingTableId);
    if (!table || table.documentId !== documentId) {
      throw new NotFoundException(
        `Pricing table ${pricingTableId} not found for document ${documentId}.`,
      );
    }

    // Calculate totals with buyer overrides
    const totals = this.calculatePricingTotals(table as any, table.lineItems, dto.selections);

    // RULE CPQ-001: NEVER UPDATE line_items table!
    // Store in buyer_pricing_selections
    await this.cpqRepo.upsertBuyerSelection({
      organizationId: table.organizationId,
      documentId,
      pricingTableId,
      viewerSessionId: dto.viewerSessionId || 'anonymous-session',
      selections: dto.selections,
      calculatedTotal: totals.total,
    });

    // Update document total_value
    await this.cpqRepo.updateDocumentTotalValue(documentId, totals.total);

    return totals;
  }

  async getTableTotals(
    documentId: string,
    pricingTableId: string,
    viewerSessionId?: string,
  ): Promise<PricingTotalsResponse> {
    const table = await this.cpqRepo.findPricingTableById(pricingTableId);
    if (!table || table.documentId !== documentId) {
      throw new NotFoundException(
        `Pricing table ${pricingTableId} not found for document ${documentId}.`,
      );
    }

    let overrides: BuyerSelectionOverride[] | undefined;
    if (viewerSessionId) {
      const savedSelection = await this.cpqRepo.findBuyerSelection(pricingTableId, viewerSessionId);
      if (savedSelection && Array.isArray(savedSelection.selections)) {
        overrides = savedSelection.selections as unknown as BuyerSelectionOverride[];
      }
    }

    return this.calculatePricingTotals(table as any, table.lineItems, overrides);
  }

  // ===========================================================================
  // Product Bundles (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createBundle(organizationId: string, dto: CreateBundleDto) {
    return this.cpqRepo.createBundle(organizationId, dto);
  }

  async listBundles(
    organizationId: string,
    options: { workspaceId?: string; search?: string; cursor?: string; limit?: number },
  ) {
    return this.cpqRepo.findBundles(organizationId, options);
  }

  async getBundle(id: string, organizationId: string) {
    const bundle = await this.cpqRepo.findBundleById(id, organizationId);
    if (!bundle) {
      throw new NotFoundException(`Bundle ${id} not found in organization`);
    }
    return bundle;
  }

  async updateBundle(id: string, organizationId: string, dto: UpdateBundleDto) {
    return this.cpqRepo.updateBundle(id, organizationId, dto);
  }

  async deleteBundle(id: string, organizationId: string) {
    await this.cpqRepo.softDeleteBundle(id, organizationId);
    return { success: true };
  }

  async addBundleItem(bundleId: string, organizationId: string, dto: CreateBundleItemDto) {
    return this.cpqRepo.addBundleItem(bundleId, organizationId, dto);
  }

  async updateBundleItem(
    bundleId: string,
    itemId: string,
    organizationId: string,
    dto: UpdateBundleItemDto,
  ) {
    return this.cpqRepo.updateBundleItem(bundleId, itemId, organizationId, dto);
  }

  async deleteBundleItem(bundleId: string, itemId: string, organizationId: string) {
    await this.cpqRepo.deleteBundleItem(bundleId, itemId, organizationId);
    return { success: true };
  }

  // ===========================================================================
  // Pricing Rules (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createPricingRule(organizationId: string, dto: CreatePricingRuleDto) {
    return this.cpqRepo.createPricingRule(organizationId, dto);
  }

  async listPricingRules(
    organizationId: string,
    options: { workspaceId?: string; isActive?: boolean; ruleType?: string },
  ) {
    return this.cpqRepo.findPricingRules(organizationId, options);
  }

  async getPricingRule(id: string, organizationId: string) {
    const rule = await this.cpqRepo.findPricingRuleById(id, organizationId);
    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} not found`);
    }
    return rule;
  }

  async updatePricingRule(id: string, organizationId: string, dto: UpdatePricingRuleDto) {
    return this.cpqRepo.updatePricingRule(id, organizationId, dto);
  }

  async deletePricingRule(id: string, organizationId: string) {
    await this.cpqRepo.softDeletePricingRule(id, organizationId);
    return { success: true };
  }

  async evaluateRules(
    organizationId: string,
    dto: EvaluateCpqDto,
    workspaceId?: string,
  ): Promise<CpqEvaluationResultDto> {
    const activeRules = await this.cpqRepo.findPricingRules(organizationId, {
      workspaceId,
      isActive: true,
    });

    const timestamp = dto.timestamp ? new Date(dto.timestamp) : new Date();

    return evaluateCpqRules(
      {
        lineItems: dto.lineItems as any,
        dealAttributes: dto.dealAttributes as any,
        orgId: organizationId,
        timestamp,
      },
      activeRules as any,
    );
  }

  // ===========================================================================
  // Guided-Selling Playbooks (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createPlaybook(organizationId: string, dto: CreatePlaybookDto) {
    return this.cpqRepo.createPlaybook(organizationId, dto);
  }

  async listPlaybooks(
    organizationId: string,
    options: { workspaceId?: string; isActive?: boolean },
  ) {
    return this.cpqRepo.findPlaybooks(organizationId, options);
  }

  async getPlaybook(id: string, organizationId: string) {
    const playbook = await this.cpqRepo.findPlaybookById(id, organizationId);
    if (!playbook) {
      throw new NotFoundException(`Playbook ${id} not found`);
    }
    return playbook;
  }

  async updatePlaybook(id: string, organizationId: string, dto: UpdatePlaybookDto) {
    return this.cpqRepo.updatePlaybook(id, organizationId, dto);
  }

  async deletePlaybook(id: string, organizationId: string) {
    await this.cpqRepo.softDeletePlaybook(id, organizationId);
    return { success: true };
  }

  async executePlaybook(
    organizationId: string,
    playbookId: string,
    dto: ExecutePlaybookDto,
  ): Promise<PlaybookExecutionResult> {
    if (!this.playbookService) {
      throw new Error('Playbook service not configured');
    }
    return this.playbookService.executePlaybook(organizationId, playbookId, dto);
  }

  // ===========================================================================
  // Native CRM-Embedded CPQ (Phase 3 Sprint 3.1)
  // ===========================================================================

  async getCrmEmbedData(
    organizationId: string,
    workspaceId?: string,
    dealAttributes: Record<string, any> = {},
  ) {
    const bundlesPage = await this.cpqRepo.findBundles(organizationId, {
      workspaceId,
      limit: 50,
    });
    const rules = await this.cpqRepo.findPricingRules(organizationId, {
      workspaceId,
      isActive: true,
    });

    return {
      organizationId,
      workspaceId,
      dealAttributes,
      availableBundles: bundlesPage.items.filter((b) => b.isActive),
      activeRulesCount: rules.length,
      embeddedSyncProtocol: 'postMessage',
      supportedCrmTypes: ['hubspot', 'salesforce'],
    };
  }
}
