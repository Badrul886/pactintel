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
import { OrganizationService } from './organization.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateOrganizationDto,
  CreateOrganizationDtoSchema,
  InviteUserDto,
  InviteUserDtoSchema,
  UserRole,
  SeatType,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1')
export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly cls: ClsService,
  ) {}

  @Post('organizations')
  @UsePipes(new ZodValidationPipe(CreateOrganizationDtoSchema))
  async createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.orgService.createOrganization(dto);
  }

  @Get('organization')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Organization' })
  async getOrganization() {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.getOrganization(orgId);
  }

  @Patch('organization')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Organization' })
  async updateOrganization(@Body() body: { name?: string; slug?: string }) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.updateOrganization(orgId, body);
  }

  @Get('users')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'User' })
  async listUsers(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.listUsers(orgId, cursor, limit ? parseInt(limit, 10) : 20);
  }

  @Post('users/invite')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'User' })
  @UsePipes(new ZodValidationPipe(InviteUserDtoSchema))
  async inviteUser(@Body() dto: InviteUserDto) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.inviteUser(orgId, dto);
  }

  @Patch('users/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'User' })
  async updateUser(
    @Param('id') userId: string,
    @Body() body: { role?: UserRole; seatType?: SeatType; status?: string },
  ) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.updateUser(orgId, userId, body);
  }

  @Delete('users/:id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'User' })
  async deactivateUser(@Param('id') userId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.deactivateUser(orgId, userId);
  }

  @Get('workspaces')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Workspace' })
  async listWorkspaces() {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.listWorkspaces(orgId);
  }

  @Post('workspaces')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Workspace' })
  async createWorkspace(@Body('name') name: string, @Body('slug') slug: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.createWorkspace(orgId, name, slug);
  }

  // --- AI Guardrails Management (RULE AI-003) ---

  @Get('organizations/settings/ai-guardrails')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async getAiGuardrails() {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.getAiGuardrails(orgId);
  }

  @Patch('organizations/settings/ai-guardrails')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async updateAiGuardrails(@Body() dto: any) {
    const orgId = this.cls.get<string>('organizationId');
    return this.orgService.updateAiGuardrails(orgId, dto);
  }
}
