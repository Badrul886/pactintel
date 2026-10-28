import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. OBLIGATIONS REPOSITORY
  // ═══════════════════════════════════════════════════════════════════════

  async createObligation(data: {
    organizationId: string;
    documentId: string;
    documentVersionId: string;
    fieldName: string;
    fieldValue?: string | null;
    fieldValueNumeric?: number | Prisma.Decimal | null;
    fieldValueDate?: Date | null;
    fieldType?: string;
    confidenceScore?: number | Prisma.Decimal | null;
    extractionMethod?: string;
    isCustomField?: boolean;
    isVerified?: boolean;
    pendingUpdate?: Prisma.InputJsonValue | null;
  }) {
    const id = generateId();
    return this.prisma.obligationRecord.create({
      data: {
        id,
        organizationId: data.organizationId,
        documentId: data.documentId,
        documentVersionId: data.documentVersionId,
        fieldName: data.fieldName,
        fieldValue: data.fieldValue ?? null,
        fieldValueNumeric: data.fieldValueNumeric ?? null,
        fieldValueDate: data.fieldValueDate ?? null,
        fieldType: data.fieldType || 'text',
        confidenceScore: data.confidenceScore ?? null,
        extractionMethod: data.extractionMethod || 'ai_llm',
        isCustomField: data.isCustomField || false,
        isVerified: data.isVerified || false,
        pendingUpdate: data.pendingUpdate ?? undefined,
      },
    });
  }

  async findObligationById(id: string, organizationId: string) {
    return this.prisma.obligationRecord.findFirst({
      where: { id, organizationId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            status: true,
            counterparty: true,
            ownerId: true,
          },
        },
      },
    });
  }

  async findObligationsByDocument(documentId: string, organizationId: string) {
    return this.prisma.obligationRecord.findMany({
      where: { documentId, organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findObligations(
    organizationId: string,
    filters?: {
      documentId?: string;
      isVerified?: boolean;
      hasPendingUpdate?: boolean;
      fieldName?: string;
      dueBefore?: Date;
      dueAfter?: Date;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.ObligationRecordWhereInput = {
      organizationId,
      ...(filters?.documentId && { documentId: filters.documentId }),
      ...(filters?.isVerified !== undefined && { isVerified: filters.isVerified }),
      ...(filters?.fieldName && {
        fieldName: { contains: filters.fieldName, mode: 'insensitive' },
      }),
      ...(filters?.dueBefore && { fieldValueDate: { lte: filters.dueBefore } }),
      ...(filters?.dueAfter && { fieldValueDate: { gte: filters.dueAfter } }),
    };

    if (filters?.hasPendingUpdate !== undefined) {
      where.pendingUpdate = filters.hasPendingUpdate
        ? { not: Prisma.DbNull }
        : { equals: Prisma.DbNull };
    }

    const [items, total] = await Promise.all([
      this.prisma.obligationRecord.findMany({
        where,
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              status: true,
              counterparty: true,
              ownerId: true,
            },
          },
        },
        orderBy: [{ fieldValueDate: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.obligationRecord.count({ where }),
    ]);

    return { items, total };
  }

  async updateObligation(
    id: string,
    _organizationId: string,
    data: Prisma.ObligationRecordUpdateInput,
  ) {
    return this.prisma.obligationRecord.update({
      where: { id },
      data,
    });
  }

  async countObligationsBreakdown(organizationId: string) {
    const [total, verified, withPendingUpdate] = await Promise.all([
      this.prisma.obligationRecord.count({ where: { organizationId } }),
      this.prisma.obligationRecord.count({ where: { organizationId, isVerified: true } }),
      this.prisma.obligationRecord.count({
        where: { organizationId, pendingUpdate: { not: Prisma.DbNull } },
      }),
    ]);

    return {
      total,
      verified,
      pendingAmendments: withPendingUpdate,
      unverified: Math.max(0, total - verified),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. COUNTERPARTIES REPOSITORY
  // ═══════════════════════════════════════════════════════════════════════

  async createCounterparty(data: {
    organizationId: string;
    canonicalName: string;
    domain?: string;
    aliases?: string[];
  }) {
    const id = generateId();
    return this.prisma.counterparty.create({
      data: {
        id,
        organizationId: data.organizationId,
        canonicalName: data.canonicalName,
        domain: data.domain || null,
        aliases: data.aliases || [],
      },
    });
  }

  async findCounterpartyById(id: string, organizationId: string) {
    return this.prisma.counterparty.findFirst({
      where: { id, organizationId },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async findCounterpartyByName(organizationId: string, name: string) {
    return this.prisma.counterparty.findFirst({
      where: {
        organizationId,
        canonicalName: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });
  }

  async findCounterparties(
    organizationId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.CounterpartyWhereInput = {
      organizationId,
      ...(options?.search && {
        OR: [
          { canonicalName: { contains: options.search, mode: 'insensitive' } },
          { domain: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.counterparty.findMany({
        where,
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          _count: {
            select: { documents: true },
          },
        },
        orderBy: { canonicalName: 'asc' },
      }),
      this.prisma.counterparty.count({ where }),
    ]);

    return { items, total };
  }

  async updateCounterparty(
    id: string,
    _organizationId: string,
    data: Prisma.CounterpartyUpdateInput,
  ) {
    return this.prisma.counterparty.update({
      where: { id },
      data,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. CUSTOM EXTRACTION FIELDS REPOSITORY
  // ═══════════════════════════════════════════════════════════════════════

  async createCustomField(data: {
    organizationId: string;
    fieldName: string;
    description: string;
    fieldType: string;
  }) {
    const id = generateId();
    return this.prisma.customExtractionField.create({
      data: {
        id,
        organizationId: data.organizationId,
        fieldName: data.fieldName,
        description: data.description,
        fieldType: data.fieldType,
        isActive: true,
      },
    });
  }

  async findCustomFields(organizationId: string) {
    return this.prisma.customExtractionField.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteCustomField(id: string, organizationId: string) {
    return this.prisma.customExtractionField.updateMany({
      where: { id, organizationId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. PORTFOLIO METRICS & AGGREGATIONS
  // ═══════════════════════════════════════════════════════════════════════

  async getPortfolioDashboardMetrics(organizationId: string) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [
      totalAgreements,
      activeAgreements,
      counterpartiesCount,
      obligationCounts,
      upcomingExpirations30,
      upcomingExpirations90,
    ] = await Promise.all([
      this.prisma.document.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.document.count({
        where: {
          organizationId,
          status: { in: ['executed', 'active', 'signed'] },
          deletedAt: null,
        },
      }),
      this.prisma.counterparty.count({
        where: { organizationId },
      }),
      this.countObligationsBreakdown(organizationId),
      this.prisma.obligationRecord.count({
        where: {
          organizationId,
          fieldValueDate: { gte: now, lte: in30Days },
        },
      }),
      this.prisma.obligationRecord.count({
        where: {
          organizationId,
          fieldValueDate: { gte: now, lte: in90Days },
        },
      }),
    ]);

    return {
      totalAgreements,
      activeAgreements,
      counterpartiesCount,
      obligationCounts,
      upcomingExpirations30,
      upcomingExpirations90,
    };
  }
}
