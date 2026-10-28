import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AiGateway } from './gateway/ai.gateway';
import { UrlToDraftDto, UrlToDraftResponseDto } from '@pactintel/shared-types';
import { fetchSafeUrl } from './utils/ssrf-guard.util';
import Redis from 'ioredis';

@Injectable()
export class UrlToDraftService {
  private readonly logger = new Logger(UrlToDraftService.name);
  private redisClient: Redis | null = null;
  // In-memory sliding window rate-limiting fallback (IP -> { count, expiresAt })
  private readonly memoryIpWindows = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly aiGateway: AiGateway) {
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
        // Fallback to memory
      }
    }
  }

  /**
   * Generates a commercial proposal from a public URL.
   * Guarantees:
   * 1. 3 requests per IP per hour rate limit (Invariant I-13).
   * 2. SSRF-hardened fetching via ssrf-guard.util.
   * 3. ZERO database writes (ephemeral generation only).
   */
  async generateFromUrl(ip: string, dto: UrlToDraftDto): Promise<UrlToDraftResponseDto> {
    // 1. Rate Limiting Check: 3 req / hour per IP
    await this.enforceIpRateLimit(ip);

    // 2. SSRF-Hardened URL Fetching
    const fetchResult = await fetchSafeUrl(dto.url, 5000, 2 * 1024 * 1024);

    // 3. HTML Content Extraction & Cleaning
    const extracted = this.extractContentFromHtml(fetchResult.text);

    // 4. AI Generation via AiGateway (ZERO database writes)
    const aiResult = await this.aiGateway.generatePublic('url-to-draft', {
      url: dto.url,
      pageTitle: extracted.title,
      metaDescription: extracted.metaDescription,
      scrapedContent: extracted.bodyText,
    });

    // 5. Parse and assemble response
    return this.parseProposalOutput(aiResult.content, extracted.title, aiResult.tokensUsed);
  }

  async enforceIpRateLimit(ip: string): Promise<void> {
    const limit = 3;
    const windowSec = 3600; // 1 hour
    const now = Date.now();

    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const key = `ai:ratelimit:ip:${ip}`;
        const count = await this.redisClient.incr(key);
        if (count === 1) {
          await this.redisClient.expire(key, windowSec);
        }

        if (count > limit) {
          throw new HttpException(
            {
              code: 'RATE_LIMIT_EXCEEDED',
              message:
                'You have reached the free limit (3 proposals per hour). Sign up to generate unlimited proposals with PactIntel.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return;
      } catch (err: any) {
        if (err instanceof HttpException) throw err;
        this.logger.warn(`Redis IP rate limit error, using memory fallback: ${err.message}`);
      }
    }

    // In-memory fallback
    const entry = this.memoryIpWindows.get(ip);
    if (!entry || now > entry.expiresAt) {
      this.memoryIpWindows.set(ip, { count: 1, expiresAt: now + windowSec * 1000 });
    } else {
      entry.count++;
      if (entry.count > limit) {
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message:
              'You have reached the free limit (3 proposals per hour). Sign up to generate unlimited proposals with PactIntel.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private extractContentFromHtml(html: string): {
    title: string;
    metaDescription: string;
    bodyText: string;
  } {
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/\s+/g, ' ').trim();
    }

    let metaDescription = '';
    const metaMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    if (metaMatch) {
      metaDescription = metaMatch[1].trim();
    }

    // Strip scripts, styles, svg, and HTML tags
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Cap text to avoid overwhelming prompt
    const bodyText = cleaned.slice(0, 4000);

    return { title, metaDescription, bodyText };
  }

  private parseProposalOutput(
    raw: string,
    fallbackTitle: string,
    tokensUsed: number,
  ): UrlToDraftResponseDto {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.content) {
        return {
          title: parsed.title || `Commercial Proposal: ${fallbackTitle || 'Enterprise Services'}`,
          summary: parsed.summary || 'Commercial proposal generated from website overview.',
          content: parsed.content,
          tokensUsed,
        };
      }
    } catch {
      // Fallback formatting
    }

    return {
      title: `Commercial Proposal: ${fallbackTitle || 'Enterprise Services'}`,
      summary: 'Commercial proposal generated from website overview.',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [
              {
                type: 'text',
                text: `Commercial Proposal: ${fallbackTitle || 'Enterprise Services'}`,
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: raw }],
          },
        ],
      },
      tokensUsed,
    };
  }
}
