import { Controller, Get, Post, Body, Param, Req, UsePipes } from '@nestjs/common';
import { Request } from 'express';
import { ClickwrapService } from '../clickwrap.service';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  RecordClickwrapAcceptanceDtoSchema,
  RecordClickwrapAcceptanceDto,
} from '@pactintel/shared-types';

@Controller('api/v1/public/clickwrap')
export class ClickwrapWidgetController {
  constructor(private readonly service: ClickwrapService) {}

  @Get(':slug')
  async getPublicClickwrap(@Param('slug') slug: string) {
    return this.service.getPublicClickwrap(slug);
  }

  @Post(':slug/accept')
  @UsePipes(new ZodValidationPipe(RecordClickwrapAcceptanceDtoSchema))
  async acceptClickwrap(
    @Param('slug') slug: string,
    @Body() dto: RecordClickwrapAcceptanceDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.service.recordAcceptance(slug, dto, {
      ipAddress,
      userAgent,
    });
  }
}
