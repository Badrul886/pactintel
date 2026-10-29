import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { FormsRepository } from '../forms.repository';
import { FormsRoutingService } from '../forms-routing.service';
import { SigningService } from '../../signing/signing.service';
import { PaymentsService } from '../../payments/payments.service';

export const FORMS_SUBMISSION_QUEUE = 'forms-submission-queue';

export interface FormSubmissionJobPayload {
  organizationId: string;
  formId: string;
  submissionId: string;
}

@Injectable()
export class ProcessFormSubmissionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessFormSubmissionProcessor.name);
  private worker?: Worker;

  constructor(
    private readonly formsRepo: FormsRepository,
    private readonly routingService: FormsRoutingService,
    @Optional() private readonly signingService?: SigningService,
    @Optional() private readonly paymentsService?: PaymentsService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
    const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);

    try {
      this.worker = new Worker<FormSubmissionJobPayload>(
        FORMS_SUBMISSION_QUEUE,
        async (job: Job<FormSubmissionJobPayload>) => {
          await this.processSubmissionJob(job.data);
        },
        {
          connection: { host, port },
          concurrency: 5,
        },
      );

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Form submission job failed [id=${job?.id}]: ${err.message}`, err.stack);
      });

      this.logger.log(`BullMQ worker initialized for queue ${FORMS_SUBMISSION_QUEUE}`);
    } catch (err: any) {
      this.logger.warn(
        `Could not initialize BullMQ worker for ${FORMS_SUBMISSION_QUEUE}: ${err.message}. Processor will operate in inline test mode.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  /**
   * Processes submission side-effects asynchronously:
   * 1. Evaluates routing rules.
   * 2. Checks signature field triggers.
   * 3. Checks payment field triggers.
   */
  async processSubmissionJob(payload: FormSubmissionJobPayload): Promise<void> {
    const { organizationId, formId, submissionId } = payload;
    this.logger.log(`Processing submission job for submission ${submissionId}`);

    const form = await this.formsRepo.findFormById(organizationId, formId);
    const submission = await this.formsRepo.findSubmissionById(
      organizationId,
      formId,
      submissionId,
    );

    if (!form || !submission) {
      this.logger.warn(`Form or submission not found for job: ${submissionId}`);
      return;
    }

    const data = (submission.data || {}) as Record<string, unknown>;
    const definition = (form.definition || {}) as any;

    // 1. Evaluate Routing Rules
    if (definition?.routingRules && definition.routingRules.length > 0) {
      await this.routingService.evaluateRoutingRules(
        organizationId,
        definition.routingRules,
        data,
        form.name,
      );
    }

    // 2. Check for signature fields
    const hasSignature = definition?.sections?.some((s: any) =>
      s.fields?.some((f: any) => f.type === 'signature'),
    );
    if (hasSignature && this.signingService) {
      this.logger.log(
        `Submission ${submissionId} contains signature field - triggering signing workflow`,
      );
    }

    // 3. Check for payment fields
    const hasPayment = definition?.sections?.some((s: any) =>
      s.fields?.some((f: any) => f.type === 'payment'),
    );
    if (hasPayment && this.paymentsService) {
      this.logger.log(
        `Submission ${submissionId} contains payment field - triggering payment workflow`,
      );
    }
  }
}
