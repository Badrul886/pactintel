import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { generateId } from '@pactintel/shared-utils';

export interface UserSessionData {
  sessionId: string;
  userId: string;
  organizationId: string;
  email: string;
  role: string;
  createdAt: number;
  lastActiveAt: number;
  absoluteExpiry: number;
}

const INACTIVITY_TTL_SECONDS = 86400; // 24 hours
const ABSOLUTE_MAX_TTL_MS = 7 * 86400 * 1000; // 7 days

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private redisClient: Redis | null = null;
  private readonly memoryStore = new Map<string, { data: UserSessionData; expiresAt: number }>();
  private readonly userSessionsMemory = new Map<string, Set<string>>();

  onModuleInit() {
    const host = process.env.REDIS_SESSION_HOST;
    const port = parseInt(process.env.REDIS_SESSION_PORT || '6380', 10);

    if (host && host !== 'localhost-disabled') {
      try {
        this.redisClient = new Redis({
          host,
          port,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });

        this.redisClient.on('error', (err) => {
          this.logger.warn(
            `Redis session store error: ${err.message}. Falling back to memory store.`,
          );
        });
      } catch (err: any) {
        this.logger.warn(`Failed to initialize Redis client: ${err.message}. Using memory store.`);
      }
    } else {
      this.logger.log('REDIS_SESSION_HOST not configured. Utilizing fast in-memory session store.');
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => {});
    }
  }

  /**
   * Creates a new server-side session.
   * TTL: 24h sliding inactivity, 7d absolute max.
   */
  async createSession(payload: {
    userId: string;
    organizationId: string;
    email: string;
    role: string;
  }): Promise<string> {
    const sessionId = generateId();
    const now = Date.now();

    const session: UserSessionData = {
      sessionId,
      userId: payload.userId,
      organizationId: payload.organizationId,
      email: payload.email,
      role: payload.role,
      createdAt: now,
      lastActiveAt: now,
      absoluteExpiry: now + ABSOLUTE_MAX_TTL_MS,
    };

    if (this.redisClient && this.redisClient.status === 'ready') {
      const pipeline = this.redisClient.pipeline();
      pipeline.set(`sess:${sessionId}`, JSON.stringify(session), 'EX', INACTIVITY_TTL_SECONDS);
      pipeline.sadd(`user:sessions:${payload.userId}`, sessionId);
      pipeline.expire(`user:sessions:${payload.userId}`, INACTIVITY_TTL_SECONDS * 7);
      await pipeline.exec();
    } else {
      this.memoryStore.set(sessionId, {
        data: session,
        expiresAt: now + INACTIVITY_TTL_SECONDS * 1000,
      });

      if (!this.userSessionsMemory.has(payload.userId)) {
        this.userSessionsMemory.set(payload.userId, new Set());
      }
      this.userSessionsMemory.get(payload.userId)!.add(sessionId);
    }

    return sessionId;
  }

  /**
   * Retrieves and refreshes a session.
   */
  async getSession(sessionId: string): Promise<UserSessionData | null> {
    const now = Date.now();

    if (this.redisClient && this.redisClient.status === 'ready') {
      const raw = await this.redisClient.get(`sess:${sessionId}`);
      if (!raw) return null;

      try {
        const session: UserSessionData = JSON.parse(raw);
        if (now > session.absoluteExpiry) {
          await this.destroySession(sessionId);
          return null;
        }

        // Refresh 24h sliding inactivity TTL
        session.lastActiveAt = now;
        await this.redisClient.set(
          `sess:${sessionId}`,
          JSON.stringify(session),
          'EX',
          INACTIVITY_TTL_SECONDS,
        );

        return session;
      } catch {
        return null;
      }
    } else {
      const record = this.memoryStore.get(sessionId);
      if (!record) return null;

      if (now > record.expiresAt || now > record.data.absoluteExpiry) {
        this.memoryStore.delete(sessionId);
        return null;
      }

      record.data.lastActiveAt = now;
      record.expiresAt = now + INACTIVITY_TTL_SECONDS * 1000;
      return record.data;
    }
  }

  /**
   * Destroys a single session immediately (RULE AUTH-001).
   */
  async destroySession(sessionId: string): Promise<void> {
    if (this.redisClient && this.redisClient.status === 'ready') {
      const raw = await this.redisClient.get(`sess:${sessionId}`);
      if (raw) {
        try {
          const session: UserSessionData = JSON.parse(raw);
          await this.redisClient.srem(`user:sessions:${session.userId}`, sessionId);
        } catch {}
      }
      await this.redisClient.del(`sess:${sessionId}`);
    } else {
      const record = this.memoryStore.get(sessionId);
      if (record) {
        const userSet = this.userSessionsMemory.get(record.data.userId);
        if (userSet) {
          userSet.delete(sessionId);
        }
        this.memoryStore.delete(sessionId);
      }
    }
  }

  /**
   * Invalidate ALL sessions for a user on security events (RULE AUTH-001).
   */
  async destroyAllUserSessions(userId: string): Promise<void> {
    this.logger.log(`Invalidating ALL sessions for user ${userId} (RULE AUTH-001)`);

    if (this.redisClient && this.redisClient.status === 'ready') {
      const sessionIds = await this.redisClient.smembers(`user:sessions:${userId}`);
      if (sessionIds.length > 0) {
        const pipeline = this.redisClient.pipeline();
        for (const sid of sessionIds) {
          pipeline.del(`sess:${sid}`);
        }
        pipeline.del(`user:sessions:${userId}`);
        await pipeline.exec();
      }
    } else {
      const sessionIds = this.userSessionsMemory.get(userId);
      if (sessionIds) {
        for (const sid of sessionIds) {
          this.memoryStore.delete(sid);
        }
        this.userSessionsMemory.delete(userId);
      }
    }
  }
}
