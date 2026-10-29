import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateWorkspaceDto,
  CreateWorkspaceDtoSchema,
  UpdateWorkspaceDto,
  UpdateWorkspaceDtoSchema,
  AddWorkspaceMemberDto,
  AddWorkspaceMemberDtoSchema,
  UpdateWorkspaceMemberDto,
  UpdateWorkspaceMemberDtoSchema,
  UserRole,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/workspaces')
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'create', subject: 'Workspace' })
  @UsePipes(new ZodValidationPipe(CreateWorkspaceDtoSchema))
  async createWorkspace(@Body() dto: CreateWorkspaceDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.workspaceService.createWorkspace(orgId, dto, userId);
  }

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Workspace' })
  async listWorkspaces() {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.listWorkspaces(orgId, userId, userRole);
  }

  @Get(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Workspace' })
  async getWorkspaceById(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.getWorkspaceById(id, orgId, userId, userRole);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Workspace' })
  @UsePipes(new ZodValidationPipe(UpdateWorkspaceDtoSchema))
  async updateWorkspace(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.updateWorkspace(id, orgId, dto, userId, userRole);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'delete', subject: 'Workspace' })
  async deleteWorkspace(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.deleteWorkspace(id, orgId, userId, userRole);
  }

  // --- Member Management ---

  @Get(':id/members')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Workspace' })
  async listMembers(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.listMembers(id, orgId, userId, userRole);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Workspace' })
  @UsePipes(new ZodValidationPipe(AddWorkspaceMemberDtoSchema))
  async addMember(@Param('id') id: string, @Body() dto: AddWorkspaceMemberDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.addMember(id, orgId, dto, userId, userRole);
  }

  @Patch(':id/members/:userId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Workspace' })
  @UsePipes(new ZodValidationPipe(UpdateWorkspaceMemberDtoSchema))
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
    @Body() dto: UpdateWorkspaceMemberDto,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.updateMemberRole(id, orgId, memberUserId, dto, userId, userRole);
  }

  @Delete(':id/members/:userId')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'update', subject: 'Workspace' })
  async removeMember(@Param('id') id: string, @Param('userId') memberUserId: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.removeMember(id, orgId, memberUserId, userId, userRole);
  }

  // --- Parent-Account Oversight & Cross-Workspace Analytics ---

  @Get(':id/overview')
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Workspace' })
  async getWorkspaceOverview(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const userRole = this.cls.get<UserRole>('userRole');
    return this.workspaceService.getWorkspaceOverview(id, orgId, userId, userRole);
  }
}
