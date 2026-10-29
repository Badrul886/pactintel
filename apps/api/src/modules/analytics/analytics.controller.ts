import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { CustomReportService } from './custom-report.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { BatchSectionEventsDto } from './dto/section-events.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import {
  DocumentAnalyticsSummary,
  SectionAnalyticsSummary,
  DocumentAnalyticsFullResponse,
  AnalyticsRollupOverview,
  ConversionFunnelData,
  TemplatePerformanceItem,
  EngagementScoreSummary,
  ManagerOverdueFollowupItem,
  CustomReportResponse,
  CustomReportExecutionResult,
  CreateCustomReportDto,
  UpdateCustomReportDto,
  OverviewQueryDto,
} from '@pactintel/shared-types';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly customReportService: CustomReportService,
  ) {}

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

  // =========================================================================
  // Sprint 3.10: Enterprise Analytics, Funnels, and Custom Reports
  // =========================================================================

  /**
   * Company/team/personal analytics overview roll-up.
   * GET /api/v1/analytics/overview
   */
  @Get('api/v1/analytics/overview')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Analytics' })
  async getOverview(
    @Req() req: any,
    @Query() query: OverviewQueryDto,
  ): Promise<AnalyticsRollupOverview> {
    const orgId = req.organizationId || req.user?.organizationId;
    const role = req.user?.role || 'member';
    const userId = req.user?.id || req.user?.userId;
    return this.analyticsService.getRollupOverview(orgId, role, userId, query);
  }

  /**
   * Conversion Funnel & Deal Velocity Report.
   * GET /api/v1/analytics/conversion
   */
  @Get('api/v1/analytics/conversion')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Analytics' })
  async getConversion(
    @Req() req: any,
    @Query() query: OverviewQueryDto,
  ): Promise<ConversionFunnelData> {
    const orgId = req.organizationId || req.user?.organizationId;
    const role = req.user?.role || 'member';
    const userId = req.user?.id || req.user?.userId;
    return this.analyticsService.getConversionFunnel(orgId, role, userId, query);
  }

  /**
   * Template Performance Rankings.
   * GET /api/v1/analytics/templates
   */
  @Get('api/v1/analytics/templates')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Analytics' })
  async getTemplatePerformance(@Req() req: any): Promise<TemplatePerformanceItem[]> {
    const orgId = req.organizationId || req.user?.organizationId;
    const role = req.user?.role || 'member';
    const userId = req.user?.id || req.user?.userId;
    return this.analyticsService.getTemplatePerformance(orgId, role, userId);
  }

  /**
   * Proprietary Document Engagement Score (0-100).
   * GET /api/v1/analytics/documents/:id/engagement-score
   */
  @Get('api/v1/analytics/documents/:id/engagement-score')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Analytics' })
  async getEngagementScore(
    @Param('id') documentId: string,
    @Req() req: any,
  ): Promise<EngagementScoreSummary> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.analyticsService.getDocumentEngagementScore(documentId, orgId);
  }

  /**
   * Manager Overdue Follow-up Tracker.
   * GET /api/v1/analytics/manager/overdue-followups
   */
  @Get('api/v1/analytics/manager/overdue-followups')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Analytics' })
  async getManagerOverdueFollowups(
    @Req() req: any,
    @Query('thresholdDays') thresholdDays?: number,
    @Query('teamId') teamId?: string,
  ): Promise<ManagerOverdueFollowupItem[]> {
    const orgId = req.organizationId || req.user?.organizationId;
    const userId = req.user?.id || req.user?.userId;
    const days = thresholdDays ? Number(thresholdDays) : 3;
    return this.analyticsService.getManagerOverdueFollowups(orgId, userId, days, teamId);
  }

  // --- Custom Report Builder Endpoints (Plan Gated: Business+) ---

  /**
   * Create custom report definition.
   * POST /api/v1/analytics/reports
   */
  @Post('api/v1/analytics/reports')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'CustomReport' })
  async createReport(
    @Req() req: any,
    @Body() dto: CreateCustomReportDto,
  ): Promise<CustomReportResponse> {
    const orgId = req.organizationId || req.user?.organizationId;
    const userId = req.user?.id || req.user?.userId;
    const workspaceId = dto.workspaceId || req.workspaceId || req.user?.workspaceId;
    return this.customReportService.createReport(orgId, workspaceId, userId, dto);
  }

  /**
   * List custom reports.
   * GET /api/v1/analytics/reports
   */
  @Get('api/v1/analytics/reports')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'CustomReport' })
  async listReports(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
  ): Promise<CustomReportResponse[]> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customReportService.listReports(orgId, workspaceId);
  }

  /**
   * Get custom report by ID.
   * GET /api/v1/analytics/reports/:id
   */
  @Get('api/v1/analytics/reports/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'CustomReport' })
  async getReport(@Param('id') reportId: string, @Req() req: any): Promise<CustomReportResponse> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customReportService.getReportById(orgId, reportId);
  }

  /**
   * Run custom report.
   * POST /api/v1/analytics/reports/:id/run
   */
  @Post('api/v1/analytics/reports/:id/run')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'CustomReport' })
  async runReport(
    @Param('id') reportId: string,
    @Req() req: any,
  ): Promise<CustomReportExecutionResult> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customReportService.runReport(orgId, reportId);
  }

  /**
   * Get last results of custom report.
   * GET /api/v1/analytics/reports/:id/results
   */
  @Get('api/v1/analytics/reports/:id/results')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'CustomReport' })
  async getReportResults(
    @Param('id') reportId: string,
    @Req() req: any,
  ): Promise<CustomReportExecutionResult> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customReportService.runReport(orgId, reportId);
  }

  /**
   * Export custom report as RFC-4180 CSV (OWASP formula injection protected).
   * GET /api/v1/analytics/reports/:id/export
   */
  @Get('api/v1/analytics/reports/:id/export')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'CustomReport' })
  async exportReportCsv(@Param('id') reportId: string, @Req() req: any, @Res() res: Response) {
    const orgId = req.organizationId || req.user?.organizationId;
    const csvString = await this.customReportService.exportCsv(orgId, reportId);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${reportId}.csv"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });

    res.status(HttpStatus.OK).send(csvString);
  }

  /**
   * Update custom report.
   * PATCH /api/v1/analytics/reports/:id
   */
  @Patch('api/v1/analytics/reports/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'CustomReport' })
  async updateReport(
    @Param('id') reportId: string,
    @Req() req: any,
    @Body() dto: UpdateCustomReportDto,
  ): Promise<CustomReportResponse> {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customReportService.updateReport(orgId, reportId, dto);
  }

  /**
   * Soft-delete custom report.
   * DELETE /api/v1/analytics/reports/:id
   */
  @Delete('api/v1/analytics/reports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'CustomReport' })
  async deleteReport(@Param('id') reportId: string, @Req() req: any): Promise<void> {
    const orgId = req.organizationId || req.user?.organizationId;
    await this.customReportService.deleteReport(orgId, reportId);
  }
}
