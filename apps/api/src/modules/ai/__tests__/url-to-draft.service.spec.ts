import { UrlToDraftService } from '../url-to-draft.service';
import { AiGateway } from '../gateway/ai.gateway';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as ssrfModule from '../utils/ssrf-guard.util';

describe('UrlToDraftService Unit Tests (Sprint 3.4)', () => {
  let service: UrlToDraftService;
  let mockAiGateway: any;

  beforeEach(() => {
    mockAiGateway = {
      generatePublic: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Commercial Proposal: Cloud Solutions',
          summary: 'Executive overview tailored to modern web scale.',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text: 'Commercial Proposal: Cloud Solutions' }],
              },
            ],
          },
        }),
        taskId: 'url-to-draft',
        tokensUsed: 180,
      }),
    };

    jest.spyOn(ssrfModule, 'fetchSafeUrl').mockResolvedValue({
      text: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Acme Cloud Platforms - Enterprise Infrastructure</title>
            <meta name="description" content="Next-generation cloud reliability and distributed computing.">
          </head>
          <body>
            <h1>Empowering Modern Global Scale</h1>
            <p>We provide robust multi-region architecture and database high-availability.</p>
          </body>
        </html>
      `,
      status: 200,
      contentType: 'text/html',
    });

    service = new UrlToDraftService(mockAiGateway as unknown as AiGateway);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Test 1: Rate limiting - 4th request in an hour returns 429
  it('enforces rate limit of 3 requests per hour per IP (4th request returns 429)', async () => {
    const testIp = '198.51.100.42';
    const dto = { url: 'https://example.com' };

    // First 3 requests succeed
    for (let i = 0; i < 3; i++) {
      const res = await service.generateFromUrl(testIp, dto);
      expect(res).toBeDefined();
    }
    expect(mockAiGateway.generatePublic).toHaveBeenCalledTimes(3);

    // 4th request from same IP throws 429 Too Many Requests
    try {
      await service.generateFromUrl(testIp, dto);
      fail('Expected 429 HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('3 proposals per hour'),
        }),
      );
    }

    // Verify 4th request never called the AI Gateway
    expect(mockAiGateway.generatePublic).toHaveBeenCalledTimes(3);
  });

  // Test 2: urlToDraft does NOT write scraped content to any database table
  it('does NOT write scraped content or generated draft to any database table (ephemeral only)', async () => {
    const testIp = '198.51.100.99';
    const dto = { url: 'https://example.com/pricing' };

    const result = await service.generateFromUrl(testIp, dto);

    expect(result).toBeDefined();
    expect(result.title).toBe('Commercial Proposal: Cloud Solutions');
    expect(result.summary).toBe('Executive overview tailored to modern web scale.');
    expect(result.tokensUsed).toBe(180);

    // Verify that UrlToDraftService does not even possess a Prisma dependency
    expect((service as any).prisma).toBeUndefined();
  });

  // Test 3: Dispatches to AiGateway with taskId 'url-to-draft'
  it('calls AiGateway.generatePublic with url-to-draft task ID and extracted context', async () => {
    const testIp = '198.51.100.105';
    const dto = { url: 'https://enterprise-saas.com' };

    await service.generateFromUrl(testIp, dto);

    expect(mockAiGateway.generatePublic).toHaveBeenCalledWith(
      'url-to-draft',
      expect.objectContaining({
        url: 'https://enterprise-saas.com',
        pageTitle: 'Acme Cloud Platforms - Enterprise Infrastructure',
        metaDescription: 'Next-generation cloud reliability and distributed computing.',
        scrapedContent: expect.stringContaining('Empowering Modern Global Scale'),
      }),
    );
  });
});
