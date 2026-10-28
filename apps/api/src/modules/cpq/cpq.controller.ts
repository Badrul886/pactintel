import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { CpqService } from './cpq.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreatePricingTableSchema,
  CreatePricingTableDto,
  UpdatePricingTableSchema,
  UpdatePricingTableDto,
  CreateLineItemSchema,
  CreateLineItemDto,
  UpdateLineItemSchema,
  UpdateLineItemDto,
  UpdateBuyerSelectionsSchema,
  UpdateBuyerSelectionsDto,
  ReorderLineItemsSchema,
  ReorderLineItemsDto,
  CreateBundleDtoSchema,
  CreateBundleDto,
  UpdateBundleDtoSchema,
  UpdateBundleDto,
  CreateBundleItemDtoSchema,
  CreateBundleItemDto,
  UpdateBundleItemDtoSchema,
  UpdateBundleItemDto,
  CreatePricingRuleDtoSchema,
  CreatePricingRuleDto,
  UpdatePricingRuleDtoSchema,
  UpdatePricingRuleDto,
  CreatePlaybookDtoSchema,
  CreatePlaybookDto,
  UpdatePlaybookDtoSchema,
  UpdatePlaybookDto,
  ExecutePlaybookDtoSchema,
  ExecutePlaybookDto,
  EvaluateCpqDtoSchema,
  EvaluateCpqDto,
} from '@pactintel/shared-types';

@Controller('api/v1')
export class CpqController {
  constructor(private readonly cpqService: CpqService) {}

  // 1. Create pricing table for document
  @Post('documents/:documentId/pricing-tables')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'PricingTable' })
  @HttpCode(HttpStatus.CREATED)
  async createPricingTable(
    @Req() req: any,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(CreatePricingTableSchema)) body: CreatePricingTableDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.createPricingTable(orgId, {
      ...body,
      documentId,
    });
  }

  // 2. Get pricing tables for document
  @Get('documents/:documentId/pricing-tables')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PricingTable' })
  async getDocumentPricingTables(@Req() req: any, @Param('documentId') documentId: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getPricingTablesByDocument(documentId, orgId);
  }

  // 3. Get single pricing table by ID
  @Get('pricing-tables/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PricingTable' })
  async getPricingTableById(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getPricingTableById(id, orgId);
  }

  // 4. Update pricing table
  @Patch('pricing-tables/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'PricingTable' })
  async updatePricingTable(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePricingTableSchema)) body: UpdatePricingTableDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updatePricingTable(id, orgId, body);
  }

  // 5. Delete pricing table
  @Delete('pricing-tables/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'PricingTable' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePricingTable(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.cpqService.deletePricingTable(id, orgId);
  }

  // 6. Create line item in pricing table
  @Post('pricing-tables/:pricingTableId/line-items')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'LineItem' })
  @HttpCode(HttpStatus.CREATED)
  async createLineItem(
    @Req() req: any,
    @Param('pricingTableId') pricingTableId: string,
    @Body(new ZodValidationPipe(CreateLineItemSchema)) body: CreateLineItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.addLineItem(orgId, {
      ...body,
      pricingTableId,
    });
  }

  // 7. Get line items in pricing table
  @Get('pricing-tables/:pricingTableId/line-items')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'LineItem' })
  async getLineItems(@Req() req: any, @Param('pricingTableId') pricingTableId: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getLineItems(pricingTableId, orgId);
  }

  // 8. Update line item
  @Patch('line-items/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'LineItem' })
  async updateLineItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateLineItemSchema)) body: UpdateLineItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updateLineItem(id, orgId, body);
  }

  // 9. Delete line item
  @Delete('line-items/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'LineItem' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLineItem(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.cpqService.deleteLineItem(id, orgId);
  }

  // 10. Reorder line items
  @Put('pricing-tables/:pricingTableId/line-items/reorder')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'LineItem' })
  async reorderLineItems(
    @Req() req: any,
    @Param('pricingTableId') pricingTableId: string,
    @Body(new ZodValidationPipe(ReorderLineItemsSchema)) body: ReorderLineItemsDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.reorderLineItems(pricingTableId, orgId, body);
  }

  // 11. Public recipient buyer selections (NO AUTH — RULE CPQ-001)
  @Post('documents/:documentId/pricing-tables/:tableId/buyer-selections')
  @HttpCode(HttpStatus.OK)
  async updateBuyerSelections(
    @Param('documentId') documentId: string,
    @Param('tableId') tableId: string,
    @Body(new ZodValidationPipe(UpdateBuyerSelectionsSchema)) body: UpdateBuyerSelectionsDto,
  ) {
    return this.cpqService.updateBuyerSelections(documentId, tableId, body);
  }

  // 12. Public recipient pricing totals (NO AUTH)
  @Get('documents/:documentId/pricing-tables/:tableId/totals')
  async getTotals(
    @Param('documentId') documentId: string,
    @Param('tableId') tableId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.cpqService.getTableTotals(documentId, tableId, sessionId);
  }

  // ===========================================================================
  // 13. Product Bundles (Phase 3 Sprint 3.1)
  // ===========================================================================

  @Post('cpq/bundles')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Bundle' })
  @HttpCode(HttpStatus.CREATED)
  async createBundle(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateBundleDtoSchema)) body: CreateBundleDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.createBundle(orgId, body);
  }

  @Get('cpq/bundles')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Bundle' })
  async listBundles(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.listBundles(orgId, {
      workspaceId,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('cpq/bundles/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Bundle' })
  async getBundle(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getBundle(id, orgId);
  }

  @Patch('cpq/bundles/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Bundle' })
  async updateBundle(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBundleDtoSchema)) body: UpdateBundleDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updateBundle(id, orgId, body);
  }

  @Delete('cpq/bundles/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Bundle' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBundle(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.cpqService.deleteBundle(id, orgId);
  }

  // --- Bundle Items ---

  @Post('cpq/bundles/:id/items')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Bundle' })
  @HttpCode(HttpStatus.CREATED)
  async addBundleItem(
    @Req() req: any,
    @Param('id') bundleId: string,
    @Body(new ZodValidationPipe(CreateBundleItemDtoSchema)) body: CreateBundleItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.addBundleItem(bundleId, orgId, body);
  }

  @Patch('cpq/bundles/:id/items/:itemId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Bundle' })
  async updateBundleItem(
    @Req() req: any,
    @Param('id') bundleId: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(UpdateBundleItemDtoSchema)) body: UpdateBundleItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updateBundleItem(bundleId, itemId, orgId, body);
  }

  @Delete('cpq/bundles/:id/items/:itemId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Bundle' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBundleItem(
    @Req() req: any,
    @Param('id') bundleId: string,
    @Param('itemId') itemId: string,
  ) {
    const orgId = req.user.organizationId;
    await this.cpqService.deleteBundleItem(bundleId, itemId, orgId);
  }

  // ===========================================================================
  // 14. Pricing Rules (Phase 3 Sprint 3.1)
  // ===========================================================================

  @Post('cpq/rules')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'PricingRule' })
  @HttpCode(HttpStatus.CREATED)
  async createPricingRule(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreatePricingRuleDtoSchema)) body: CreatePricingRuleDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.createPricingRule(orgId, body);
  }

  @Get('cpq/rules')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PricingRule' })
  async listPricingRules(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('isActive') isActive?: string,
    @Query('ruleType') ruleType?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.listPricingRules(orgId, {
      workspaceId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      ruleType,
    });
  }

  @Get('cpq/rules/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PricingRule' })
  async getPricingRule(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getPricingRule(id, orgId);
  }

  @Patch('cpq/rules/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'PricingRule' })
  async updatePricingRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePricingRuleDtoSchema)) body: UpdatePricingRuleDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updatePricingRule(id, orgId, body);
  }

  @Delete('cpq/rules/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'PricingRule' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePricingRule(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.cpqService.deletePricingRule(id, orgId);
  }

  @Post('cpq/rules/evaluate')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'PricingRule' })
  async evaluateRules(
    @Req() req: any,
    @Body(new ZodValidationPipe(EvaluateCpqDtoSchema)) body: EvaluateCpqDto,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.evaluateRules(orgId, body, workspaceId);
  }

  // ===========================================================================
  // 15. Guided-Selling Playbooks (Phase 3 Sprint 3.1)
  // ===========================================================================

  @Post('cpq/playbooks')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Playbook' })
  @HttpCode(HttpStatus.CREATED)
  async createPlaybook(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreatePlaybookDtoSchema)) body: CreatePlaybookDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.createPlaybook(orgId, body);
  }

  @Get('cpq/playbooks')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Playbook' })
  async listPlaybooks(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.listPlaybooks(orgId, {
      workspaceId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('cpq/playbooks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Playbook' })
  async getPlaybook(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.cpqService.getPlaybook(id, orgId);
  }

  @Patch('cpq/playbooks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Playbook' })
  async updatePlaybook(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlaybookDtoSchema)) body: UpdatePlaybookDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.updatePlaybook(id, orgId, body);
  }

  @Delete('cpq/playbooks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Playbook' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlaybook(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.cpqService.deletePlaybook(id, orgId);
  }

  @Post('cpq/playbooks/:id/execute')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'use', subject: 'Playbook' })
  async executePlaybook(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ExecutePlaybookDtoSchema)) body: ExecutePlaybookDto,
  ) {
    const orgId = req.user.organizationId;
    return this.cpqService.executePlaybook(orgId, id, body);
  }

  // ===========================================================================
  // 16. CRM-Embedded CPQ Iframe Endpoint (Phase 3 Sprint 3.1)
  // ===========================================================================

  @Get('cpq/embed')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Bundle' })
  async getCrmEmbedData(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('dealAttributes') dealAttributesJson?: string,
  ) {
    const orgId = req.user.organizationId;
    let dealAttrs: Record<string, any> = {};
    if (dealAttributesJson) {
      try {
        dealAttrs = JSON.parse(dealAttributesJson);
      } catch {
        // ignore malformed query json
      }
    }
    return this.cpqService.getCrmEmbedData(orgId, workspaceId, dealAttrs);
  }
}
