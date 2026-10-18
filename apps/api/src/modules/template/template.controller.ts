import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateTemplateDto,
  CreateTemplateDtoSchema,
  UpdateTemplateDto,
  UpdateTemplateDtoSchema,
  CreateFromTemplateDto,
  CreateFromTemplateDtoSchema,
  SaveDocumentAsTemplateDto,
  SaveDocumentAsTemplateDtoSchema,
  CreateContentBlockDto,
  CreateContentBlockDtoSchema,
  UpdateContentBlockDto,
  UpdateContentBlockDtoSchema,
  CreateFolderDto,
  CreateFolderDtoSchema,
  UpdateFolderDto,
  UpdateFolderDtoSchema,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly cls: ClsService,
  ) {}

  // ===========================================================================
  // 1. Templates Endpoints
  // ===========================================================================

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Template' })
  @UsePipes(new ZodValidationPipe(CreateTemplateDtoSchema))
  async createTemplate(@Body() dto: CreateTemplateDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.createTemplate(orgId, dto);
  }

  @Get('templates')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Template' })
  async listTemplates(
    @Query('workspaceId') workspaceId?: string,
    @Query('category') category?: string,
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.listTemplates(orgId, {
      workspaceId,
      category,
      folderId,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('templates/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Template' })
  async getTemplate(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.getTemplate(orgId, id);
  }

  @Patch('templates/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Template' })
  @UsePipes(new ZodValidationPipe(UpdateTemplateDtoSchema))
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.updateTemplate(orgId, id, dto);
  }

  @Delete('templates/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Template' })
  async deleteTemplate(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.deleteTemplate(orgId, id);
  }

  @Post('templates/:id/documents')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'use', subject: 'Template' })
  @UsePipes(new ZodValidationPipe(CreateFromTemplateDtoSchema))
  async createDocumentFromTemplate(@Param('id') id: string, @Body() dto: CreateFromTemplateDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.templateService.createDocumentFromTemplate(orgId, userId, id, dto);
  }

  @Post('documents/:id/save-as-template')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Template' })
  @UsePipes(new ZodValidationPipe(SaveDocumentAsTemplateDtoSchema))
  async saveDocumentAsTemplate(@Param('id') id: string, @Body() dto: SaveDocumentAsTemplateDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.saveDocumentAsTemplate(orgId, id, dto);
  }

  // ===========================================================================
  // 2. Content Blocks Endpoints
  // ===========================================================================

  @Post('content-blocks')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'ContentBlock' })
  @UsePipes(new ZodValidationPipe(CreateContentBlockDtoSchema))
  async createContentBlock(@Body() dto: CreateContentBlockDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.createContentBlock(orgId, dto);
  }

  @Get('content-blocks')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'ContentBlock' })
  async listContentBlocks(
    @Query('workspaceId') workspaceId?: string,
    @Query('type') type?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.listContentBlocks(orgId, {
      workspaceId,
      type,
      tag,
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('content-blocks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'ContentBlock' })
  async getContentBlock(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.getContentBlock(orgId, id);
  }

  @Patch('content-blocks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'ContentBlock' })
  @UsePipes(new ZodValidationPipe(UpdateContentBlockDtoSchema))
  async updateContentBlock(@Param('id') id: string, @Body() dto: UpdateContentBlockDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.updateContentBlock(orgId, id, dto);
  }

  @Delete('content-blocks/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'ContentBlock' })
  async deleteContentBlock(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.deleteContentBlock(orgId, id);
  }

  @Post('content-blocks/:id/insert')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'use', subject: 'ContentBlock' })
  async insertContentBlock(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.insertContentBlock(orgId, id);
  }

  // ===========================================================================
  // 3. Folders Endpoints
  // ===========================================================================

  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Folder' })
  @UsePipes(new ZodValidationPipe(CreateFolderDtoSchema))
  async createFolder(@Body() dto: CreateFolderDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.createFolder(orgId, dto);
  }

  @Get('folders')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Folder' })
  async listFolders(
    @Query('workspaceId') workspaceId?: string,
    @Query('entityType') entityType?: 'document' | 'template',
    @Query('parentId') parentId?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.listFolders(orgId, {
      workspaceId,
      entityType,
      parentId,
    });
  }

  @Patch('folders/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Folder' })
  @UsePipes(new ZodValidationPipe(UpdateFolderDtoSchema))
  async updateFolder(@Param('id') id: string, @Body() dto: UpdateFolderDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.updateFolder(orgId, id, dto);
  }

  @Delete('folders/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Folder' })
  async deleteFolder(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.templateService.deleteFolder(orgId, id);
  }
}
