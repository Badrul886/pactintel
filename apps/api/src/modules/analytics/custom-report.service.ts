import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { generateId } from '@pactintel/shared-utils';
import {
  CreateCustomReportDto,
  UpdateCustomReportDto,
  CustomReportResponse,
  CustomReportExecutionResult,
  ReportDimension,
  ReportMetric,
} from '@pactintel/shared-types';
import { AnalyticsRepository } from './analytics.repository';

const ALLOWED_DIMENSIONS: ReportDimension[] = [
  'document_type',
  'template',
  'workspace',
  'rep',
  'team',
  'date_range',
  'status',
];

const ALLOWED_METRICS: ReportMetric[] = [
  'count',
  'sum_value',
  'avg_value',
  'avg_time_to_view',
  'avg_time_to_sign',
  'views_count',
];

@Injectable()
export class CustomReportService {
  private readonly logger = new Logger(CustomReportService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly repository: AnalyticsRepository,
    prisma?: any,
  ) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Enforces Plan Gating (EC-REPORT-01):
   * Custom report builder is strictly limited to Business and Enterprise plans.
   */
  async assertBusinessTier(organizationId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });
    const planTier = (sub?.planTier || 'free').toLowerCase();
    const allowed = ['business', 'enterprise'];

    if (!allowed.includes(planTier)) {
      throw new ForbiddenException({
        code: 'PLAN_FEATURE_LOCKED',
        message: 'Custom report builder requires a Business or Enterprise subscription.',
        currentTier: planTier,
      });
    }
  }

  /**
   * Creates a new custom report definition.
   */
  async createReport(
    organizationId: string,
    workspaceId: string,
    createdBy: string,
    dto: CreateCustomReportDto,
  ): Promise<CustomReportResponse> {
    await this.assertBusinessTier(organizationId);
    this.validateReportDefinition(dto.definition);

    const id = generateId();
    const report = await this.prisma.customReport.create({
      data: {
        id,
        organizationId,
        workspaceId,
        createdBy,
        name: dto.name,
        definition: dto.definition as any,
        schedule: dto.schedule ? (dto.schedule as any) : undefined,
      },
    });

    return this.mapToResponse(report);
  }

  /**
   * Lists custom reports for an organization.
   */
  async listReports(organizationId: string, workspaceId?: string): Promise<CustomReportResponse[]> {
    const where: any = {
      organizationId,
      deletedAt: null,
    };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const reports = await this.prisma.customReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reports.map((r) => this.mapToResponse(r));
  }

  /**
   * Retrieves report definition by ID.
   */
  async getReportById(organizationId: string, reportId: string): Promise<CustomReportResponse> {
    const report = await this.prisma.customReport.findFirst({
      where: {
        id: reportId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!report) {
      throw new NotFoundException(`Custom report with id ${reportId} not found`);
    }

    return this.mapToResponse(report);
  }

  /**
   * Updates custom report definition or schedule.
   */
  async updateReport(
    organizationId: string,
    reportId: string,
    dto: UpdateCustomReportDto,
  ): Promise<CustomReportResponse> {
    await this.assertBusinessTier(organizationId);
    if (dto.definition) {
      this.validateReportDefinition(dto.definition);
    }

    const existing = await this.getReportById(organizationId, reportId);
    const updated = await this.prisma.customReport.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? existing.name,
        definition: dto.definition ? (dto.definition as any) : (existing.definition as any),
        schedule: dto.schedule !== undefined ? (dto.schedule as any) : (existing.schedule as any),
        updatedAt: new Date(),
      },
    });

    return this.mapToResponse(updated);
  }

  /**
   * Soft-deletes a custom report.
   */
  async deleteReport(organizationId: string, reportId: string): Promise<void> {
    const existing = await this.getReportById(organizationId, reportId);
    await this.prisma.customReport.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Executes a custom report against the analytics store.
   * Edge cases handled:
   * - EC-REPORT-02: Whitelist parameter validation, AST query model.
   * - EC-REPORT-03: Zero division protection.
   * - EC-REPORT-04: Graceful handling of inactive reps.
   * - EC-REPORT-07: Caps result row count at 10,000.
   */
  async runReport(organizationId: string, reportId: string): Promise<CustomReportExecutionResult> {
    await this.assertBusinessTier(organizationId);
    const report = await this.getReportById(organizationId, reportId);

    this.logger.log(
      `Executing custom report '${report.name}' (${reportId}) for org ${organizationId}`,
    );
    const result = await this.repository.executeCustomReport(organizationId, report.definition);

    // Update lastRunAt
    await this.prisma.customReport.update({
      where: { id: reportId },
      data: { lastRunAt: new Date() },
    });

    return {
      reportId,
      executedAt: new Date().toISOString(),
      rowCount: result.rows.length,
      columns: result.columns,
      rows: result.rows,
      chartData: result.chartData,
    };
  }

  /**
   * Exports report results as an RFC-4180 compliant CSV string.
   * Implements EC-REPORT-06: OWASP CSV Formula Injection defense.
   */
  async exportCsv(organizationId: string, reportId: string): Promise<string> {
    const execution = await this.runReport(organizationId, reportId);
    const { columns, rows } = execution;

    if (columns.length === 0) {
      return '';
    }

    // Helper to sanitize cell values against formula injection (EC-REPORT-06)
    const sanitizeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);

      // If string starts with =, +, -, @, \t, or \r, prefix with single quote to prevent DDE/Formula execution
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }

      // Escape quotes by doubling them
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const headerLine = columns.map(sanitizeCell).join(',');
    const dataLines = rows.map((row) => columns.map((col) => sanitizeCell(row[col])).join(','));

    return [headerLine, ...dataLines].join('\r\n');
  }

  /**
   * Whitelist validation against unallowed dimensions or metrics (EC-REPORT-02).
   */
  private validateReportDefinition(def: any): void {
    if (!def || !Array.isArray(def.dimensions) || !Array.isArray(def.metrics)) {
      throw new BadRequestException('Report definition must contain dimensions and metrics arrays');
    }

    for (const d of def.dimensions) {
      if (!ALLOWED_DIMENSIONS.includes(d)) {
        throw new BadRequestException(`Invalid dimension: ${d}`);
      }
    }

    for (const m of def.metrics) {
      if (!ALLOWED_METRICS.includes(m)) {
        throw new BadRequestException(`Invalid metric: ${m}`);
      }
    }
  }

  private mapToResponse(report: any): CustomReportResponse {
    return {
      id: report.id,
      organizationId: report.organizationId,
      workspaceId: report.workspaceId,
      createdBy: report.createdBy,
      name: report.name,
      definition: report.definition,
      schedule: report.schedule || null,
      lastRunAt: report.lastRunAt ? report.lastRunAt.toISOString() : null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
