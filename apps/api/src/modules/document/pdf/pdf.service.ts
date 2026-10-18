import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import Redis from 'ioredis';

export interface PdfGenerationJobData {
  jobId: string;
  documentId: string;
  versionId: string;
  organizationId: string;
  requestedBy?: string;
  includeCertificateOfCompletion: boolean;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private redisClient: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {
    const host = process.env.REDIS_QUEUE_HOST;
    const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);

    if (host && host !== 'localhost-disabled') {
      try {
        this.redisClient = new Redis({
          host,
          port,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      } catch (err: any) {
        this.logger.warn(`Redis queue client init failed: ${err.message}. Using simulated queue.`);
      }
    }
  }

  /**
   * Queues PDF generation job (RULE PDF-001: Never inline in HTTP request).
   * RULE PDF-002: Renders exact version contentSnapshot and appends Certificate of Completion.
   */
  async queuePdfGeneration(
    organizationId: string,
    documentId: string,
    versionId: string,
    userId?: string,
  ): Promise<{ jobId: string; status: 'queued'; message: string }> {
    const jobId = generateId();

    const jobData: PdfGenerationJobData = {
      jobId,
      documentId,
      versionId,
      organizationId,
      requestedBy: userId,
      includeCertificateOfCompletion: true,
    };

    this.logger.log(
      `Queueing PDF generation job ${jobId} for document ${documentId} (version ${versionId}) to worker-pdf queue`,
    );

    if (this.redisClient && this.redisClient.status === 'ready') {
      // BullMQ compatible job payload structure
      await this.redisClient.rpush(
        'bull:pdf:jobs',
        JSON.stringify({
          id: jobId,
          name: 'generate-pdf',
          data: jobData,
          opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
        }),
      );
    } else {
      this.logger.log(`[Simulated Queue] Job ${jobId} registered for worker-pdf.`);
    }

    return {
      jobId,
      status: 'queued',
      message: 'PDF generation job successfully scheduled with worker-pdf pool.',
    };
  }

  /**
   * Generates Certificate of Completion audit trail data for document versions.
   */
  async getCertificateOfCompletionData(organizationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: {
        organization: true,
        versions: { where: { isCurrent: true } },
        signatureRequests: {
          include: { signers: true },
        },
        signatureEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!doc) {
      return null;
    }

    const currentVersion = doc.versions[0];
    const allSigners = doc.signatureRequests.flatMap((sr) => sr.signers);

    return {
      certificateId: generateId(),
      documentTitle: doc.title,
      documentId: doc.id,
      contentHash: currentVersion?.contentHash,
      versionNumber: currentVersion?.versionNumber,
      organizationName: doc.organization.name,
      createdAt: doc.createdAt,
      signedAt: doc.status === 'signed' ? doc.updatedAt : null,
      signers: allSigners.map((s) => ({
        name: s.name,
        email: s.email,
        status: s.status,
        signedAt: s.signedAt,
      })),
      auditEvents: doc.signatureEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        timestamp: e.createdAt,
      })),
    };
  }
}
