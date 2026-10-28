import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { ObligationService } from './obligation.service';
import { CounterpartyService } from './counterparty.service';
import { DocumentExtractionJob } from './jobs/document-extraction.job';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateCounterpartyDtoSchema,
  CreateCounterpartyDto,
  CreateCustomExtractionFieldDtoSchema,
  CreateCustomExtractionFieldDto,
  VerifyObligationDtoSchema,
  VerifyObligationDto,
} from '@pactintel/shared-types';

@Controller('api/v1/portfolio')
@UseGuards(AuthGuard, CaslGuard)
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly obligationService: ObligationService,
    private readonly counterpartyService: CounterpartyService,
    private readonly documentExtractionJob: DocumentExtractionJob,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. DASHBOARD & EXECUTIVE INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════

  @Get('dashboard')
  @CheckPolicies({ action: 'read', subject: 'Portfolio' })
  async getDashboard(@Req() req: any) {
    const orgId = req.user.organizationId;
    return this.portfolioService.getDashboardMetrics(orgId);
  }

  @Post('report')
  @CheckPolicies({ action: 'read', subject: 'Portfolio' })
  @HttpCode(HttpStatus.OK)
  async generateReport(@Req() req: any, @Body() body: { focusArea?: string }) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;
    return this.portfolioService.generatePortfolioReport(orgId, userId, body);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SEARCH & DISCOVERY (MEILISEARCH + PG FTS FALLBACK)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('search')
  @CheckPolicies({ action: 'read', subject: 'Portfolio' })
  async searchAgreements(
    @Req() req: any,
    @Query('q') query: string,
    @Query('counterpartyId') counterpartyId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.portfolioService.search({
      query: query || '',
      organizationId: orgId,
      counterpartyId,
      status,
      type,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. COUNTERPARTIES DIRECTORY
  // ═══════════════════════════════════════════════════════════════════════

  @Get('counterparties')
  @CheckPolicies({ action: 'read', subject: 'Counterparty' })
  async listCounterparties(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.counterpartyService.listCounterparties(orgId, {
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('counterparties/:id')
  @CheckPolicies({ action: 'read', subject: 'Counterparty' })
  async getCounterparty(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.counterpartyService.getCounterpartyById(id, orgId);
  }

  @Post('counterparties')
  @CheckPolicies({ action: 'create', subject: 'Counterparty' })
  @HttpCode(HttpStatus.CREATED)
  async createCounterparty(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateCounterpartyDtoSchema)) body: CreateCounterpartyDto,
  ) {
    const orgId = req.user.organizationId;
    return this.counterpartyService.findOrCreateByName(
      orgId,
      body.canonicalName,
      body.domain,
      body.aliases,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. OBLIGATIONS & AMENDMENT REVIEW (RULE PORT-001)
  // ═══════════════════════════════════════════════════════════════════════

  @Get('obligations')
  @CheckPolicies({ action: 'read', subject: 'ObligationRecord' })
  async listObligations(
    @Req() req: any,
    @Query('documentId') documentId?: string,
    @Query('isVerified') isVerified?: string,
    @Query('hasPendingUpdate') hasPendingUpdate?: string,
    @Query('fieldName') fieldName?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.obligationService.listObligations(orgId, {
      documentId,
      isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
      hasPendingUpdate: hasPendingUpdate !== undefined ? hasPendingUpdate === 'true' : undefined,
      fieldName,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('obligations/:id')
  @CheckPolicies({ action: 'read', subject: 'ObligationRecord' })
  async getObligation(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.obligationService.getObligationById(id, orgId);
  }

  @Post('obligations/:id/verify')
  @CheckPolicies({ action: 'update', subject: 'ObligationRecord' })
  @HttpCode(HttpStatus.OK)
  async verifyObligation(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(VerifyObligationDtoSchema.optional())) body?: VerifyObligationDto,
  ) {
    const orgId = req.user.organizationId;
    return this.obligationService.verify(id, orgId, body);
  }

  /**
   * RULE PORT-001: Explicit user confirmation of proposed amendment update.
   */
  @Post('obligations/:id/confirm-amendment')
  @CheckPolicies({ action: 'update', subject: 'ObligationRecord' })
  @HttpCode(HttpStatus.OK)
  async confirmAmendment(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.obligationService.confirmPendingUpdate(id, orgId);
  }

  /**
   * RULE PORT-001: Explicit user dismissal of proposed amendment update.
   */
  @Post('obligations/:id/dismiss-amendment')
  @CheckPolicies({ action: 'update', subject: 'ObligationRecord' })
  @HttpCode(HttpStatus.OK)
  async dismissAmendment(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.obligationService.dismissPendingUpdate(id, orgId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. CUSTOM EXTRACTION FIELDS
  // ═══════════════════════════════════════════════════════════════════════

  @Get('custom-fields')
  @CheckPolicies({ action: 'read', subject: 'Portfolio' })
  async listCustomFields(@Req() req: any) {
    const orgId = req.user.organizationId;
    return this.portfolioService.listCustomFields(orgId);
  }

  @Post('custom-fields')
  @CheckPolicies({ action: 'manage', subject: 'CustomExtractionField' })
  @HttpCode(HttpStatus.CREATED)
  async createCustomField(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateCustomExtractionFieldDtoSchema))
    body: CreateCustomExtractionFieldDto,
  ) {
    const orgId = req.user.organizationId;
    return this.portfolioService.createCustomField(orgId, body);
  }

  @Delete('custom-fields/:id')
  @CheckPolicies({ action: 'manage', subject: 'CustomExtractionField' })
  @HttpCode(HttpStatus.OK)
  async deleteCustomField(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.portfolioService.deleteCustomField(id, orgId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. TRIGGER AI EXTRACTION PIPELINE
  // ═══════════════════════════════════════════════════════════════════════

  @Post('documents/:id/extract')
  @CheckPolicies({ action: 'update', subject: 'Document' })
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerExtraction(
    @Req() req: any,
    @Param('id') documentId: string,
    @Body() body: { rawText?: string; fileBufferBase64?: string; mimeType?: string },
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.id;

    return this.documentExtractionJob.enqueue({
      documentId,
      organizationId: orgId,
      userId,
      rawText: body.rawText,
      fileBufferBase64: body.fileBufferBase64,
      mimeType: body.mimeType,
    });
  }
}
