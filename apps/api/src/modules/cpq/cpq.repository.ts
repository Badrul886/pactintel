import { Injectable, Optional } from '@nestjs/common';
import {
  PrismaClient,
  PricingTable,
  LineItem,
  BuyerPricingSelection,
  ProductBundle,
  BundleItem,
  PricingRule,
  CpqPlaybook,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, buildCursorPage, decodeCursor } from '@pactintel/shared-utils';
import {
  CreatePricingTableDto,
  UpdatePricingTableDto,
  CreateLineItemDto,
  UpdateLineItemDto,
  CreateBundleDto,
  UpdateBundleDto,
  CreateBundleItemDto,
  UpdateBundleItemDto,
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  CreatePlaybookDto,
  UpdatePlaybookDto,
} from '@pactintel/shared-types';

@Injectable()
export class CpqRepository {
  private prisma: PrismaClient;

  constructor(@Optional() prismaService?: PrismaService) {
    this.prisma = prismaService || new PrismaClient();
  }

  // ===========================================================================
  // 1. Pricing Tables & Line Items (Phase 1 Baseline)
  // ===========================================================================

  async createPricingTable(
    orgId: string,
    dto: CreatePricingTableDto,
  ): Promise<PricingTable & { lineItems: LineItem[] }> {
    const id = generateId();
    return this.prisma.pricingTable.create({
      data: {
        id,
        organizationId: orgId,
        documentId: dto.documentId,
        displayFormat: dto.displayFormat,
        discountRules: dto.discountRules as any,
        taxConfig: dto.taxConfig as any,
        settings: dto.settings as any,
      },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async findPricingTableById(
    id: string,
    orgId?: string,
  ): Promise<(PricingTable & { lineItems: LineItem[] }) | null> {
    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.pricingTable.findFirst({
      where,
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async findPricingTablesByDocumentId(
    documentId: string,
    orgId?: string,
  ): Promise<(PricingTable & { lineItems: LineItem[] })[]> {
    const where: any = { documentId };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.pricingTable.findMany({
      where,
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updatePricingTable(
    id: string,
    orgId: string,
    dto: UpdatePricingTableDto,
  ): Promise<PricingTable & { lineItems: LineItem[] }> {
    const existing = await this.prisma.pricingTable.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Pricing table ${id} not found in organization ${orgId}`);
    }

    const data: any = {};
    if (dto.displayFormat !== undefined) data.displayFormat = dto.displayFormat;
    if (dto.discountRules !== undefined) data.discountRules = dto.discountRules as any;
    if (dto.taxConfig !== undefined) data.taxConfig = dto.taxConfig as any;
    if (dto.settings !== undefined) data.settings = dto.settings as any;

    return this.prisma.pricingTable.update({
      where: { id },
      data,
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async deletePricingTable(id: string, orgId: string): Promise<void> {
    const existing = await this.prisma.pricingTable.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Pricing table ${id} not found in organization ${orgId}`);
    }
    await this.prisma.pricingTable.delete({
      where: { id },
    });
  }

  async createLineItem(orgId: string, dto: CreateLineItemDto): Promise<LineItem> {
    return this.addLineItem(dto.pricingTableId, orgId, dto);
  }

  async findLineItemById(id: string, orgId?: string): Promise<LineItem | null> {
    const where: any = { id };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.lineItem.findFirst({ where });
  }

  async findLineItemsByTableId(pricingTableId: string, orgId?: string): Promise<LineItem[]> {
    const where: any = { pricingTableId };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.lineItem.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addLineItem(
    pricingTableId: string,
    orgId: string,
    dto: CreateLineItemDto,
  ): Promise<LineItem> {
    const table = await this.prisma.pricingTable.findFirst({
      where: { id: pricingTableId, organizationId: orgId },
    });
    if (!table) {
      throw new Error(`Pricing table ${pricingTableId} not found in organization ${orgId}`);
    }

    const id = generateId();
    const qty = Number(dto.quantity);
    const price = Number(dto.unitPrice);
    const subtotal = (qty * price).toFixed(2);

    return this.prisma.lineItem.create({
      data: {
        id,
        organizationId: orgId,
        pricingTableId,
        productItemId: dto.productItemId,
        name: dto.name,
        description: dto.description,
        quantity: qty,
        unitPrice: price,
        discountPercent: dto.discountPercent ? Number(dto.discountPercent) : 0,
        discountAmount: dto.discountAmount ? Number(dto.discountAmount) : 0,
        subtotal: subtotal as any,
        billingFrequency: dto.billingFrequency,
        isOptional: dto.isOptional ?? false,
        isSelected: dto.isSelected ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateLineItem(id: string, orgId: string, dto: UpdateLineItemDto): Promise<LineItem> {
    const existing = await this.prisma.lineItem.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Line item ${id} not found in organization ${orgId}`);
    }

    const qty = dto.quantity !== undefined ? Number(dto.quantity) : Number(existing.quantity);
    const price = dto.unitPrice !== undefined ? Number(dto.unitPrice) : Number(existing.unitPrice);
    const subtotal = (qty * price).toFixed(2);

    const data: any = {
      quantity: qty,
      unitPrice: price,
      subtotal: subtotal as any,
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.productItemId !== undefined) data.productItemId = dto.productItemId;
    if (dto.discountPercent !== undefined)
      data.discountPercent = dto.discountPercent !== null ? Number(dto.discountPercent) : null;
    if (dto.discountAmount !== undefined)
      data.discountAmount = dto.discountAmount !== null ? Number(dto.discountAmount) : null;
    if (dto.billingFrequency !== undefined) data.billingFrequency = dto.billingFrequency;
    if (dto.isOptional !== undefined) data.isOptional = dto.isOptional;
    if (dto.isSelected !== undefined) data.isSelected = dto.isSelected;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.lineItem.update({
      where: { id },
      data,
    });
  }

  async deleteLineItem(id: string, orgId: string): Promise<LineItem> {
    const existing = await this.prisma.lineItem.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Line item ${id} not found in organization ${orgId}`);
    }
    return this.prisma.lineItem.delete({
      where: { id },
    });
  }

  async reorderLineItems(
    pricingTableId: string,
    orgId: string,
    orderedIds: string[],
  ): Promise<void> {
    const table = await this.prisma.pricingTable.findFirst({
      where: { id: pricingTableId, organizationId: orgId },
    });
    if (!table) {
      throw new Error(`Pricing table ${pricingTableId} not found in organization ${orgId}`);
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.lineItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  async upsertBuyerSelection(params: {
    organizationId: string;
    documentId: string;
    pricingTableId: string;
    viewerSessionId: string;
    selections: any;
    calculatedTotal: string;
  }): Promise<BuyerPricingSelection> {
    const existing = await this.prisma.buyerPricingSelection.findFirst({
      where: {
        pricingTableId: params.pricingTableId,
        viewerSessionId: params.viewerSessionId,
      },
    });

    if (existing) {
      return this.prisma.buyerPricingSelection.update({
        where: { id: existing.id },
        data: {
          selections: params.selections,
          calculatedTotal: params.calculatedTotal,
        },
      });
    }

    const id = generateId();
    return this.prisma.buyerPricingSelection.create({
      data: {
        id,
        organizationId: params.organizationId,
        documentId: params.documentId,
        pricingTableId: params.pricingTableId,
        viewerSessionId: params.viewerSessionId,
        selections: params.selections,
        calculatedTotal: params.calculatedTotal,
      },
    });
  }

  async findBuyerSelection(
    pricingTableId: string,
    viewerSessionId: string,
    orgId?: string,
  ): Promise<BuyerPricingSelection | null> {
    const where: any = { pricingTableId, viewerSessionId };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.buyerPricingSelection.findFirst({ where });
  }

  async updateDocumentTotalValue(documentId: string, totalValue: string): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { totalValue },
    });
  }

  // ===========================================================================
  // 2. Product Bundles & Bundle Items (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createBundle(
    orgId: string,
    dto: CreateBundleDto,
    id: string = generateId(),
  ): Promise<ProductBundle & { items: (BundleItem & { productItem: any })[] }> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.productBundle.create({
        data: {
          id,
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          description: dto.description || null,
          bundleType: dto.bundleType,
          fixedPrice:
            dto.fixedPrice !== undefined && dto.fixedPrice !== null ? Number(dto.fixedPrice) : null,
          discountPercent:
            dto.discountPercent !== undefined && dto.discountPercent !== null
              ? Number(dto.discountPercent)
              : null,
          isActive: true,
          version: 1,
        },
      });

      if (dto.items && dto.items.length > 0) {
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i];
          await tx.bundleItem.create({
            data: {
              id: generateId(),
              bundleId: id,
              organizationId: orgId,
              productItemId: it.productItemId,
              isRequired: it.isRequired ?? true,
              sortOrder: it.sortOrder ?? i,
              quantity: Number(it.quantity || 1),
            },
          });
        }
      }

      // Outbox event (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'cpq.bundle.created',
          aggregateType: 'product_bundle',
          aggregateId: id,
          payload: {
            bundleId: id,
            name: bundle.name,
            bundleType: bundle.bundleType,
            version: bundle.version,
            workspaceId: bundle.workspaceId,
          },
        },
      });

      return tx.productBundle.findUniqueOrThrow({
        where: { id },
        include: {
          items: {
            include: { productItem: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  async findBundles(
    orgId: string,
    options: {
      workspaceId?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ) {
    const limit = options.limit || 20;
    const where: any = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (options.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    if (options.search) {
      where.name = { contains: options.search, mode: 'insensitive' };
    }

    let cursorObj = decodeCursor(options.cursor);
    if (cursorObj) {
      where.createdAt = { lt: new Date(cursorObj.createdAt as string) };
    }

    const items = await this.prisma.productBundle.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: { productItem: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return buildCursorPage(items, limit);
  }

  async findBundleById(
    id: string,
    orgId?: string,
  ): Promise<(ProductBundle & { items: (BundleItem & { productItem: any })[] }) | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.productBundle.findFirst({
      where,
      include: {
        items: {
          include: { productItem: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async updateBundle(
    id: string,
    orgId: string,
    dto: UpdateBundleDto,
  ): Promise<ProductBundle & { items: (BundleItem & { productItem: any })[] }> {
    const existing = await this.prisma.productBundle.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Bundle ${id} not found in organization ${orgId}`);
    }

    const data: any = {
      version: existing.version + 1, // Rule: increment version on update
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.bundleType !== undefined) data.bundleType = dto.bundleType;
    if (dto.fixedPrice !== undefined)
      data.fixedPrice = dto.fixedPrice !== null ? Number(dto.fixedPrice) : null;
    if (dto.discountPercent !== undefined)
      data.discountPercent = dto.discountPercent !== null ? Number(dto.discountPercent) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.productBundle.update({
      where: { id },
      data,
      include: {
        items: {
          include: { productItem: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async softDeleteBundle(id: string, orgId: string): Promise<void> {
    const existing = await this.prisma.productBundle.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Bundle ${id} not found in organization ${orgId}`);
    }

    await this.prisma.productBundle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async addBundleItem(
    bundleId: string,
    orgId: string,
    dto: CreateBundleItemDto,
    id: string = generateId(),
  ): Promise<BundleItem> {
    const bundle = await this.prisma.productBundle.findFirst({
      where: { id: bundleId, organizationId: orgId, deletedAt: null },
    });
    if (!bundle) {
      throw new Error(`Bundle ${bundleId} not found in organization ${orgId}`);
    }

    return this.prisma.bundleItem.create({
      data: {
        id,
        bundleId,
        organizationId: orgId,
        productItemId: dto.productItemId,
        isRequired: dto.isRequired ?? true,
        sortOrder: dto.sortOrder ?? 0,
        quantity: Number(dto.quantity || 1),
      },
    });
  }

  async updateBundleItem(
    bundleId: string,
    itemId: string,
    orgId: string,
    dto: UpdateBundleItemDto,
  ): Promise<BundleItem> {
    const existing = await this.prisma.bundleItem.findFirst({
      where: { id: itemId, bundleId, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Bundle item ${itemId} not found`);
    }

    const data: any = {};
    if (dto.isRequired !== undefined) data.isRequired = dto.isRequired;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.quantity !== undefined) data.quantity = Number(dto.quantity);

    return this.prisma.bundleItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteBundleItem(bundleId: string, itemId: string, orgId: string): Promise<void> {
    const existing = await this.prisma.bundleItem.findFirst({
      where: { id: itemId, bundleId, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Bundle item ${itemId} not found`);
    }

    await this.prisma.bundleItem.delete({
      where: { id: itemId },
    });
  }

  // ===========================================================================
  // 3. Pricing Rules (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createPricingRule(
    orgId: string,
    dto: CreatePricingRuleDto,
    id: string = generateId(),
  ): Promise<PricingRule> {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.pricingRule.create({
        data: {
          id,
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          ruleType: dto.ruleType,
          conditions: (dto.conditions || {}) as any,
          actions: (dto.actions || {}) as any,
          priority: dto.priority ?? 0,
          stackingMode: dto.stackingMode ?? 'highest_wins',
          isActive: true,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        },
      });

      // Outbox event (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'cpq.rule.activated',
          aggregateType: 'pricing_rule',
          aggregateId: id,
          payload: {
            ruleId: id,
            name: rule.name,
            ruleType: rule.ruleType,
            workspaceId: rule.workspaceId,
          },
        },
      });

      return rule;
    });
  }

  async findPricingRules(
    orgId: string,
    options: {
      workspaceId?: string;
      isActive?: boolean;
      ruleType?: string;
    } = {},
  ): Promise<PricingRule[]> {
    const where: any = {
      organizationId: orgId,
      deletedAt: null,
    };
    if (options.workspaceId) where.workspaceId = options.workspaceId;
    if (options.isActive !== undefined) where.isActive = options.isActive;
    if (options.ruleType) where.ruleType = options.ruleType;

    return this.prisma.pricingRule.findMany({
      where,
      orderBy: { priority: 'asc' },
    });
  }

  async findPricingRuleById(id: string, orgId?: string): Promise<PricingRule | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) where.organizationId = orgId;
    return this.prisma.pricingRule.findFirst({ where });
  }

  async updatePricingRule(
    id: string,
    orgId: string,
    dto: UpdatePricingRuleDto,
  ): Promise<PricingRule> {
    const existing = await this.prisma.pricingRule.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Pricing rule ${id} not found in organization ${orgId}`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.ruleType !== undefined) data.ruleType = dto.ruleType;
    if (dto.conditions !== undefined) data.conditions = dto.conditions as any;
    if (dto.actions !== undefined) data.actions = dto.actions as any;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.stackingMode !== undefined) data.stackingMode = dto.stackingMode;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.validFrom !== undefined)
      data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined)
      data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    return this.prisma.pricingRule.update({
      where: { id },
      data,
    });
  }

  async softDeletePricingRule(id: string, orgId: string): Promise<void> {
    const existing = await this.prisma.pricingRule.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Pricing rule ${id} not found in organization ${orgId}`);
    }

    await this.prisma.pricingRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ===========================================================================
  // 4. Guided-Selling Playbooks (Phase 3 Sprint 3.1)
  // ===========================================================================

  async createPlaybook(
    orgId: string,
    dto: CreatePlaybookDto,
    id: string = generateId(),
  ): Promise<CpqPlaybook> {
    return this.prisma.cpqPlaybook.create({
      data: {
        id,
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description || null,
        steps: (dto.steps || []) as any,
        isActive: true,
      },
    });
  }

  async findPlaybooks(
    orgId: string,
    options: {
      workspaceId?: string;
      isActive?: boolean;
    } = {},
  ): Promise<CpqPlaybook[]> {
    const where: any = {
      organizationId: orgId,
      deletedAt: null,
    };
    if (options.workspaceId) where.workspaceId = options.workspaceId;
    if (options.isActive !== undefined) where.isActive = options.isActive;

    return this.prisma.cpqPlaybook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPlaybookById(id: string, orgId?: string): Promise<CpqPlaybook | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) where.organizationId = orgId;
    return this.prisma.cpqPlaybook.findFirst({ where });
  }

  async updatePlaybook(id: string, orgId: string, dto: UpdatePlaybookDto): Promise<CpqPlaybook> {
    const existing = await this.prisma.cpqPlaybook.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Playbook ${id} not found in organization ${orgId}`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.steps !== undefined) data.steps = dto.steps as any;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.cpqPlaybook.update({
      where: { id },
      data,
    });
  }

  async softDeletePlaybook(id: string, orgId: string): Promise<void> {
    const existing = await this.prisma.cpqPlaybook.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Playbook ${id} not found in organization ${orgId}`);
    }

    await this.prisma.cpqPlaybook.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
