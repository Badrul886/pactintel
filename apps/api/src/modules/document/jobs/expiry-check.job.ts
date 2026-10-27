import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DocumentRepository } from '../document.repository';
import { DocumentOutboxService } from '../outbox/document-outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Queue, Worker } from 'bullmq';

@Injectable()
export class ExpiryCheckJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpiryCheckJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly docRepository: DocumentRepository,
    private readonly outbox: DocumentOutboxService,
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

      this.queue = new Queue('expiry-check', { connection });

      // Upsert recurring job scheduler (RULE I-07: BullMQ job scheduler, never @Cron)
      await this.queue.upsertJobScheduler(
        'document-expiry-check-hourly',
        { pattern: '0 * * * *' }, // Hourly cron pattern
        { name: 'check-document-expiry', data: {} },
      );

      this.worker = new Worker(
        'expiry-check',
        async (_job) => {
          this.logger.log(
            '[ExpiryCheckJob] Executing hourly check for document expiry & warnings...',
          );
          const result = await this.processExpiryCheck();
          this.logger.log(
            `[ExpiryCheckJob] Completed: ${result.warningsSent} warnings sent, ${result.expiredCount} documents expired.`,
          );
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Expiry check worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start expiry check queue: ${err.message}. Running in simulated mode.`,
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
   * Executes the hourly expiry and 24h warning check.
   * Can be invoked directly in unit/integration tests or triggered by worker.
   */
  async processExpiryCheck(
    now: Date = new Date(),
  ): Promise<{ warningsSent: number; expiredCount: number }> {
    const warningThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now

    // 1. Find documents expiring in next 24h (not yet warned)
    const expiringSoon = await this.docRepository.findExpiringSoon(warningThreshold, now);
    let warningsSent = 0;

    for (const doc of expiringSoon) {
      await this.prisma.$transaction(async (tx) => {
        // Emit outbox event
        await this.outbox.emit(tx, doc.organizationId, 'document.expiry_approaching', doc.id, {
          documentId: doc.id,
          expiresAt: doc.expiresAt,
          title: doc.title,
        });

        // Mark warning sent to prevent duplicate notifications
        await tx.document.update({
          where: { id: doc.id },
          data: { expiryWarningSentAt: now },
        });

        // Upsert follow-up queue item with reason='expiry_warning'
        const existingQueue = await tx.followUpQueue.findFirst({
          where: {
            documentId: doc.id,
            reason: 'expiry_warning',
            status: 'pending',
          },
        });

        if (!existingQueue) {
          await tx.followUpQueue.create({
            data: {
              id: generateId(),
              organizationId: doc.organizationId,
              documentId: doc.id,
              ownerId: doc.ownerId,
              scheduledFor: now,
              reason: 'expiry_warning',
              status: 'pending',
            },
          });
        }
      });
      warningsSent++;
    }

    // 2. Find documents that have passed expires_at (not yet expired)
    const expired = await this.docRepository.findJustExpired(now);
    let expiredCount = 0;

    for (const doc of expired) {
      await this.prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: doc.id },
          data: { status: 'expired' },
        });

        await this.outbox.emit(tx, doc.organizationId, 'document.expired', doc.id, {
          documentId: doc.id,
          title: doc.title,
          expiredAt: now,
        });
      });
      expiredCount++;
    }

    return { warningsSent, expiredCount };
  }
}
