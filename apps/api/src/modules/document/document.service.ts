import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import { DocumentOutboxService } from './outbox/document-outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentDto, UpdateDocumentDto, DocumentStatus } from '@pactintel/shared-types';
import { sha256, canonicalJson } from '@pactintel/shared-utils';

@Injectable()
export class DocumentService {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enforced status transitions state machine (RULE SIG-004)
   * draft → sent → viewed → signed     (terminal)
   * draft → sent → viewed → declined   (terminal)
   * draft → sent → expired             (terminal)
   * any non-terminal → voided          (terminal)
   * any non-terminal → archived        (reversible)
   */
  private readonly validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
    draft: ['sent', 'archived', 'voided'],
    sent: ['viewed', 'signed', 'declined', 'expired', 'archived', 'voided'],
    viewed: ['signed', 'declined', 'expired', 'archived', 'voided'],
    signed: ['archived'], // terminal legal state
    declined: ['archived'], // terminal
    expired: ['archived'], // terminal
    voided: ['archived'], // terminal
    archived: ['draft'], // reversible to draft if unsigned
  };

  /**
   * Creates a new document with Copy-On-Create template semantics (RULE SIG-006).
   */
  async createDocument(organizationId: string, ownerId: string, dto: CreateDocumentDto) {
    let initialContent: Record<string, unknown> = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start drafting...' }] }],
    };

    // Copy-on-create semantics from template (RULE SIG-006)
    if (dto.sourceTemplateId) {
      const template = await this.prisma.template.findFirst({
        where: { id: dto.sourceTemplateId, organizationId, deletedAt: null },
      });
      if (template && typeof template.content === 'object' && template.content !== null) {
        // Deep copy snapshot to completely decouple document from future template edits
        initialContent = JSON.parse(JSON.stringify(template.content));
      }
    }

    const contentHash = sha256(canonicalJson(initialContent));
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const slug = `${dto.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomSuffix}`;

    return this.prisma.$transaction(async (tx) => {
      const { doc, version } = await this.docRepo.create(
        organizationId,
        ownerId,
        dto,
        slug,
        initialContent,
        contentHash,
      );

      // Emit transactional outbox event (Invariant I-06)
      await this.outbox.emit(tx, organizationId, 'document.created', doc.id, {
        documentId: doc.id,
        versionId: version.id,
        title: doc.title,
      });

      return { ...doc, currentVersion: version };
    });
  }

  async getDocument(organizationId: string, documentId: string) {
    const doc = await this.docRepo.findById(organizationId, documentId);
    if (!doc) {
      throw new HttpException(
        { code: 'DOCUMENT_NOT_FOUND', message: 'Document does not exist.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return doc;
  }

  async getDocumentBySlug(slug: string) {
    const doc = await this.docRepo.findBySlug(slug);
    if (!doc) {
      throw new HttpException(
        { code: 'DOCUMENT_NOT_FOUND', message: 'Document does not exist.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return doc;
  }

  async listDocuments(
    organizationId: string,
    workspaceId?: string,
    status?: string,
    cursor?: string,
    limit?: number,
  ) {
    return this.docRepo.list(organizationId, workspaceId, status, cursor, limit);
  }

  async updateDocument(organizationId: string, documentId: string, dto: UpdateDocumentDto) {
    const existing = await this.getDocument(organizationId, documentId);
    if (existing.status === 'signed' || existing.status === 'voided') {
      throw new HttpException(
        { code: 'DOCUMENT_IMMUTABLE', message: 'Signed or voided documents cannot be modified.' },
        HttpStatus.CONFLICT,
      );
    }
    return this.docRepo.update(organizationId, documentId, dto);
  }

  async softDelete(organizationId: string, documentId: string) {
    const existing = await this.getDocument(organizationId, documentId);
    if (existing.status === 'signed') {
      throw new HttpException(
        {
          code: 'DOCUMENT_SIGNED',
          message: 'Legally signed documents cannot be deleted. Archive instead.',
        },
        HttpStatus.CONFLICT,
      );
    }
    return this.docRepo.softDelete(organizationId, documentId);
  }

  /**
   * Creates a new version snapshot.
   * Throws 409 DOCUMENT_VERSION_SIGNED if the latest version is already signed (RULE SIG-001).
   * Generates deterministic SHA-256 hash (RULE SIG-002).
   */
  async saveVersion(
    organizationId: string,
    documentId: string,
    contentSnapshot: Record<string, unknown>,
    userId?: string,
  ) {
    const doc = await this.getDocument(organizationId, documentId);

    // RULE SIG-001: check if currently signed
    const latestVersion = doc.versions[0];
    if (latestVersion && latestVersion.isSigned) {
      throw new HttpException(
        {
          code: 'DOCUMENT_VERSION_SIGNED',
          message: 'Cannot modify or add versions to a signed document.',
        },
        HttpStatus.CONFLICT,
      );
    }

    if (doc.status === 'signed') {
      throw new HttpException(
        {
          code: 'DOCUMENT_VERSION_SIGNED',
          message: 'Cannot modify or add versions to a signed document.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    const contentHash = sha256(canonicalJson(contentSnapshot));

    return this.prisma.$transaction(async (tx) => {
      const version = await this.docRepo.createVersion(
        organizationId,
        documentId,
        nextVersionNumber,
        contentSnapshot,
        contentHash,
        userId,
      );

      await this.outbox.emit(tx, organizationId, 'document.created', documentId, {
        documentId,
        versionId: version.id,
        versionNumber: version.versionNumber,
        contentHash,
      });

      return version;
    });
  }

  /**
   * Enforces status transition and checks monthly document limit (RULE BILL-002, SIG-004)
   */
  async sendDocument(organizationId: string, documentId: string) {
    const doc = await this.getDocument(organizationId, documentId);
    this.assertValidTransition(doc.status as DocumentStatus, 'sent');

    // RULE BILL-002: Check document volume quota on send
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (
      subscription &&
      subscription.documentLimit !== null &&
      subscription.documentsUsedThisPeriod >= subscription.documentLimit
    ) {
      throw new HttpException(
        {
          code: 'DOCUMENT_LIMIT_REACHED',
          message: `Monthly document limit (${subscription.documentLimit}) reached for plan tier ${subscription.planTier}. Please upgrade to continue.`,
          details: {
            limit: subscription.documentLimit,
            used: subscription.documentsUsedThisPeriod,
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Execute state transition & increment usage count atomically
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: documentId, organizationId },
        data: { status: 'sent' },
      });

      if (subscription && subscription.documentLimit !== null) {
        await tx.subscription.update({
          where: { organizationId },
          data: { documentsUsedThisPeriod: { increment: 1 } },
        });
      }

      await this.outbox.emit(tx, organizationId, 'document.sent', documentId, {
        documentId,
        slug: doc.slug,
      });

      return updated;
    });
  }

  /**
   * Transition document status enforcing RULE SIG-004 state machine.
   */
  async transitionStatus(organizationId: string, documentId: string, targetStatus: DocumentStatus) {
    const doc = await this.getDocument(organizationId, documentId);
    this.assertValidTransition(doc.status as DocumentStatus, targetStatus);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: documentId, organizationId },
        data: { status: targetStatus },
      });

      const eventMap: Partial<Record<DocumentStatus, any>> = {
        viewed: 'document.viewed',
        signed: 'document.signed',
        declined: 'document.declined',
        expired: 'document.expired',
        voided: 'document.voided',
      };

      const eventType = eventMap[targetStatus];
      if (eventType) {
        await this.outbox.emit(tx, organizationId, eventType, documentId, {
          documentId,
          status: targetStatus,
        });
      }

      return updated;
    });
  }

  async listVersions(organizationId: string, documentId: string) {
    await this.getDocument(organizationId, documentId);
    return this.prisma.documentVersion.findMany({
      where: { documentId, organizationId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        contentHash: true,
        isSigned: true,
        isCurrent: true,
        createdBy: true,
        createdAt: true,
      },
    });
  }

  async getAuditTrail(organizationId: string, documentId: string) {
    await this.getDocument(organizationId, documentId);
    return this.prisma.signatureEvent.findMany({
      where: { documentId, organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Validates recipient access for public document viewer (/d/:slug).
   * Checks expiration, password gate, and domain restriction.
   */
  async validateRecipientAccess(slug: string, passwordAttempt?: string, recipientEmail?: string) {
    const doc = await this.getDocumentBySlug(slug);

    // 1. Check expiration against current time (RULE I18N-001)
    if (doc.expiresAt && new Date() > doc.expiresAt) {
      if (doc.status !== 'signed' && doc.status !== 'expired') {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: { status: 'expired' },
        });
      }
      return {
        accessible: false,
        reason: 'EXPIRED',
        message: 'This document has expired.',
        expiresAt: doc.expiresAt,
      };
    }

    // 2. Password Gate Check
    if (doc.passwordHash) {
      if (!passwordAttempt) {
        return {
          accessible: false,
          reason: 'PASSWORD_REQUIRED',
          message: 'This document is protected with a password.',
          title: doc.title,
        };
      }
      if (sha256(passwordAttempt) !== doc.passwordHash) {
        throw new HttpException(
          { code: 'INVALID_PASSWORD', message: 'The provided document password is incorrect.' },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    // 3. Domain Restriction Check
    if (doc.domainRestriction && doc.domainRestriction.length > 0) {
      if (!recipientEmail) {
        return {
          accessible: false,
          reason: 'EMAIL_REQUIRED',
          message: 'Please provide your email address to access this document.',
          allowedDomains: doc.domainRestriction,
        };
      }

      const emailDomain = recipientEmail.split('@')[1]?.toLowerCase();
      const isAllowed = doc.domainRestriction.some(
        (domain) => domain.toLowerCase() === emailDomain,
      );

      if (!isAllowed) {
        throw new HttpException(
          {
            code: 'DOMAIN_RESTRICTED',
            message: `Access restricted. Only recipients from [${doc.domainRestriction.join(', ')}] can access this document.`,
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Record viewed transition if status is 'sent'
    if (doc.status === 'sent') {
      await this.transitionStatus(doc.organizationId, doc.id, 'viewed');
    }

    const currentVersion = doc.versions[0];

    return {
      accessible: true,
      document: {
        id: doc.id,
        title: doc.title,
        status: doc.status === 'sent' ? 'viewed' : doc.status,
        currency: doc.currency,
        totalValue: doc.totalValue,
        expiresAt: doc.expiresAt,
        organizationName: doc.organization.name,
        currentVersion: {
          versionNumber: currentVersion?.versionNumber,
          contentSnapshot: currentVersion?.contentSnapshot,
          contentHash: currentVersion?.contentHash,
          isSigned: currentVersion?.isSigned,
        },
      },
    };
  }

  private assertValidTransition(from: DocumentStatus, to: DocumentStatus) {
    const allowed = this.validTransitions[from] || [];
    if (!allowed.includes(to)) {
      throw new HttpException(
        {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Illegal document status transition from '${from}' to '${to}'.`,
          details: { currentStatus: from, targetStatus: to, allowedTransitions: allowed },
        },
        HttpStatus.CONFLICT,
      );
    }
  }
}
