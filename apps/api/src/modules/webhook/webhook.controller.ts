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
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateWebhookDtoSchema,
  CreateWebhookDto,
  UpdateWebhookDtoSchema,
  UpdateWebhookDto,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/webhooks')
@UseGuards(AuthGuard, CaslGuard)
export class WebhookController {
  constructor(
    private readonly service: WebhookService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @CheckPolicies({ action: 'manage', subject: 'Webhook' })
  @UsePipes(new ZodValidationPipe(CreateWebhookDtoSchema))
  async createWebhook(@Body() dto: CreateWebhookDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.createWebhook(orgId, dto);
  }

  @Get()
  @CheckPolicies({ action: 'read', subject: 'Webhook' })
  async listWebhooks(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const orgId = this.cls.get<string>('organizationId');
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.service.listWebhooks(orgId, cursor, parsedLimit);
  }

  @Get(':id')
  @CheckPolicies({ action: 'read', subject: 'Webhook' })
  async getWebhook(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.getWebhook(orgId, id);
  }

  @Patch(':id')
  @CheckPolicies({ action: 'manage', subject: 'Webhook' })
  @UsePipes(new ZodValidationPipe(UpdateWebhookDtoSchema))
  async updateWebhook(@Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.updateWebhook(orgId, id, dto);
  }

  @Delete(':id')
  @CheckPolicies({ action: 'manage', subject: 'Webhook' })
  async deleteWebhook(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.deleteWebhook(orgId, id);
  }

  @Post(':id/test')
  @CheckPolicies({ action: 'manage', subject: 'Webhook' })
  async testWebhook(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.service.testWebhook(orgId, id);
  }

  @Get(':id/delivery-logs')
  @CheckPolicies({ action: 'read', subject: 'Webhook' })
  async listDeliveryLogs(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.service.listDeliveryLogs(orgId, id, cursor, parsedLimit);
  }
}
