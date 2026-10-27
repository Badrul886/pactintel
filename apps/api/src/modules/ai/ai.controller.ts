import { Controller, Post, Body, UseGuards, UsePipes, HttpCode, HttpStatus } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiDraftDto, AiDraftDtoSchema, AiResponseDto } from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
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
}
