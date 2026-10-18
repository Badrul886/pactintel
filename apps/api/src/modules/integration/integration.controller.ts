import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { IntegrationService } from './integration.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { SyncConfigDto } from './dto/sync-config.dto';

@Controller('api/v1/integrations')
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'IntegrationConnection' })
  async listIntegrations(@Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.listConnections(orgId);
  }

  @Get('hubspot/connect')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'IntegrationConnection' })
  async connectHubspot(@Req() req: any, @Res() res: Response) {
    const orgId = req.organizationId || req.user?.organizationId;
    const url = this.integrationService.getHubspotConnectUrl(orgId);
    return res.json({ url });
  }

  @Get('hubspot/callback')
  async hubspotCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.integrationService.handleHubspotCallback(code, state);
    const redirectUrl = process.env.APP_BASE_URL
      ? `${process.env.APP_BASE_URL}/settings/integrations?status=connected`
      : '/settings/integrations?status=connected';
    return res.redirect(redirectUrl);
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'IntegrationConnection' })
  async getIntegration(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.getConnection(id, orgId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'IntegrationConnection' })
  async disconnectIntegration(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.disconnect(id, orgId);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'IntegrationConnection' })
  async triggerManualSync(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.triggerManualSync(id, orgId);
  }

  @Get(':id/sync-status')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'IntegrationConnection' })
  async getSyncStatus(@Param('id') id: string, @Req() req: any) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.getSyncStatus(id, orgId);
  }

  @Patch(':id/settings')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'IntegrationConnection' })
  async updateSettings(@Param('id') id: string, @Req() req: any, @Body() body: SyncConfigDto) {
    const orgId = req.organizationId || req.user?.organizationId;
    return this.integrationService.updateSettings(id, orgId, body);
  }
}
