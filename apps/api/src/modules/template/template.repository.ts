import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, buildCursorPage, decodeCursor } from '@pactintel/shared-utils';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateContentBlockDto,
  UpdateContentBlockDto,
  CreateFolderDto,
  UpdateFolderDto,
} from '@pactintel/shared-types';
import { Prisma } from '@prisma/client';

export interface ListTemplatesOptions {
  workspaceId?: string;
  category?: string;
  folderId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ListContentBlocksOptions {
  workspaceId?: string;
  type?: string;
  tag?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ListFoldersOptions {
  workspaceId?: string;
  entityType?: 'document' | 'template';
  parentId?: string;
}

@Injectable()
export class TemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // 1. Templates
  // ===========================================================================

  async create(organizationId: string, dto: CreateTemplateDto, id: string = generateId()) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          id,
          organizationId,
          workspaceId: dto.workspaceId,
          title: dto.title,
          category: dto.category,
          industryTags: dto.industryTags ?? [],
          content: dto.content as Prisma.InputJsonValue,
          defaultSettings: (dto.defaultSettings ?? {}) as Prisma.InputJsonValue,
          variableFields: (dto.variableFields ?? []) as Prisma.InputJsonValue,
          signerRoles: (dto.signerRoles ?? []) as Prisma.InputJsonValue,
          folderId: dto.folderId,
          usageCount: 0,
        },
      });

      // Outbox pattern (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'template.created',
          aggregateType: 'template',
          aggregateId: template.id,
          payload: {
            templateId: template.id,
            workspaceId: template.workspaceId,
            title: template.title,
            category: template.category,
          },
        },
      });

      return template;
    });
  }

  async findById(organizationId: string, templateId: string) {
    return this.prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
        deletedAt: null,
      },
      include: {
        folder: { select: { id: true, name: true } },
      },
    });
  }

  async list(organizationId: string, options: ListTemplatesOptions = {}) {
    const { workspaceId, category, folderId, search, cursor, limit = 20 } = options;
    const decoded = decodeCursor(cursor);

    const templates = await this.prisma.template.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
        ...(category ? { category } : {}),
        ...(folderId ? { folderId } : {}),
        ...(search
          ? {
              title: { contains: search, mode: 'insensitive' as Prisma.QueryMode },
            }
          : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
      include: {
        folder: { select: { id: true, name: true } },
      },
    });

    return buildCursorPage(templates, limit);
  }

  async update(organizationId: string, templateId: string, dto: UpdateTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.template.findFirst({
        where: { id: templateId, organizationId, deletedAt: null },
      });
      if (!existing) return null;

      const data: Prisma.TemplateUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.category !== undefined) data.category = dto.category;
      if (dto.industryTags !== undefined) data.industryTags = dto.industryTags;
      if (dto.content !== undefined) data.content = dto.content as Prisma.InputJsonValue;
      if (dto.defaultSettings !== undefined)
        data.defaultSettings = dto.defaultSettings as Prisma.InputJsonValue;
      if (dto.variableFields !== undefined)
        data.variableFields = dto.variableFields as Prisma.InputJsonValue;
      if (dto.signerRoles !== undefined)
        data.signerRoles = dto.signerRoles as Prisma.InputJsonValue;
      if (dto.folderId !== undefined) {
        data.folder = dto.folderId ? { connect: { id: dto.folderId } } : { disconnect: true };
      }

      const updated = await tx.template.update({
        where: { id: templateId },
        data,
      });

      // Audit log entry for template updates
      await tx.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          action: 'template.updated',
          resourceType: 'template',
          resourceId: templateId,
          changes: { updatedFields: Object.keys(data) },
        },
      });

      return updated;
    });
  }

  async softDelete(organizationId: string, templateId: string) {
    return this.prisma.template.updateMany({
      where: { id: templateId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async incrementUsageCount(organizationId: string, templateId: string) {
    return this.prisma.template.updateMany({
      where: { id: templateId, organizationId },
      data: { usageCount: { increment: 1 } },
    });
  }

  // ===========================================================================
  // 2. Content Blocks
  // ===========================================================================

  async createContentBlock(
    organizationId: string,
    dto: CreateContentBlockDto,
    id: string = generateId(),
  ) {
    return this.prisma.contentBlock.create({
      data: {
        id,
        organizationId,
        workspaceId: dto.workspaceId,
        title: dto.title,
        type: dto.type,
        content: dto.content as Prisma.InputJsonValue,
        tags: dto.tags ?? [],
        usageCount: 0,
      },
    });
  }

  async findContentBlockById(organizationId: string, blockId: string) {
    return this.prisma.contentBlock.findFirst({
      where: { id: blockId, organizationId, deletedAt: null },
    });
  }

  async listContentBlocks(organizationId: string, options: ListContentBlocksOptions = {}) {
    const { workspaceId, type, tag, search, cursor, limit = 20 } = options;
    const decoded = decodeCursor(cursor);

    const blocks = await this.prisma.contentBlock.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
        ...(type ? { type } : {}),
        ...(tag ? { tags: { has: tag } } : {}),
        ...(search
          ? {
              title: { contains: search, mode: 'insensitive' as Prisma.QueryMode },
            }
          : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });

    return buildCursorPage(blocks, limit);
  }

  async updateContentBlock(organizationId: string, blockId: string, dto: UpdateContentBlockDto) {
    return this.prisma.contentBlock.updateMany({
      where: { id: blockId, organizationId, deletedAt: null },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.content !== undefined ? { content: dto.content as Prisma.InputJsonValue } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
  }

  async softDeleteContentBlock(organizationId: string, blockId: string) {
    return this.prisma.contentBlock.updateMany({
      where: { id: blockId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async incrementContentBlockUsage(organizationId: string, blockId: string) {
    return this.prisma.$transaction(async (tx) => {
      const block = await tx.contentBlock.findFirst({
        where: { id: blockId, organizationId, deletedAt: null },
      });
      if (!block) return null;

      return tx.contentBlock.update({
        where: { id: blockId },
        data: { usageCount: { increment: 1 } },
      });
    });
  }

  // ===========================================================================
  // 3. Folders
  // ===========================================================================

  async createFolder(organizationId: string, dto: CreateFolderDto, id: string = generateId()) {
    return this.prisma.folder.create({
      data: {
        id,
        organizationId,
        workspaceId: dto.workspaceId,
        name: dto.name,
        entityType: dto.entityType,
        parentId: dto.parentId,
      },
    });
  }

  async findFolderById(organizationId: string, folderId: string) {
    return this.prisma.folder.findFirst({
      where: { id: folderId, organizationId, deletedAt: null },
      include: {
        children: { where: { deletedAt: null } },
      },
    });
  }

  async listFolders(organizationId: string, options: ListFoldersOptions = {}) {
    const { workspaceId, entityType, parentId } = options;

    return this.prisma.folder.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
        ...(entityType ? { entityType } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        children: { where: { deletedAt: null } },
      },
    });
  }

  async updateFolder(organizationId: string, folderId: string, dto: UpdateFolderDto) {
    return this.prisma.folder.updateMany({
      where: { id: folderId, organizationId, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
      },
    });
  }

  async softDeleteFolder(organizationId: string, folderId: string) {
    return this.prisma.folder.updateMany({
      where: { id: folderId, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Counts active documents and templates inside a folder (RULE FOLD-001)
   */
  async countFolderContents(organizationId: string, folderId: string): Promise<number> {
    const [templatesCount, documentsCount] = await Promise.all([
      this.prisma.template.count({
        where: { folderId, organizationId, deletedAt: null },
      }),
      this.prisma.document.count({
        where: {
          organizationId,
          deletedAt: null,
          metadata: {
            path: ['folderId'],
            equals: folderId,
          },
        },
      }),
    ]);

    return templatesCount + documentsCount;
  }
}
