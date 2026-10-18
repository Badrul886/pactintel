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
}
