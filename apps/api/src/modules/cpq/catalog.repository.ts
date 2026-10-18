import { Injectable } from '@nestjs/common';
import { PrismaClient, ProductCatalogItem } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from '@pactintel/shared-types';

@Injectable()
export class CatalogRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async create(orgId: string, dto: CreateCatalogItemDto): Promise<ProductCatalogItem> {
    const id = generateId();
    return this.prisma.productCatalogItem.create({
      data: {
        id,
        organizationId: orgId,
        sku: dto.sku || null,
        name: dto.name,
        description: dto.description || null,
        unitPrice: dto.unitPrice,
        currency: dto.currency,
        billingFrequency: dto.billingFrequency,
        isActive: dto.isActive,
        metadata: dto.metadata as any,
      },
    });
  }

  async findById(id: string, orgId?: string): Promise<ProductCatalogItem | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.productCatalogItem.findFirst({ where });
  }

  async findAll(
    orgId: string,
    filter?: { isActive?: boolean; search?: string },
  ): Promise<ProductCatalogItem[]> {
    const where: any = { organizationId: orgId, deletedAt: null };
    if (filter?.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { sku: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.productCatalogItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, orgId: string, dto: UpdateCatalogItemDto): Promise<ProductCatalogItem> {
    const existing = await this.prisma.productCatalogItem.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Product catalog item ${id} not found in organization ${orgId}`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.unitPrice !== undefined) data.unitPrice = dto.unitPrice;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.billingFrequency !== undefined) data.billingFrequency = dto.billingFrequency;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.metadata !== undefined) data.metadata = dto.metadata as any;

    return this.prisma.productCatalogItem.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, orgId: string): Promise<ProductCatalogItem> {
    const existing = await this.prisma.productCatalogItem.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Product catalog item ${id} not found in organization ${orgId}`);
    }
    return this.prisma.productCatalogItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
