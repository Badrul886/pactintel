import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AiGateway } from './gateway/ai.gateway';
import { AiDraftDto, AiResponseDto } from '@pactintel/shared-types';
import Redis from 'ioredis';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private redisClient: Redis | null = null;
  // In-memory sliding window rate-limiting fallback
  private readonly memoryUserWindows = new Map<string, { count: number; expiresAt: number }>();
  private readonly memoryOrgWindows = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly gateway: AiGateway) {
    if (process.env.NODE_ENV !== 'test' && process.env.REDIS_QUEUE_HOST !== 'localhost-disabled') {
      try {
        const host = process.env.REDIS_QUEUE_HOST || '127.0.0.1';
        const port = parseInt(process.env.REDIS_QUEUE_PORT || '6379', 10);
        this.redisClient = new Redis({
          host,
          port,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      } catch {
        // Fallback to memory tracking
      }
    }
  }

  /**
   * Generates AI drafting or editing content via the centralized AiGateway.
   * Enforces user (20 req/min) and org (200 req/min) rate limits (Invariant I-13).
   */
  async generateDraft(
    organizationId: string,
    userId: string,
    dto: AiDraftDto,
  ): Promise<AiResponseDto> {
    // 1. Rate Limiting Check (Invariant I-13)
    await this.enforceRateLimits(organizationId, userId);

    // 2. Dispatch to AiGateway
    const result = await this.gateway.generate(dto.taskId, dto.input, {
      userId,
      organizationId,
      documentId: dto.documentId ?? undefined,
    });

    return result;
  }

  private async enforceRateLimits(organizationId: string, userId: string): Promise<void> {
    const userLimit = 20;
    const orgLimit = 200;
    const windowSec = 60;
    const now = Date.now();

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const userKey = `ai:ratelimit:user:${userId}`;
        const orgKey = `ai:ratelimit:org:${organizationId}`;

        const [userCount, orgCount] = await Promise.all([
          this.redisClient.incr(userKey),
          this.redisClient.incr(orgKey),
        ]);

        if (userCount === 1) await this.redisClient.expire(userKey, windowSec);
        if (orgCount === 1) await this.redisClient.expire(orgKey, windowSec);

        if (userCount > userLimit || orgCount > orgLimit) {
          throw new HttpException(
            {
              code: 'RATE_LIMIT_EXCEEDED',
              message:
                userCount > userLimit
                  ? "You've reached the AI limit (20 req/min). Try again in a minute."
                  : 'Organization AI limit reached (200 req/min). Try again in a minute.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return;
      } catch (err: any) {
        if (err instanceof HttpException) throw err;
        this.logger.warn(`Redis rate limit error, using memory fallback: ${err.message}`);
      }
    }

    // In-memory fallback
    const userEntry = this.memoryUserWindows.get(userId);
    if (!userEntry || now > userEntry.expiresAt) {
      this.memoryUserWindows.set(userId, { count: 1, expiresAt: now + windowSec * 1000 });
    } else {
      userEntry.count++;
      if (userEntry.count > userLimit) {
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: "You've reached the AI limit (20 req/min). Try again in a minute.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const orgEntry = this.memoryOrgWindows.get(organizationId);
    if (!orgEntry || now > orgEntry.expiresAt) {
      this.memoryOrgWindows.set(organizationId, { count: 1, expiresAt: now + windowSec * 1000 });
    } else {
      orgEntry.count++;
      if (orgEntry.count > orgLimit) {
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Organization AI limit reached (200 req/min). Try again in a minute.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }
}
