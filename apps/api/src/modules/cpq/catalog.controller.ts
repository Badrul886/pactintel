import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateCatalogItemSchema,
  CreateCatalogItemDto,
  UpdateCatalogItemSchema,
  UpdateCatalogItemDto,
} from '@pactintel/shared-types';

@Controller('api/v1/catalog-items')
@UseGuards(AuthGuard, CaslGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @CheckPolicies({ action: 'create', subject: 'ProductCatalogItem' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateCatalogItemSchema)) body: CreateCatalogItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.catalogService.create(orgId, body);
  }

  @Get()
  @CheckPolicies({ action: 'read', subject: 'ProductCatalogItem' })
  async findAll(
    @Req() req: any,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const orgId = req.user.organizationId;
    const activeBool = isActive !== undefined ? isActive === 'true' : undefined;
    return this.catalogService.findAll(orgId, { isActive: activeBool, search });
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'ProductCatalogItem' })
  async findById(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    return this.catalogService.findById(id, orgId);
  }

  @Patch(':id')
  @CheckPolicies({ action: 'update', subject: 'ProductCatalogItem' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCatalogItemSchema)) body: UpdateCatalogItemDto,
  ) {
    const orgId = req.user.organizationId;
    return this.catalogService.update(id, orgId, body);
  }

  @Delete(':id')
  @CheckPolicies({ action: 'delete', subject: 'ProductCatalogItem' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Req() req: any, @Param('id') id: string) {
    const orgId = req.user.organizationId;
    await this.catalogService.delete(id, orgId);
  }
}
