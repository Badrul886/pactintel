import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BrandKitService } from './brand-kit.service';
import { CreateBrandKitDto } from './dto/create-brand-kit.dto';
import { UpdateBrandKitDto } from './dto/update-brand-kit.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';

@Controller('api/v1/brand-kits')
@UseGuards(AuthGuard, CaslGuard)
export class BrandKitController {
  constructor(private readonly brandKitService: BrandKitService) {}

  @Get()
  @CheckPolicies({ action: 'read', subject: 'BrandKit' })
  async listBrandKits(@Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.findAll(orgId);
  }

  @Post()
  @CheckPolicies({ action: 'manage', subject: 'BrandKit' })
  async createBrandKit(@Req() req: any, @Body() body: CreateBrandKitDto) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.create(orgId, body);
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'BrandKit' })
  async getBrandKit(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.findById(id, orgId);
  }

  @Patch(':id')
  @CheckPolicies({ action: 'manage', subject: 'BrandKit' })
  async updateBrandKit(@Param('id') id: string, @Req() req: any, @Body() body: UpdateBrandKitDto) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.update(id, orgId, body);
  }

  @Delete(':id')
  @CheckPolicies({ action: 'manage', subject: 'BrandKit' })
  async deleteBrandKit(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.delete(id, orgId);
  }

  @Post(':id/set-default')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies({ action: 'manage', subject: 'BrandKit' })
  async setDefaultBrandKit(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.brandKitService.setDefault(id, orgId);
  }

  @Post(':id/upload-logo')
  @CheckPolicies({ action: 'manage', subject: 'BrandKit' })
  async uploadLogo(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { filename: string; fileBase64?: string },
  ) {
    const orgId = req.organizationId || req.user?.organizationId;
    const buffer = body.fileBase64 ? Buffer.from(body.fileBase64, 'base64') : Buffer.from('');
    return this.brandKitService.uploadLogo(id, orgId, body.filename || 'logo.png', buffer);
  }
}
