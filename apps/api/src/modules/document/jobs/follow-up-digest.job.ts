import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationService } from '../../notification/notification.service';
import { Queue, Worker } from 'bullmq';

@Injectable()
export class FollowUpDigestJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpDigestJob.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.REDIS_QUEUE_HOST === 'localhost-disabled') {
      return;
    }

    try {
      const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
      const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
      const connection = { host, port };

      this.queue = new Queue('follow-up-digest', { connection });

      // Daily recurrence at 8am UTC (RULE I-07)
      await this.queue.upsertJobScheduler(
        'follow-up-digest-daily',
        { pattern: '0 8 * * *' },
        { name: 'send-follow-up-digest', data: {} },
      );

      this.worker = new Worker(
        'follow-up-digest',
        async (_job) => {
          this.logger.log('[FollowUpDigestJob] Executing daily follow-up digest dispatch...');
          const count = await this.processFollowUpDigest();
          this.logger.log(
            `[FollowUpDigestJob] Completed. Sent digests to ${count} sales representatives.`,
          );
        },
        { connection },
      );

      this.worker.on('error', (err) => {
        this.logger.warn(`Follow-up digest worker warning: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not start follow-up digest queue: ${err.message}. Running in simulated mode.`,
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
   * Groups pending follow-up queue items by owner and dispatches a review digest.
   * RULE FOLLOW-001: Automated follow-up emails are NEVER sent without rep review.
   * Can be invoked directly in unit/integration tests or triggered by worker.
   */
  async processFollowUpDigest(now: Date = new Date()): Promise<number> {
    const pendingItems = await this.prisma.followUpQueue.findMany({
      where: {
        status: 'pending',
        scheduledFor: { lte: now },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      include: {
        document: {
          select: { id: true, title: true, slug: true, status: true, lastViewedAt: true },
        },
        owner: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (pendingItems.length === 0) return 0;

    // Group by owner
    const itemsByOwner = new Map<string, typeof pendingItems>();
    for (const item of pendingItems) {
      const list = itemsByOwner.get(item.ownerId) || [];
      list.push(item);
      itemsByOwner.set(item.ownerId, list);
    }

    let digestsSent = 0;
    for (const [ownerId, items] of itemsByOwner.entries()) {
      const owner = items[0]?.owner;
      if (!owner) continue;

      this.logger.log(
        `[FollowUpDigestJob] Dispatching follow-up review digest to ${owner.email} (${items.length} items needing attention)`,
      );

      const orgId = items[0]?.organizationId;

      if (this.notificationService && orgId) {
        await this.notificationService.notifyUser(ownerId, orgId, {
          eventType: 'follow_up_digest',
          title: `Daily Follow-up Digest: ${items.length} document(s) need attention`,
          body: `You have ${items.length} pending follow-up item(s) awaiting your review in the Follow-up Queue.`,
          resourceType: 'follow_up_queue',
          resourceId: ownerId,
          recipientEmail: owner.email,
        });
      }

      digestsSent++;
    }

    return digestsSent;
  }
}
