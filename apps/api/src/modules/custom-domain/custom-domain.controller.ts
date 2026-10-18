import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomDomainService } from './custom-domain.service';
import { CreateCustomDomainDto } from './dto/create-custom-domain.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';

@Controller('api/v1/custom-domains')
@UseGuards(AuthGuard, CaslGuard)
export class CustomDomainController {
  constructor(private readonly customDomainService: CustomDomainService) {}

  @Get()
  @CheckPolicies({ action: 'read', subject: 'CustomDomain' })
  async list(@Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customDomainService.findAll(orgId);
  }

  @Post()
  @CheckPolicies({ action: 'manage', subject: 'CustomDomain' })
  async create(@Req() req: any, @Body() body: CreateCustomDomainDto) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customDomainService.create(orgId, body.domain);
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'CustomDomain' })
  async getById(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customDomainService.findById(id, orgId);
  }

  @Delete(':id')
  @CheckPolicies({ action: 'manage', subject: 'CustomDomain' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customDomainService.delete(id, orgId);
  }

  @Post(':id/verify')
  @CheckPolicies({ action: 'manage', subject: 'CustomDomain' })
  @HttpCode(HttpStatus.OK)
  async verify(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.customDomainService.verify(id, orgId);
  }
}
