import { Injectable, HttpException, HttpStatus, NotFoundException, Optional } from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import { DocumentOutboxService } from './outbox/document-outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentStatus,
  UpdateDocumentSettingsDto,
} from '@pactintel/shared-types';
import { sha256, canonicalJson, generateId } from '@pactintel/shared-utils';

@Injectable()
export class DocumentService {
  constructor(
    private readonly docRepo: DocumentRepository,
    private readonly outbox: DocumentOutboxService,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
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
   * RULE ACC-004: Strict check sequence MUST be:
   * 1. Link expiry -> EXPIRED
   * 2. Domain restriction -> DOMAIN_RESTRICTED (or EMAIL_REQUIRED)
   * 3. View limit (COUNT DISTINCT session_id) -> VIEW_LIMIT_EXCEEDED
   * 4. Password gate -> PASSWORD_REQUIRED
   *
   * ALL denial states MUST return HTTP 200 with the sender's brand kit.
   */
  async validateRecipientAccess(
    slug: string,
    passwordAttempt?: string,
    recipientEmail?: string,
    sessionId?: string,
  ) {
    const doc = await this.getDocumentBySlug(slug);

    // Load sender's brand kit (RULE BRAND-001)
    const brandKitEntity = this.prisma.brandKit
      ? await this.prisma.brandKit.findFirst({
          where: { organizationId: doc.organizationId, isDefault: true, deletedAt: null },
        })
      : null;

    const brandKit = brandKitEntity
      ? {
          id: brandKitEntity.id,
          name: brandKitEntity.name,
          primaryColor: brandKitEntity.primaryColor,
          secondaryColor: brandKitEntity.secondaryColor,
          accentColor: brandKitEntity.accentColor,
          logoUrl: brandKitEntity.logoUrl,
          faviconUrl: brandKitEntity.faviconUrl,
          fontHeading: brandKitEntity.fontHeading,
          fontBody: brandKitEntity.fontBody,
          customCss: brandKitEntity.customCss,
          removeBadge: brandKitEntity.removeBadge,
        }
      : null;

    // 1. Link Expiry Check
    if (doc.expiresAt && new Date() > doc.expiresAt) {
      if (doc.status !== 'signed' && doc.status !== 'expired') {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: { status: 'expired' },
        });
      }
      return {
        accessible: false,
        denialType: 'EXPIRED',
        reason: 'EXPIRED',
        status: 'EXPIRED',
        message: 'This document link has expired.',
        documentId: doc.id,
        title: doc.title,
        expiresAt: doc.expiresAt,
        brandKit,
      };
    }

    // 2. Domain Restriction Check
    if (doc.domainRestriction && doc.domainRestriction.length > 0) {
      if (!recipientEmail) {
        return {
          accessible: false,
          denialType: 'EMAIL_REQUIRED',
          reason: 'EMAIL_REQUIRED',
          status: 'EMAIL_REQUIRED',
          message: 'Please provide your email address to access this document.',
          documentId: doc.id,
          title: doc.title,
          allowedDomains: doc.domainRestriction,
          brandKit,
        };
      }

      const emailDomain = recipientEmail.split('@')[1]?.toLowerCase().trim();
      const isAllowed = doc.domainRestriction.some(
        (domain) => domain.toLowerCase().trim() === emailDomain,
      );

      if (!isAllowed) {
        return {
          accessible: false,
          denialType: 'DOMAIN_RESTRICTED',
          reason: 'DOMAIN_RESTRICTED',
          status: 'DOMAIN_RESTRICTED',
          message: `Access restricted. Only recipients from [${doc.domainRestriction.join(', ')}] can access this document.`,
          documentId: doc.id,
          title: doc.title,
          allowedDomains: doc.domainRestriction,
          brandKit,
        };
      }
    }

    // 3. View Limit Check (COUNT DISTINCT session_id)
    if (doc.maxViews && doc.maxViews > 0) {
      const viewEvents = await this.prisma.outboxEvent.findMany({
        where: {
          aggregateId: doc.id,
          eventType: 'analytics.document_viewed_first_time',
        },
        select: { payload: true },
      });

      const distinctSessions = new Set<string>();
      for (const ev of viewEvents) {
        const p = ev.payload as any;
        if (p?.sessionId) distinctSessions.add(p.sessionId);
      }

      const isNewSession = !sessionId || !distinctSessions.has(sessionId);
      if (distinctSessions.size >= doc.maxViews && isNewSession) {
        return {
          accessible: false,
          denialType: 'VIEW_LIMIT_EXCEEDED',
          reason: 'VIEW_LIMIT_EXCEEDED',
          status: 'VIEW_LIMIT_EXCEEDED',
          message: 'The maximum allowed views for this document has been reached.',
          documentId: doc.id,
          title: doc.title,
          maxViews: doc.maxViews,
          brandKit,
        };
      }
    }

    // 4. Password Gate Check
    if (doc.passwordHash) {
      if (!passwordAttempt) {
        return {
          accessible: false,
          denialType: 'PASSWORD_REQUIRED',
          reason: 'PASSWORD_REQUIRED',
          status: 'PASSWORD_REQUIRED',
          message: 'This document is protected with a password.',
          documentId: doc.id,
          title: doc.title,
          brandKit,
        };
      }
      if (sha256(passwordAttempt) !== doc.passwordHash) {
        return {
          accessible: false,
          denialType: 'PASSWORD_REQUIRED',
          reason: 'PASSWORD_REQUIRED',
          status: 'PASSWORD_REQUIRED',
          message: 'The provided document password is incorrect.',
          error: 'Incorrect password',
          documentId: doc.id,
          title: doc.title,
          brandKit,
        };
      }
    }

    // All 4 security gates passed. Record viewed transition if status is 'sent'
    if (doc.status === 'sent') {
      await this.transitionStatus(doc.organizationId, doc.id, 'viewed');
    }

    // Always update lastViewedAt for inactivity telemetry (Sprint 2.6)
    if (this.docRepo?.recordView) {
      await this.docRepo.recordView(doc.id);
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
      brandKit,
    };
  }

  /**
   * Request access to a restricted document (NO auth required).
   * Writes audit log entry and notifies document owner.
   */
  async requestAccess(
    documentId: string,
    body: { requesterEmail: string; requesterName: string; message?: string },
    metadata?: { ipAddress?: string; userAgent?: string },
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!doc) {
      throw new NotFoundException(`Document with id '${documentId}' not found.`);
    }

    // 1. Write audit_log_entry { action: 'access_requested' }
    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId: doc.organizationId,
        actorType: 'system',
        action: 'access_requested',
        resourceType: 'document',
        resourceId: doc.id,
        changes: {
          requesterEmail: body.requesterEmail,
          requesterName: body.requesterName,
          message: body.message || null,
        },
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
      },
    });

    // 2. notifyUser(document.ownerId, orgId, { eventType: 'access_requested', ... })
    if (this.notificationService) {
      await this.notificationService.notifyUser(doc.ownerId, doc.organizationId, {
        eventType: 'access_requested',
        title: 'Document Access Requested',
        body: `${body.requesterName || body.requesterEmail} has requested access to view '${doc.title}'.`,
        resourceType: 'document',
        resourceId: doc.id,
      });
    }

    // 3. Return 202 Accepted status
    return {
      status: 'accepted',
      message: 'Access request has been submitted to the document owner.',
    };
  }

  async updateDocumentSettings(
    organizationId: string,
    documentId: string,
    dto: UpdateDocumentSettingsDto,
  ) {
    const doc = await this.docRepo.findById(organizationId, documentId);
    if (!doc) {
      throw new NotFoundException(`Document with id '${documentId}' not found.`);
    }

    const expiresAt =
      dto.expiresInDays != null
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : dto.expiresInDays === null
          ? null
          : undefined;

    return this.docRepo.updateSettings(organizationId, documentId, {
      expiresAt,
      inactivityReminderDays: dto.inactivityReminderDays,
    });
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
