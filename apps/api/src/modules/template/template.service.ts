import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TemplateRepository,
  ListTemplatesOptions,
  ListContentBlocksOptions,
  ListFoldersOptions,
} from './template.repository';
import { generateId, sha256, canonicalJson } from '@pactintel/shared-utils';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateFromTemplateDto,
  SaveDocumentAsTemplateDto,
  CreateContentBlockDto,
  UpdateContentBlockDto,
  CreateFolderDto,
  UpdateFolderDto,
} from '@pactintel/shared-types';
import { Prisma } from '@prisma/client';

@Injectable()
export class TemplateService {
  constructor(
    private readonly repo: TemplateRepository,
    private readonly prisma: PrismaService,
  ) {}

  // ===========================================================================
  // 1. Templates
  // ===========================================================================

  async createTemplate(organizationId: string, dto: CreateTemplateDto) {
    const templateId = generateId();
    return this.repo.create(organizationId, dto, templateId);
  }

  async getTemplate(organizationId: string, templateId: string) {
    const template = await this.repo.findById(organizationId, templateId);
    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `Template with ID '${templateId}' was not found.`,
      });
    }
    return template;
  }

  async listTemplates(organizationId: string, options: ListTemplatesOptions = {}) {
    return this.repo.list(organizationId, options);
  }

  async updateTemplate(organizationId: string, templateId: string, dto: UpdateTemplateDto) {
    await this.getTemplate(organizationId, templateId);
    const updated = await this.repo.update(organizationId, templateId, dto);
    if (!updated) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `Template with ID '${templateId}' was not found.`,
      });
    }
    return updated;
  }

  async deleteTemplate(organizationId: string, templateId: string) {
    await this.getTemplate(organizationId, templateId);
    await this.repo.softDelete(organizationId, templateId);
    return { success: true };
  }

  /**
   * RULE SIG-006: Template-to-document is copy-on-create, never live.
   * Deep-copies template content, replaces variables, hashes snapshot,
   * creates Document + Version 1, increments usageCount, and logs outbox event.
   */
  async createDocumentFromTemplate(
    organizationId: string,
    userId: string,
    templateId: string,
    dto: CreateFromTemplateDto = {},
  ) {
    // 1. Load template (enforces tenant isolation)
    const template = await this.getTemplate(organizationId, templateId);

    // 2. Deep copy snapshot (never live link)
    const contentSnapshot = JSON.parse(JSON.stringify(template.content));

    // 3. Variable substitution if variables provided
    if (dto.variables && Object.keys(dto.variables).length > 0) {
      this.substituteVariables(contentSnapshot, dto.variables);
    }

    // 4. Content hashing via canonical JSON + SHA-256
    const canonical = canonicalJson(contentSnapshot);
    const contentHash = sha256(canonical);

    // 5. Generate identifiers
    const docId = generateId();
    const versionId = generateId();
    const slug = `${template.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30)}-${generateId().slice(0, 8)}`;

    // 6. Transactional creation: Document + Version + usageCount increment + Outbox
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: docId,
          organizationId,
          workspaceId: dto.workspaceId || template.workspaceId,
          ownerId: userId,
          sourceTemplateId: template.id,
          isTemplateLinked: false, // RULE SIG-006: severed copy-on-create
          type: 'proposal',
          title: dto.title || template.title,
          status: 'draft',
          slug,
          currency: 'USD',
          currentVersionId: versionId,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          id: versionId,
          documentId: docId,
          organizationId,
          versionNumber: 1,
          contentSnapshot: contentSnapshot as Prisma.InputJsonValue,
          contentHash,
          isSigned: false,
          isCurrent: true,
          createdBy: userId,
        },
      });

      // Atomic usage count increment
      await tx.template.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } },
      });

      // Outbox event (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'document.created_from_template',
          aggregateType: 'document',
          aggregateId: docId,
          payload: {
            documentId: docId,
            templateId: template.id,
            ownerId: userId,
            workspaceId: document.workspaceId,
          },
        },
      });

      return { document, version };
    });
  }

  /**
   * Saves an existing document's current version snapshot as a new template.
   * Source document is NOT modified.
   */
  async saveDocumentAsTemplate(
    organizationId: string,
    documentId: string,
    dto: SaveDocumentAsTemplateDto,
  ) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      include: {
        versions: {
          where: { isCurrent: true },
          take: 1,
        },
      },
    });

    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: `Document with ID '${documentId}' was not found.`,
      });
    }

    const currentVersion = document.versions[0];
    const contentSnapshot = currentVersion?.contentSnapshot ?? {};

    const templateId = generateId();

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.template.create({
        data: {
          id: templateId,
          organizationId,
          workspaceId: dto.workspaceId || document.workspaceId,
          title: dto.title,
          category: dto.category,
          industryTags: dto.industryTags ?? [],
          content: contentSnapshot as Prisma.InputJsonValue,
          defaultSettings: {},
          variableFields: [],
          signerRoles: [],
          folderId: dto.folderId,
          usageCount: 0,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'template.created',
          aggregateType: 'template',
          aggregateId: template.id,
          payload: {
            templateId: template.id,
            sourceDocumentId: documentId,
            workspaceId: template.workspaceId,
            title: template.title,
          },
        },
      });

      return template;
    });
  }

  // ===========================================================================
  // 2. Content Blocks
  // ===========================================================================

  async createContentBlock(organizationId: string, dto: CreateContentBlockDto) {
    const id = generateId();
    return this.repo.createContentBlock(organizationId, dto, id);
  }

  async getContentBlock(organizationId: string, blockId: string) {
    const block = await this.repo.findContentBlockById(organizationId, blockId);
    if (!block) {
      throw new NotFoundException({
        code: 'CONTENT_BLOCK_NOT_FOUND',
        message: `Content block with ID '${blockId}' was not found.`,
      });
    }
    return block;
  }

  async listContentBlocks(organizationId: string, options: ListContentBlocksOptions = {}) {
    return this.repo.listContentBlocks(organizationId, options);
  }

  async updateContentBlock(organizationId: string, blockId: string, dto: UpdateContentBlockDto) {
    await this.getContentBlock(organizationId, blockId);
    await this.repo.updateContentBlock(organizationId, blockId, dto);
    return this.getContentBlock(organizationId, blockId);
  }

  async deleteContentBlock(organizationId: string, blockId: string) {
    await this.getContentBlock(organizationId, blockId);
    await this.repo.softDeleteContentBlock(organizationId, blockId);
    return { success: true };
  }

  /**
   * Inserts content block into document or template, incrementing its usage count.
   */
  async insertContentBlock(organizationId: string, blockId: string) {
    const updated = await this.repo.incrementContentBlockUsage(organizationId, blockId);
    if (!updated) {
      throw new NotFoundException({
        code: 'CONTENT_BLOCK_NOT_FOUND',
        message: `Content block with ID '${blockId}' was not found.`,
      });
    }
    return updated;
  }

  // ===========================================================================
  // 3. Folders
  // ===========================================================================

  async createFolder(organizationId: string, dto: CreateFolderDto) {
    const id = generateId();
    return this.repo.createFolder(organizationId, dto, id);
  }

  async getFolder(organizationId: string, folderId: string) {
    const folder = await this.repo.findFolderById(organizationId, folderId);
    if (!folder) {
      throw new NotFoundException({
        code: 'FOLDER_NOT_FOUND',
        message: `Folder with ID '${folderId}' was not found.`,
      });
    }
    return folder;
  }

  async listFolders(organizationId: string, options: ListFoldersOptions = {}) {
    return this.repo.listFolders(organizationId, options);
  }

  async updateFolder(organizationId: string, folderId: string, dto: UpdateFolderDto) {
    await this.getFolder(organizationId, folderId);
    await this.repo.updateFolder(organizationId, folderId, dto);
    return this.getFolder(organizationId, folderId);
  }

  /**
   * RULE FOLD-001: Deleting a folder with active templates or documents
   * MUST return 409 FOLDER_NOT_EMPTY.
   */
  async deleteFolder(organizationId: string, folderId: string) {
    await this.getFolder(organizationId, folderId);

    const activeCount = await this.repo.countFolderContents(organizationId, folderId);
    if (activeCount > 0) {
      throw new ConflictException({
        code: 'FOLDER_NOT_EMPTY',
        message: `Cannot delete folder with ID '${folderId}' because it contains ${activeCount} active item(s). Move or delete them first.`,
      });
    }

    await this.repo.softDeleteFolder(organizationId, folderId);
    return { success: true };
  }

  // ===========================================================================
  // Helper: Variable Substitution
  // ===========================================================================

  private substituteVariables(
    node: Record<string, unknown> | unknown[],
    variables: Record<string, string | number>,
  ): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === 'object' && item !== null) {
          this.substituteVariables(item as Record<string, unknown>, variables);
        }
      }
    } else if (typeof node === 'object' && node !== null) {
      for (const key of Object.keys(node)) {
        const val = node[key];
        if (typeof val === 'string') {
          let updated = val;
          for (const [varKey, varVal] of Object.entries(variables)) {
            const pattern = new RegExp(`{{\\s*${varKey}\\s*}}`, 'g');
            updated = updated.replace(pattern, String(varVal));
          }
          node[key] = updated;
        } else if (typeof val === 'object' && val !== null) {
          this.substituteVariables(val as Record<string, unknown>, variables);
        }
      }
    }
  }
}
