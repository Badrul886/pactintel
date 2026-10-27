import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ClickwrapService } from './clickwrap.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateClickwrapAgreementDtoSchema,
  CreateClickwrapAgreementDto,
  CreateClickwrapVersionDtoSchema,
  CreateClickwrapVersionDto,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/clickwrap')
@UseGuards(AuthGuard, CaslGuard)
export class ClickwrapController {
  constructor(
    private readonly service: ClickwrapService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @CheckPolicies({ action: 'manage', subject: 'ClickwrapAgreement' })
  @UsePipes(new ZodValidationPipe(CreateClickwrapAgreementDtoSchema))
  async createAgreement(@Body() dto: CreateClickwrapAgreementDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.createAgreement(orgId, dto);
  }

  @Get()
  @CheckPolicies({ action: 'read', subject: 'ClickwrapAgreement' })
  async listAgreements(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const orgId = this.cls.get<string>('organizationId');
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.service.listAgreements(orgId, cursor, parsedLimit);
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'ClickwrapAgreement' })
  async getAgreement(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.getAgreement(orgId, id);
  }

  @Post(':id/versions')
  @CheckPolicies({ action: 'manage', subject: 'ClickwrapAgreement' })
  @UsePipes(new ZodValidationPipe(CreateClickwrapVersionDtoSchema))
  async createVersion(@Param('id') agreementId: string, @Body() dto: CreateClickwrapVersionDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.createVersion(orgId, agreementId, dto);
  }

  @Post(':id/versions/:versionId/publish')
  @CheckPolicies({ action: 'manage', subject: 'ClickwrapAgreement' })
  async publishVersion(@Param('id') agreementId: string, @Param('versionId') versionId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.publishVersion(orgId, agreementId, versionId);
  }

  @Delete(':id/versions/:versionId')
  @CheckPolicies({ action: 'manage', subject: 'ClickwrapAgreement' })
  async deleteVersion(@Param('id') agreementId: string, @Param('versionId') versionId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.deleteVersion(orgId, agreementId, versionId);
  }

  @Get(':id/acceptances')
  @CheckPolicies({ action: 'read', subject: 'ClickwrapAgreement' })
  async listAcceptances(
    @Param('id') agreementId: string,
    @Query('email') email?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.service.listAcceptances(orgId, agreementId, email, cursor, parsedLimit);
  }

  @Get(':id/stats')
  @CheckPolicies({ action: 'read', subject: 'ClickwrapAgreement' })
  async getStats(@Param('id') agreementId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.getStats(orgId, agreementId);
  }
}
