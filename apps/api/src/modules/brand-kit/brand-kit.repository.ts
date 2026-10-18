import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, BrandKit } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import { CreateBrandKitDto } from './dto/create-brand-kit.dto';
import { UpdateBrandKitDto } from './dto/update-brand-kit.dto';

@Injectable()
export class BrandKitRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async create(orgId: string, dto: CreateBrandKitDto): Promise<BrandKit> {
    const id = generateId();

    if (dto.isDefault) {
      return this.prisma.$transaction(async (tx) => {
        // Unset any existing default in same transaction
        await tx.brandKit.updateMany({
          where: { organizationId: orgId, isDefault: true },
          data: { isDefault: false },
        });

        return tx.brandKit.create({
          data: {
            id,
            organizationId: orgId,
            name: dto.name,
            primaryColor: dto.primaryColor,
            secondaryColor: dto.secondaryColor || null,
            accentColor: dto.accentColor || null,
            logoUrl: dto.logoUrl || null,
            faviconUrl: dto.faviconUrl || null,
            fontHeading: dto.fontHeading || null,
            fontBody: dto.fontBody || null,
            customCss: dto.customCss || null,
            emailFromName: dto.emailFromName || null,
            emailFromDomain: dto.emailFromDomain || null,
            removeBadge: dto.removeBadge ?? false,
            isDefault: true,
          },
        });
      });
    }

    return this.prisma.brandKit.create({
      data: {
        id,
        organizationId: orgId,
        name: dto.name,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor || null,
        accentColor: dto.accentColor || null,
        logoUrl: dto.logoUrl || null,
        faviconUrl: dto.faviconUrl || null,
        fontHeading: dto.fontHeading || null,
        fontBody: dto.fontBody || null,
        customCss: dto.customCss || null,
        emailFromName: dto.emailFromName || null,
        emailFromDomain: dto.emailFromDomain || null,
        removeBadge: dto.removeBadge ?? false,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async findAll(orgId: string): Promise<BrandKit[]> {
    return this.prisma.brandKit.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string, orgId?: string): Promise<BrandKit | null> {
    const where: any = { id, deletedAt: null };
    if (orgId) {
      where.organizationId = orgId;
    }
    return this.prisma.brandKit.findFirst({ where });
  }

  async findDefault(orgId: string): Promise<BrandKit | null> {
    return this.prisma.brandKit.findFirst({
      where: { organizationId: orgId, isDefault: true, deletedAt: null },
    });
  }

  async update(id: string, orgId: string, dto: UpdateBrandKitDto): Promise<BrandKit> {
    const existing = await this.prisma.brandKit.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Brand kit ${id} not found`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.primaryColor !== undefined) data.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined) data.secondaryColor = dto.secondaryColor;
    if (dto.accentColor !== undefined) data.accentColor = dto.accentColor;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.faviconUrl !== undefined) data.faviconUrl = dto.faviconUrl;
    if (dto.fontHeading !== undefined) data.fontHeading = dto.fontHeading;
    if (dto.fontBody !== undefined) data.fontBody = dto.fontBody;
    if (dto.customCss !== undefined) data.customCss = dto.customCss;
    if (dto.emailFromName !== undefined) data.emailFromName = dto.emailFromName;
    if (dto.emailFromDomain !== undefined) data.emailFromDomain = dto.emailFromDomain;
    if (dto.removeBadge !== undefined) data.removeBadge = dto.removeBadge;

    if (dto.isDefault === true) {
      return this.prisma.$transaction(async (tx) => {
        await tx.brandKit.updateMany({
          where: { organizationId: orgId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
        return tx.brandKit.update({
          where: { id },
          data: { ...data, isDefault: true },
        });
      });
    } else if (dto.isDefault === false) {
      data.isDefault = false;
    }

    return this.prisma.brandKit.update({
      where: { id },
      data,
    });
  }

  async setDefault(id: string, orgId: string): Promise<BrandKit> {
    const existing = await this.prisma.brandKit.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Brand kit ${id} not found`);
    }

    // Unsets old default in same $transaction
    return this.prisma.$transaction(async (tx) => {
      await tx.brandKit.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.brandKit.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  async updateLogoUrl(id: string, orgId: string, logoUrl: string): Promise<BrandKit> {
    const existing = await this.prisma.brandKit.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Brand kit ${id} not found`);
    }

    return this.prisma.brandKit.update({
      where: { id },
      data: { logoUrl },
    });
  }

  async delete(id: string, orgId: string): Promise<BrandKit> {
    const existing = await this.prisma.brandKit.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException(`Brand kit ${id} not found`);
    }

    return this.prisma.brandKit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
