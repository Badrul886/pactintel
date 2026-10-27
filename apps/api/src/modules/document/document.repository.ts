import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, buildCursorPage, decodeCursor } from '@pactintel/shared-utils';
import { CreateDocumentDto, UpdateDocumentDto } from '@pactintel/shared-types';
import { Prisma } from '@prisma/client';

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    ownerId: string,
    dto: CreateDocumentDto,
    slug: string,
    initialContent: Record<string, unknown> = {},
    contentHash: string,
  ) {
    const documentId = generateId();
    const versionId = generateId();

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          id: documentId,
          organizationId,
          workspaceId: dto.workspaceId,
          ownerId,
          sourceTemplateId: dto.sourceTemplateId,
          title: dto.title,
          type: dto.type,
          status: 'draft',
          slug,
          currency: dto.currency,
          currentVersionId: versionId,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId,
          organizationId,
          versionNumber: 1,
          contentSnapshot: initialContent as Prisma.InputJsonValue,
          contentHash,
          isSigned: false,
          isCurrent: true,
          createdBy: ownerId,
        },
      });

      return { doc, version };
    });
  }

  async findById(organizationId: string, documentId: string) {
    return this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.document.findFirst({
      where: { slug, deletedAt: null },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async list(
    organizationId: string,
    workspaceId?: string,
    status?: string,
    cursor?: string,
    limit = 20,
  ) {
    const decoded = decodeCursor(cursor);
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
        ...(status ? { status } : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });

    return buildCursorPage(documents, limit);
  }

  async update(organizationId: string, documentId: string, data: UpdateDocumentDto) {
    return this.prisma.document.update({
      where: { id: documentId, organizationId },
      data: {
        title: data.title,
        totalValue: data.totalValue,
        currency: data.currency,
        passwordHash: data.passwordHash,
        expiresAt: data.expiresAt,
        domainRestriction: data.domainRestriction,
      },
    });
  }

  async createVersion(
    organizationId: string,
    documentId: string,
    versionNumber: number,
    contentSnapshot: Record<string, unknown>,
    contentHash: string,
    userId?: string,
  ) {
    const versionId = generateId();

    return this.prisma.$transaction(async (tx) => {
      // Set previous versions isCurrent to false
      await tx.documentVersion.updateMany({
        where: { documentId, organizationId },
        data: { isCurrent: false },
      });

      const newVersion = await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId,
          organizationId,
          versionNumber,
          contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
          contentHash,
          isSigned: false,
          isCurrent: true,
          createdBy: userId,
        },
      });

      // Update pointer in documents table (pointer pattern X-05)
      await tx.document.update({
        where: { id: documentId, organizationId },
        data: { currentVersionId: versionId },
      });

      return newVersion;
    });
  }

  async softDelete(organizationId: string, documentId: string) {
    return this.prisma.document.update({
      where: { id: documentId, organizationId },
      data: { deletedAt: new Date() },
    });
  }

  // --- Document Expiry & Inactivity Reminders (Sprint 2.6) ---

  async findExpiringSoon(warningThreshold: Date, now: Date = new Date()) {
    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        expiresAt: { not: null, lte: warningThreshold, gt: now },
        expiryWarningSentAt: null,
        status: { notIn: ['expired', 'signed', 'voided', 'declined'] },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async setExpiryWarningAt(documentId: string, timestamp: Date = new Date()) {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { expiryWarningSentAt: timestamp },
    });
  }

  async findJustExpired(now: Date = new Date()) {
    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        expiresAt: { not: null, lte: now },
        status: { notIn: ['expired', 'signed', 'voided', 'declined'] },
      },
    });
  }

  async setStatus(documentId: string, status: string) {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { status },
    });
  }

  async findInactiveDocuments(now: Date = new Date()) {
    // Finds documents in 'sent' status with inactivityReminderDays set
    // RULE EC-EXPIRY-05: If lastViewedAt is NULL, fallback to createdAt for inactivity calculation
    const candidates = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'sent',
        inactivityReminderDays: { not: null },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    return candidates.filter((doc) => {
      if (!doc.inactivityReminderDays) return false;
      const refDate = doc.lastViewedAt ?? doc.createdAt;
      const daysDiff = (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff >= doc.inactivityReminderDays;
    });
  }

  async recordView(documentId: string, now: Date = new Date()) {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { lastViewedAt: now },
    });
  }

  async updateSettings(
    organizationId: string,
    documentId: string,
    settings: {
      expiresAt?: Date | null;
      inactivityReminderDays?: number | null;
    },
  ) {
    return this.prisma.document.update({
      where: { id: documentId, organizationId },
      data: {
        ...(settings.expiresAt !== undefined ? { expiresAt: settings.expiresAt } : {}),
        ...(settings.inactivityReminderDays !== undefined
          ? { inactivityReminderDays: settings.inactivityReminderDays }
          : {}),
      },
    });
  }
}
