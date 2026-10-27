import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ClickwrapRepository } from './clickwrap.repository';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateClickwrapAgreementDto,
  CreateClickwrapVersionDto,
  RecordClickwrapAcceptanceDto,
} from '@pactintel/shared-types';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class ClickwrapService {
  private readonly logger = new Logger(ClickwrapService.name);

  constructor(
    private readonly repo: ClickwrapRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly prisma: PrismaService,
  ) {}

  async createAgreement(organizationId: string, dto: CreateClickwrapAgreementDto) {
    const existing = await this.repo.findAgreementBySlug(dto.slug, organizationId);
    if (existing) {
      throw new ConflictException(
        `Clickwrap agreement with slug '${dto.slug}' already exists for this organization.`,
      );
    }

    return this.repo.createAgreement({
      organizationId,
      name: dto.name,
      slug: dto.slug,
    });
  }

  async listAgreements(organizationId: string, cursor?: string, limit = 50) {
    return this.repo.listAgreements(organizationId, cursor, limit);
  }

  async getAgreement(organizationId: string, id: string) {
    const agreement = await this.repo.findAgreementById(id, organizationId);
    if (!agreement) {
      throw new NotFoundException(`Clickwrap agreement with id '${id}' not found.`);
    }
    return agreement;
  }

  async createVersion(organizationId: string, agreementId: string, dto: CreateClickwrapVersionDto) {
    const agreement = await this.repo.findAgreementById(agreementId, organizationId);
    if (!agreement) {
      throw new NotFoundException(`Clickwrap agreement with id '${agreementId}' not found.`);
    }

    // 1. Compute content hash (SHA-256) server-side
    const contentHash = crypto.createHash('sha256').update(dto.content).digest('hex');

    // 2. Compute next auto-incremented version number
    const maxVersion = await this.repo.findMaxVersionNumber(agreementId);
    const versionNumber = maxVersion + 1;
    const versionId = generateId();

    // 3. Atomically persist version and outbox event
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clickwrapVersion.create({
        data: {
          id: versionId,
          organizationId,
          clickwrapAgreementId: agreementId,
          versionNumber,
          content: dto.content,
          contentHash,
          isCurrent: false,
        },
      });

      await this.outbox.emit(tx, organizationId, 'clickwrap.version.created', versionId, {
        agreementId,
        versionId,
        versionNumber,
        contentHash,
      });

      return created;
    });

    this.logger.log(
      `[ClickwrapService] Version ${versionNumber} created for agreement ${agreementId}`,
    );

    return version;
  }

  async publishVersion(organizationId: string, agreementId: string, versionId: string) {
    const agreement = await this.repo.findAgreementById(agreementId, organizationId);
    if (!agreement) {
      throw new NotFoundException(`Clickwrap agreement with id '${agreementId}' not found.`);
    }

    const version = await this.repo.findVersionById(versionId, organizationId);
    if (!version || version.clickwrapAgreementId !== agreementId) {
      throw new NotFoundException(`Clickwrap version with id '${versionId}' not found.`);
    }

    const now = new Date();

    // Atomic transaction: unset old current version, mark new version current (RULE CW-001)
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.clickwrapVersion.updateMany({
        where: { clickwrapAgreementId: agreementId, isCurrent: true },
        data: { isCurrent: false },
      });

      const published = await tx.clickwrapVersion.update({
        where: { id: versionId },
        data: {
          isCurrent: true,
          publishedAt: now,
        },
      });

      await this.outbox.emit(tx, organizationId, 'clickwrap.version.published', versionId, {
        agreementId,
        versionId,
        versionNumber: published.versionNumber,
        publishedAt: now,
      });

      return published;
    });

    this.logger.log(
      `[ClickwrapService] Published version ${updated.versionNumber} for agreement ${agreementId}`,
    );

    return updated;
  }

  async deleteVersion(organizationId: string, agreementId: string, versionId: string) {
    const version = await this.repo.findVersionById(versionId, organizationId);
    if (!version || version.clickwrapAgreementId !== agreementId) {
      throw new NotFoundException(`Clickwrap version with id '${versionId}' not found.`);
    }

    // RULE EC-CW-03: Cannot delete currently published version
    if (version.isCurrent) {
      throw new ConflictException({
        code: 'CANNOT_DELETE_CURRENT_VERSION',
        message:
          'Cannot delete the currently active clickwrap version. Publish another version first.',
      });
    }

    await this.repo.softDeleteVersion(versionId);

    return { status: 'deleted', versionId };
  }

  /**
   * Public consent capture endpoint (no authentication required).
   * RULE CW-001: Acceptances are immutable and append-only.
   */
  async recordAcceptance(
    slug: string,
    dto: RecordClickwrapAcceptanceDto,
    metadata?: { ipAddress?: string; userAgent?: string },
  ) {
    const data = await this.repo.findCurrentVersionBySlug(slug);
    if (!data || !data.version) {
      throw new NotFoundException(
        `Active clickwrap agreement version for slug '${slug}' was not found.`,
      );
    }

    const { agreement, version } = data;
    const acceptanceId = generateId();
    const acceptedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.clickwrapAcceptance.create({
        data: {
          id: acceptanceId,
          organizationId: agreement.organizationId,
          clickwrapVersionId: version.id,
          acceptorEmail: dto.email,
          acceptorName: dto.name || null,
          ipAddress: metadata?.ipAddress || null,
          userAgent: metadata?.userAgent || null,
          acceptedAt,
        },
      });

      await this.outbox.emit(
        tx,
        agreement.organizationId,
        'clickwrap.acceptance.recorded',
        acceptanceId,
        {
          agreementId: agreement.id,
          slug,
          versionId: version.id,
          versionNumber: version.versionNumber,
          acceptorEmail: dto.email,
          acceptedAt,
        },
      );
    });

    return {
      accepted: true,
      acceptanceId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      acceptedAt,
    };
  }

  async getPublicClickwrap(slug: string) {
    const data = await this.repo.findCurrentVersionBySlug(slug);
    if (!data || !data.version) {
      throw new NotFoundException(`Active clickwrap agreement for slug '${slug}' was not found.`);
    }

    return {
      agreementName: data.agreement.name,
      slug: data.agreement.slug,
      versionId: data.version.id,
      versionNumber: data.version.versionNumber,
      content: data.version.content,
      contentHash: data.version.contentHash,
      publishedAt: data.version.publishedAt,
    };
  }

  async listAcceptances(
    organizationId: string,
    agreementId: string,
    emailFilter?: string,
    cursor?: string,
    limit = 50,
  ) {
    const agreement = await this.repo.findAgreementById(agreementId, organizationId);
    if (!agreement) {
      throw new NotFoundException(`Clickwrap agreement with id '${agreementId}' not found.`);
    }

    return this.repo.listAcceptances(agreementId, organizationId, emailFilter, cursor, limit);
  }

  async getStats(organizationId: string, agreementId: string) {
    const agreement = await this.repo.findAgreementById(agreementId, organizationId);
    if (!agreement) {
      throw new NotFoundException(`Clickwrap agreement with id '${agreementId}' not found.`);
    }

    return this.repo.getAgreementStats(agreementId, organizationId);
  }
}
