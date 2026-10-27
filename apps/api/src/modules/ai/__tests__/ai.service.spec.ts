import { AiService } from '../ai.service';
import { AiGateway } from '../gateway/ai.gateway';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AiDraftDto } from '@pactintel/shared-types';

describe('AiService Unit Tests (RULES AI-001, Invariant I-13 Rate Limiting)', () => {
  let service: AiService;
  let mockGateway: Partial<Record<keyof AiGateway, jest.Mock>>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';

  beforeEach(() => {
    mockGateway = {
      generate: jest.fn().mockResolvedValue({
        content: 'Drafted clause content',
        taskId: 'draft-section',
        tokensUsed: 150,
      }),
    };

    service = new AiService(mockGateway as unknown as AiGateway);
  });

  // Test 1: User limit (20 req/min) exceeded -> 429
  it('Test 1: User exceeding 20 requests per minute receives 429 Too Many Requests', async () => {
    const dto: AiDraftDto = {
      taskId: 'draft-section',
      input: { sectionTitle: 'Scope', documentType: 'MSA' },
    };

    // First 20 requests succeed
    for (let i = 0; i < 20; i++) {
      await service.generateDraft(orgId, userId, dto);
    }
    expect(mockGateway.generate).toHaveBeenCalledTimes(20);

    // 21st request from same user triggers 429
    try {
      await service.generateDraft(orgId, userId, dto);
      fail('Expected 429 HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('20 req/min'),
        }),
      );
    }

    // Verify 21st call never reached the gateway
    expect(mockGateway.generate).toHaveBeenCalledTimes(20);
  });

  // Test 2: Org limit (200 req/min) exceeded -> 429
  it('Test 2: Organization exceeding 200 requests per minute receives 429 Too Many Requests', async () => {
    const dto: AiDraftDto = {
      taskId: 'refine-text',
      input: { originalText: 'Paragraph to improve' },
    };

    const targetOrg = '99999999-9999-7999-8999-999999999999';

    // 10 different users making 20 requests each = 200 requests for this org
    for (let u = 0; u < 10; u++) {
      const uId = `user-batch-${u}`;
      for (let r = 0; r < 20; r++) {
        await service.generateDraft(targetOrg, uId, dto);
      }
    }
    expect(mockGateway.generate).toHaveBeenCalledTimes(200);

    // A new user in the same org attempts request 201
    const newUser = 'user-batch-overflow';
    try {
      await service.generateDraft(targetOrg, newUser, dto);
      fail('Expected 429 HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('200 req/min'),
        }),
      );
    }

    expect(mockGateway.generate).toHaveBeenCalledTimes(200);
  });

  // Test 3: Valid request passes to gateway and returns content
  it('Test 3: Valid request passes to gateway with correct context and returns response', async () => {
    const dto: AiDraftDto = {
      taskId: 'grammar-fix',
      input: { originalText: 'Their is an error here.' },
      documentId: 'doc-valid-1',
    };

    const result = await service.generateDraft(orgId, 'user-fresh', dto);

    expect(mockGateway.generate).toHaveBeenCalledWith(
      'grammar-fix',
      { originalText: 'Their is an error here.' },
      {
        userId: 'user-fresh',
        organizationId: orgId,
        documentId: 'doc-valid-1',
      },
    );

    expect(result).toEqual({
      content: 'Drafted clause content',
      taskId: 'draft-section',
      tokensUsed: 150,
    });
  });
});
