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
import { AutomationService } from './automation.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateAutomationRuleDto,
  CreateAutomationRuleDtoSchema,
  UpdateAutomationRuleDto,
  UpdateAutomationRuleDtoSchema,
  TestAutomationRuleDto,
  TestAutomationRuleDtoSchema,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/automation-rules')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'AutomationRule' })
  @UsePipes(new ZodValidationPipe(CreateAutomationRuleDtoSchema))
  async createRule(@Body() dto: CreateAutomationRuleDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.createRule(orgId, dto);
  }

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'AutomationRule' })
  async listRules(@Query('workspaceId') workspaceId?: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.listRules(orgId, workspaceId);
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'AutomationRule' })
  async getRule(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.getRule(orgId, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'AutomationRule' })
  @UsePipes(new ZodValidationPipe(UpdateAutomationRuleDtoSchema))
  async updateRule(@Param('id') id: string, @Body() dto: UpdateAutomationRuleDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.updateRule(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'AutomationRule' })
  async deleteRule(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.deleteRule(orgId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'AutomationRule' })
  @UsePipes(new ZodValidationPipe(TestAutomationRuleDtoSchema))
  async testRule(@Param('id') id: string, @Body() dto: TestAutomationRuleDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.automationService.testRule(orgId, id, dto);
  }
}
