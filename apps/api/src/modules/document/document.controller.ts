import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { PdfService } from './pdf/pdf.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateDocumentDto,
  CreateDocumentDtoSchema,
  UpdateDocumentDto,
  UpdateDocumentDtoSchema,
  CreateDocumentVersionDto,
  CreateDocumentVersionDtoSchema,
  UpdateDocumentSettingsDto,
  UpdateDocumentSettingsDtoSchema,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/documents')
export class DocumentController {
  constructor(
    private readonly docService: DocumentService,
    private readonly pdfService: PdfService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(CreateDocumentDtoSchema))
  async createDocument(@Body() dto: CreateDocumentDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.docService.createDocument(orgId, userId, dto);
  }

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async listDocuments(
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.listDocuments(
      orgId,
      workspaceId,
      status,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getDocument(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.getDocument(orgId, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(UpdateDocumentDtoSchema))
  async updateDocument(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.updateDocument(orgId, id, dto);
  }

  @Patch(':id/settings')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(UpdateDocumentSettingsDtoSchema))
  async updateDocumentSettings(@Param('id') id: string, @Body() dto: UpdateDocumentSettingsDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.updateDocumentSettings(orgId, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Document' })
  async deleteDocument(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.softDelete(orgId, id);
  }

  @Post(':id/send')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Document' })
  async sendDocument(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.sendDocument(orgId, id);
  }

  @Post(':id/versions')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(CreateDocumentVersionDtoSchema))
  async saveVersion(@Param('id') id: string, @Body() dto: CreateDocumentVersionDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.docService.saveVersion(orgId, id, dto.contentSnapshot, userId);
  }

  @Get(':id/versions')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async listVersions(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.listVersions(orgId, id);
  }

  @Get(':id/audit-trail')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async getAuditTrail(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.docService.getAuditTrail(orgId, id);
  }

  @Post(':id/pdf')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async queuePdf(@Param('id') id: string, @Body('versionId') versionId?: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const doc = await this.docService.getDocument(orgId, id);
    const targetVersionId = versionId || doc.currentVersionId || doc.versions[0]?.id;
    return this.pdfService.queuePdfGeneration(orgId, id, targetVersionId, userId);
  }

  /**
   * Recipient access request endpoint (NO auth required).
   * RULE ACC-004: Writes audit log entry, notifies document owner, returns 202 Accepted.
   */
  @Post(':id/access-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestAccess(
    @Param('id') id: string,
    @Body() body: { requesterEmail: string; requesterName: string; message?: string },
    @Req() req: any,
  ) {
    return this.docService.requestAccess(id, body, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }
}
