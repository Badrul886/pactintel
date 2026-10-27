import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DocumentRepository } from '../document.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Queue, Worker } from 'bullmq';

@Injectable()
export class ReminderCheckJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderCheckJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly docRepository: DocumentRepository,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('reminder-check', { connection });

      // Daily recurrence at 9am UTC (RULE I-07)
      await this.queue.upsertJobScheduler(
        'inactivity-reminder-check-daily',
        { pattern: '0 9 * * *' },
        { name: 'check-inactivity-reminders', data: {} },
      );

      this.worker = new Worker(
        'reminder-check',
        async (_job) => {
          this.logger.log('[ReminderCheckJob] Executing daily inactivity reminder scan...');
          const count = await this.processInactivityReminders();
          this.logger.log(
            `[ReminderCheckJob] Completed. Enqueued ${count} follow-up review nudges.`,
          );
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Reminder check worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start reminder check queue: ${err.message}. Running in simulated mode.`,
      );
    }
  }

  async onModuleDestroy() {
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
    } catch {
      // ignore teardown errors
    }
  }

  /**
   * Scans for inactive documents and adds them to follow_up_queue for sales rep review.
   * RULE FOLLOW-001: Automated follow-ups are NEVER sent without rep review.
   * Can be invoked directly in unit/integration tests or triggered by worker.
   */
  async processInactivityReminders(now: Date = new Date()): Promise<number> {
    const inactiveDocs = await this.docRepository.findInactiveDocuments(now);
    let enqueuedCount = 0;

    for (const doc of inactiveDocs) {
      // Deduplicate: check if a pending follow-up already exists for this document and reason
      const existingQueue = await this.prisma.followUpQueue.findFirst({
        where: {
          documentId: doc.id,
          reason: 'inactivity',
          status: 'pending',
        },
      });

      if (!existingQueue) {
        await this.prisma.followUpQueue.create({
          data: {
            id: generateId(),
            organizationId: doc.organizationId,
            documentId: doc.id,
            ownerId: doc.ownerId,
            scheduledFor: now,
            reason: 'inactivity',
            status: 'pending',
          },
        });
        enqueuedCount++;
      }
    }

    return enqueuedCount;
  }
}
