import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class ClickwrapRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Agreements ---

  async createAgreement(data: { id?: string; organizationId: string; name: string; slug: string }) {
    return this.prisma.clickwrapAgreement.create({
      data: {
        id: data.id || generateId(),
        organizationId: data.organizationId,
        name: data.name,
        slug: data.slug,
        isActive: true,
      },
    });
  }

  async findAgreementById(id: string, organizationId?: string) {
    return this.prisma.clickwrapAgreement.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
      include: {
        versions: {
          where: { deletedAt: null },
          orderBy: { versionNumber: 'desc' },
          include: {
            _count: {
              select: { acceptances: true },
            },
          },
        },
      },
    });
  }

  async findAgreementBySlug(slug: string, organizationId?: string) {
    return this.prisma.clickwrapAgreement.findFirst({
      where: {
        slug,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
    });
  }

  async listAgreements(organizationId: string, cursor?: string, limit = 50) {
    const items = await this.prisma.clickwrapAgreement.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          where: { deletedAt: null },
          select: { id: true, versionNumber: true, isCurrent: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const records = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      items: records,
      nextCursor,
      hasMore,
    };
  }

  async softDeleteAgreement(id: string, organizationId: string) {
    return this.prisma.clickwrapAgreement.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  // --- Versions ---

  async findMaxVersionNumber(clickwrapAgreementId: string): Promise<number> {
    const latest = await this.prisma.clickwrapVersion.findFirst({
      where: { clickwrapAgreementId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return latest?.versionNumber ?? 0;
  }

  async createVersion(data: {
    id?: string;
    organizationId: string;
    clickwrapAgreementId: string;
    versionNumber: number;
    content: string;
    contentHash: string;
    isCurrent?: boolean;
    publishedAt?: Date | null;
  }) {
    return this.prisma.clickwrapVersion.create({
      data: {
        id: data.id || generateId(),
        organizationId: data.organizationId,
        clickwrapAgreementId: data.clickwrapAgreementId,
        versionNumber: data.versionNumber,
        content: data.content,
        contentHash: data.contentHash,
        isCurrent: data.isCurrent ?? false,
        publishedAt: data.publishedAt ?? null,
      },
    });
  }

  async findVersionById(versionId: string, organizationId?: string) {
    return this.prisma.clickwrapVersion.findFirst({
      where: {
        id: versionId,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
      include: {
        agreement: true,
      },
    });
  }

  async findCurrentVersionBySlug(slug: string) {
    const agreement = await this.prisma.clickwrapAgreement.findFirst({
      where: { slug, deletedAt: null, isActive: true },
    });
    if (!agreement) return null;

    const currentVersion = await this.prisma.clickwrapVersion.findFirst({
      where: {
        clickwrapAgreementId: agreement.id,
        isCurrent: true,
        deletedAt: null,
      },
    });

    return {
      agreement,
      version: currentVersion,
    };
  }

  async listVersions(clickwrapAgreementId: string, organizationId?: string) {
    return this.prisma.clickwrapVersion.findMany({
      where: {
        clickwrapAgreementId,
        ...(organizationId ? { organizationId } : {}),
        deletedAt: null,
      },
      orderBy: { versionNumber: 'desc' },
      include: {
        _count: {
          select: { acceptances: true },
        },
      },
    });
  }

  async publishVersion(agreementId: string, versionId: string, publishedAt = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Unset all current versions for this agreement
      await tx.clickwrapVersion.updateMany({
        where: { clickwrapAgreementId: agreementId, isCurrent: true },
        data: { isCurrent: false },
      });

      // 2. Set targeted version as current and set publishedAt
      const updated = await tx.clickwrapVersion.update({
        where: { id: versionId },
        data: {
          isCurrent: true,
          publishedAt,
        },
      });

      return updated;
    });
  }

  async softDeleteVersion(versionId: string) {
    return this.prisma.clickwrapVersion.update({
      where: { id: versionId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // --- Acceptances ---

  async recordAcceptance(data: {
    id?: string;
    organizationId: string;
    clickwrapVersionId: string;
    acceptorEmail: string;
    acceptorName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    return this.prisma.clickwrapAcceptance.create({
      data: {
        id: data.id || generateId(),
        organizationId: data.organizationId,
        clickwrapVersionId: data.clickwrapVersionId,
        acceptorEmail: data.acceptorEmail,
        acceptorName: data.acceptorName,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        acceptedAt: new Date(),
      },
    });
  }

  async listAcceptances(
    agreementId: string,
    organizationId: string,
    emailFilter?: string,
    cursor?: string,
    limit = 50,
  ) {
    const versions = await this.prisma.clickwrapVersion.findMany({
      where: { clickwrapAgreementId: agreementId, organizationId },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    const items = await this.prisma.clickwrapAcceptance.findMany({
      where: {
        organizationId,
        clickwrapVersionId: { in: versionIds },
        ...(emailFilter ? { acceptorEmail: { contains: emailFilter, mode: 'insensitive' } } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { acceptedAt: 'desc' },
      include: {
        version: {
          select: {
            id: true,
            versionNumber: true,
            contentHash: true,
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const records = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      items: records,
      nextCursor,
      hasMore,
    };
  }

  async getAgreementStats(agreementId: string, organizationId: string) {
    const versions = await this.prisma.clickwrapVersion.findMany({
      where: { clickwrapAgreementId: agreementId, organizationId, deletedAt: null },
      orderBy: { versionNumber: 'asc' },
      select: {
        id: true,
        versionNumber: true,
        isCurrent: true,
        _count: {
          select: { acceptances: true },
        },
      },
    });

    const totalAcceptances = versions.reduce((sum, v) => sum + v._count.acceptances, 0);

    return {
      agreementId,
      totalAcceptances,
      perVersion: versions.map((v) => ({
        versionId: v.id,
        versionNumber: v.versionNumber,
        isCurrent: v.isCurrent,
        acceptancesCount: v._count.acceptances,
      })),
    };
  }
}
