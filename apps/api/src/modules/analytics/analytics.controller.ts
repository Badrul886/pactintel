import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BatchSectionEventsDto } from './dto/section-events.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import {
  DocumentAnalyticsSummary,
  SectionAnalyticsSummary,
  DocumentAnalyticsFullResponse,
} from '@pactintel/shared-types';

@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * 1x1 Transparent Tracking Pixel (NO auth).
   * GET /api/v1/t/:documentSlug.gif
   */
  @Get('api/v1/t/:documentSlug.gif')
  async getTrackingPixel(
    @Param('documentSlug') documentSlug: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookieSessionId = req.cookies ? req.cookies['v_session'] : undefined;
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const country = (req.headers['cf-ipcountry'] as string) || undefined;
    const userAgent = req.headers['user-agent'] as string | undefined;

    const result = await this.analyticsService.recordPixelView(
      documentSlug,
      cookieSessionId,
      ip,
      country,
      undefined,
      userAgent,
    );

    // If new session, set HttpOnly, SameSite=None, Secure cookie (MaxAge: 30 days)
    if (!cookieSessionId) {
      res.cookie('v_session', result.sessionId, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 2592000000, // 30 days in ms
      });
    }

    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': result.gifBuffer.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.status(HttpStatus.OK).send(result.gifBuffer);
  }

  /**
   * Client telemetry heartbeat (NO auth).
   * POST /api/v1/analytics/heartbeat
   */
  @Post('api/v1/analytics/heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async postHeartbeat(@Body() body: HeartbeatDto) {
    await this.analyticsService.recordHeartbeat(body.documentSlug, body.sessionId, body.durationMs);
  }

  /**
   * Batch Section-Level Engagement Events (Sprint 2.1 — NO auth, validated by documentSlug + sessionId).
   * POST /api/v1/analytics/section-events
   */
  @Post('api/v1/analytics/section-events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async postSectionEvents(@Body() body: BatchSectionEventsDto) {
    await this.analyticsService.recordSectionEvents(body.documentSlug, body.sessionId, body.events);
  }

  /**
   * Section Analytics Summary (Authenticated + CASL guarded: read Document).
   * GET /api/v1/documents/:id/analytics/sections
   */
  @Get('api/v1/documents/:id/analytics/sections')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getSectionMetrics(
    @Param('id') documentId: string,
    @Req() req: any,
  ): Promise<SectionAnalyticsSummary[]> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.analyticsService.getSectionAnalytics(documentId, orgId);
  }

  /**
   * Full Analytics Dashboard Payload (Authenticated + CASL guarded: read Document).
   * GET /api/v1/documents/:id/analytics/full
   */
  @Get('api/v1/documents/:id/analytics/full')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getFullAnalytics(
    @Param('id') documentId: string,
    @Req() req: any,
  ): Promise<DocumentAnalyticsFullResponse> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.analyticsService.getFullDocumentAnalytics(documentId, orgId);
  }

  /**
   * Document Analytics Summary (Authenticated + CASL guarded).
   * GET /api/v1/documents/:id/analytics
   */
  @Get('api/v1/documents/:id/analytics')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getDocumentMetrics(
    @Param('id') documentId: string,
    @Req() req: any,
  ): Promise<DocumentAnalyticsSummary> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.analyticsService.getDocumentAnalytics(documentId, orgId);
  }
}
