import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../ai/gateway/ai.gateway';
import { ObligationService, ExtractedObligationItem } from '../obligation.service';
import { CounterpartyService } from '../counterparty.service';
import { PortfolioRepository } from '../portfolio.repository';
import { SEARCH_PORT, SearchPort } from '../ports/search.port';
import { OCR_PORT, OcrPort } from '../ports/ocr.port';

export interface DocumentExtractionJobData {
  documentId: string;
  organizationId: string;
  userId: string;
  versionNumber?: number;
  rawText?: string;
  fileBufferBase64?: string;
  mimeType?: string;
}

@Injectable()
export class DocumentExtractionJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentExtractionJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGateway,
    private readonly obligationService: ObligationService,
    private readonly counterpartyService: CounterpartyService,
    private readonly portfolioRepository: PortfolioRepository,
    @Inject(SEARCH_PORT) private readonly searchPort: SearchPort,
    @Inject(OCR_PORT) private readonly ocrPort: OcrPort,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('document-extraction', { connection });

      this.worker = new Worker(
        'document-extraction',
        async (job) => {
          this.logger.log(
            `[DocumentExtractionJob] Processing extraction for doc ${job.data.documentId}...`,
          );
          await this.processExtraction(job.data);
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Document extraction worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start document extraction queue: ${err.message}. Running in simulated mode.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      // ignore
    }
  }

  async enqueue(data: DocumentExtractionJobData) {
    if (this.queue) {
      return this.queue.add('extract-document', data);
    }
    // Synchronous execution fallback for test or offline mode
    return this.processExtraction(data);
  }

  /**
   * Core pipeline:
   * 1. Extract plain text (from buffer via OCR if scanned PDF/image, or latest version content snapshot)
   * 2. Query custom extraction fields for tenant
   * 3. Invoke AiGateway ('document-extraction')
   * 4. Link counterparty
   * 5. Record obligations (Enforcing RULE PORT-001)
   * 6. Sync SearchPort index
   */
  async processExtraction(data: DocumentExtractionJobData) {
    const { documentId, organizationId, userId, versionNumber } = data;

    // 1. Fetch document & latest version
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!doc) {
      this.logger.error(`Document ${documentId} not found in org ${organizationId}`);
      return;
    }

    const latestVersion = doc.versions[0];
    const versionId = latestVersion?.id || documentId;

    let documentText = data.rawText || '';

    // Check if buffer provided for OCR
    if (data.fileBufferBase64) {
      const buf = Buffer.from(data.fileBufferBase64, 'base64');
      const ocrRes = await this.ocrPort.extractText(buf, data.mimeType || 'application/pdf');
      documentText = ocrRes.text;
    }

    if (!documentText) {
      if (latestVersion?.contentSnapshot) {
        documentText =
          typeof latestVersion.contentSnapshot === 'string'
            ? latestVersion.contentSnapshot
            : JSON.stringify(latestVersion.contentSnapshot);
      } else {
        documentText = doc.title;
      }
    }

    // 2. Fetch custom extraction fields
    const customFields = await this.portfolioRepository.findCustomFields(organizationId);

    // 3. Invoke AI Gateway
    let aiResponse;
    try {
      aiResponse = await this.aiGateway.generate(
        'document-extraction',
        {
          documentText,
          customFields: customFields.map((f) => ({
            key: f.fieldName,
            label: f.fieldName,
            type: f.fieldType,
            prompt: f.description,
          })),
        },
        {
          userId,
          organizationId,
          documentId,
        },
      );
    } catch (err: any) {
      this.logger.error(`AI Extraction failed for doc ${documentId}: ${err.message}`);
      return;
    }

    let parsedResult: any = {};
    try {
      parsedResult = JSON.parse(aiResponse.content);
    } catch {
      const match = aiResponse.content.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        parsedResult = JSON.parse(match[1]);
      }
    }

    // 4. Counterparty Normalization & Link
    let counterpartyName = parsedResult.counterparty?.name;
    if (counterpartyName) {
      const cp = await this.counterpartyService.findOrCreateByName(
        organizationId,
        counterpartyName,
        parsedResult.counterparty.domain,
        parsedResult.counterparty.aliases || [],
      );
      await this.counterpartyService.linkDocumentToCounterparty(documentId, cp.id, organizationId);
      counterpartyName = cp.canonicalName;
    }

    // 5. Obligations Recording (RULE PORT-001 enforced inside ObligationService)
    const rawObligations = Array.isArray(parsedResult.obligations) ? parsedResult.obligations : [];
    const formattedObligations: ExtractedObligationItem[] = rawObligations.map((o: any) => ({
      fieldName: o.fieldKey || o.fieldName || o.title || 'obligation',
      fieldValue: o.fieldValue || o.value,
      confidenceScore: typeof o.confidenceScore === 'number' ? o.confidenceScore : 0.85,
      sourceSnippet: o.sourceSnippet,
      fieldValueDate: o.dueDate ? new Date(o.dueDate) : undefined,
      fieldType: o.fieldType || 'text',
      extractionMethod: 'ai_llm',
      isCustomField: false,
    }));

    if (formattedObligations.length > 0) {
      await this.obligationService.recordExtractedObligations(
        documentId,
        versionId,
        organizationId,
        formattedObligations,
        versionNumber || latestVersion?.versionNumber,
      );
    }

    // 6. Index document into SearchPort
    try {
      await this.searchPort.indexDocument({
        id: doc.id,
        organizationId,
        title: doc.title,
        content: documentText,
        counterpartyName,
        status: doc.status,
        type: doc.type,
      });
    } catch (err: any) {
      this.logger.warn(`Search indexing failed for doc ${documentId}: ${err.message}`);
    }

    this.logger.log(`[DocumentExtractionJob] Completed extraction for document ${documentId}`);
    return { success: true, obligationsCount: formattedObligations.length, counterpartyName };
  }
}
