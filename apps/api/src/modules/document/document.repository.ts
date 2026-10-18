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
}
