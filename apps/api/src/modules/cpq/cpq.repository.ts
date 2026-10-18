import { Injectable } from '@nestjs/common';
import { PrismaClient, PricingTable, LineItem, BuyerPricingSelection } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import {
  CreatePricingTableDto,
  UpdatePricingTableDto,
  CreateLineItemDto,
  UpdateLineItemDto,
} from '@pactintel/shared-types';

@Injectable()
export class CpqRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // --- Pricing Table Operations ---

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

  async deletePricingTable(id: string, orgId: string): Promise<PricingTable> {
    const existing = await this.prisma.pricingTable.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Pricing table ${id} not found in organization ${orgId}`);
    }
    return this.prisma.pricingTable.delete({
      where: { id },
    });
  }

  // --- Line Item Operations ---

  async createLineItem(orgId: string, dto: CreateLineItemDto): Promise<LineItem> {
    const id = generateId();
    // Default subtotal = qty * unitPrice - discount
    const subtotal = Number(dto.quantity) * Number(dto.unitPrice);

    return this.prisma.lineItem.create({
      data: {
        id,
        organizationId: orgId,
        pricingTableId: dto.pricingTableId,
        productItemId: dto.productItemId || null,
        name: dto.name,
        description: dto.description || null,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        discountPercent: dto.discountPercent ?? 0,
        discountAmount: dto.discountAmount ?? 0,
        subtotal,
        billingFrequency: dto.billingFrequency,
        isOptional: dto.isOptional,
        isSelected: dto.isSelected,
        sortOrder: dto.sortOrder,
      },
    });
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

  async updateLineItem(id: string, orgId: string, dto: UpdateLineItemDto): Promise<LineItem> {
    const existing = await this.prisma.lineItem.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) {
      throw new Error(`Line item ${id} not found in organization ${orgId}`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.productItemId !== undefined) data.productItemId = dto.productItemId;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.unitPrice !== undefined) data.unitPrice = dto.unitPrice;
    if (dto.discountPercent !== undefined) data.discountPercent = dto.discountPercent;
    if (dto.discountAmount !== undefined) data.discountAmount = dto.discountAmount;
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

  // --- Buyer Pricing Selections (RULE CPQ-001) ---

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
}
