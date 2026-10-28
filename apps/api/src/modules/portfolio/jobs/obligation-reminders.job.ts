import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';

@Injectable()
export class ObligationRemindersJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ObligationRemindersJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('obligation-reminders', { connection });

      // Daily 8:00 AM job scheduler (RULE I-07: BullMQ job scheduler, never @Cron)
      await this.queue.upsertJobScheduler(
        'obligation-reminders-daily',
        { pattern: '0 8 * * *' },
        { name: 'check-obligation-milestones', data: {} },
      );

      this.worker = new Worker(
        'obligation-reminders',
        async (_job) => {
          this.logger.log(
            '[ObligationRemindersJob] Checking upcoming obligation milestones (30d, 7d, 1d)...',
          );
          const count = await this.checkMilestones();
          this.logger.log(`[ObligationRemindersJob] Finished scan. Emitted ${count} reminders.`);
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Obligation reminders worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start obligation reminders queue: ${err.message}. Running in simulated mode.`,
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

  /**
   * Scan for obligations due in 30 days, 7 days, or 1 day.
   * Emits transactional outbox events (RULE I-06).
   */
  async checkMilestones(): Promise<number> {
    const now = new Date();
    const milestones = [
      { days: 30, windowStart: 29.5, windowEnd: 30.5 },
      { days: 7, windowStart: 6.5, windowEnd: 7.5 },
      { days: 1, windowStart: 0, windowEnd: 1.5 },
    ];

    let totalEmitted = 0;

    for (const m of milestones) {
      const start = new Date(now.getTime() + m.windowStart * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() + m.windowEnd * 24 * 60 * 60 * 1000);

      const obligations = await this.prisma.obligationRecord.findMany({
        where: {
          fieldValueDate: { gte: start, lte: end },
        },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              organizationId: true,
            },
          },
        },
      });

      for (const ob of obligations) {
        const recipientId = ob.document.ownerId;
        const payload = {
          obligationId: ob.id,
          fieldName: ob.fieldName,
          fieldValue: ob.fieldValue,
          documentId: ob.documentId,
          documentTitle: ob.document.title,
          dueDate: ob.fieldValueDate?.toISOString(),
          daysRemaining: m.days,
          recipientId,
        };

        // Emit through transactional outbox (RULE I-06)
        await this.prisma.outboxEvent.create({
          data: {
            id: generateId(),
            organizationId: ob.organizationId,
            eventType: 'portfolio.obligation.reminder',
            aggregateType: 'ObligationRecord',
            aggregateId: ob.id,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });

        totalEmitted++;
      }
    }

    return totalEmitted;
  }
}
