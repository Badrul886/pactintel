import {
  Controller,
  Post,
  Body,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AiService } from './ai.service';
import { GuidedProposalService } from './guided-proposal.service';
import { UrlToDraftService } from './url-to-draft.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  AiDraftDto,
  AiDraftDtoSchema,
  AiResponseDto,
  AssembleProposalDto,
  AssembleProposalDtoSchema,
  AssembledProposalResponseDto,
  UrlToDraftDto,
  UrlToDraftDtoSchema,
  UrlToDraftResponseDto,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly guidedProposalService: GuidedProposalService,
    private readonly urlToDraftService: UrlToDraftService,
    private readonly cls: ClsService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'use', subject: 'AiFeature' })
  @UsePipes(new ZodValidationPipe(AiDraftDtoSchema))
  async generate(@Body() dto: AiDraftDto): Promise<AiResponseDto> {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.aiService.generateDraft(orgId, userId, dto);
  }

  /**
   * Guided AI Proposal Assembly endpoint.
   * Authenticated, permission-guarded by CaslGuard.
   */
  @Post('guided-proposal/assemble')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'use', subject: 'AiFeature' })
  @UsePipes(new ZodValidationPipe(AssembleProposalDtoSchema))
  async assembleProposal(@Body() dto: AssembleProposalDto): Promise<AssembledProposalResponseDto> {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.guidedProposalService.assembleProposal(orgId, userId, dto);
  }

  /**
   * Public URL-to-Draft generation tool.
   * Unauthenticated, rate-limited by IP (3 req/hr), SSRF-hardened, zero DB writes.
   */
  @Post('url-to-draft')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(UrlToDraftDtoSchema))
  async urlToDraft(
    @Body() dto: UrlToDraftDto,
    @Req() req: Request,
  ): Promise<UrlToDraftResponseDto> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      '127.0.0.1';

    return this.urlToDraftService.generateFromUrl(ip, dto);
  }
}
