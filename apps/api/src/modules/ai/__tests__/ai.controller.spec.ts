import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from '../ai.controller';
import { AiService } from '../ai.service';
import { GuidedProposalService } from '../guided-proposal.service';
import { UrlToDraftService } from '../url-to-draft.service';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { CaslGuard } from '../../../common/guards/casl.guard';

describe('AiController Unit Tests', () => {
  let controller: AiController;
  let mockAiService: any;
  let mockGuidedProposalService: any;
  let mockUrlToDraftService: any;
  let mockCls: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';

  beforeEach(async () => {
    mockAiService = {
      generateDraft: jest.fn().mockResolvedValue({
        content: 'Draft content',
        taskId: 'draft-section',
        tokensUsed: 100,
      }),
    };

    mockGuidedProposalService = {
      assembleProposal: jest.fn().mockResolvedValue({
        title: 'Acme Proposal',
        content: { type: 'doc', content: [] },
        crmDataUsed: {},
        tokensUsed: 200,
      }),
    };

    mockUrlToDraftService = {
      generateFromUrl: jest.fn().mockResolvedValue({
        title: 'Acme Proposal',
        summary: 'Executive Summary',
        content: { type: 'doc', content: [] },
        tokensUsed: 150,
      }),
    };

    mockCls = {
      get: jest.fn((key: string) => {
        if (key === 'organizationId') return orgId;
        if (key === 'userId') return userId;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: mockAiService },
        { provide: GuidedProposalService, useValue: mockGuidedProposalService },
        { provide: UrlToDraftService, useValue: mockUrlToDraftService },
        { provide: ClsService, useValue: mockCls },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaslGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
  });

  it('assembleProposal forwards call to guidedProposalService with orgId and userId from CLS', async () => {
    const dto = {
      templateId: '33333333-3333-7333-8333-333333333333',
      answers: { client_name: 'Acme' },
    };

    const res = await controller.assembleProposal(dto);

    expect(mockGuidedProposalService.assembleProposal).toHaveBeenCalledWith(orgId, userId, dto);
    expect(res.title).toBe('Acme Proposal');
  });

  it('urlToDraft extracts IP from request and calls urlToDraftService', async () => {
    const dto = { url: 'https://example.com' };
    const mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' },
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
    } as any;

    const res = await controller.urlToDraft(dto, mockReq);

    expect(mockUrlToDraftService.generateFromUrl).toHaveBeenCalledWith('203.0.113.195', dto);
    expect(res.summary).toBe('Executive Summary');
  });
});
