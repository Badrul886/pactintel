import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { ScimService } from './scim.service';
import { ScimAuthGuard } from './guards/scim-auth.guard';
import {
  ScimCreateUserDto,
  ScimPatchUserDto,
  ScimUserResource,
  ScimListResponse,
} from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('scim/v2/Users')
@UseGuards(ScimAuthGuard)
export class ScimController {
  constructor(
    private readonly scimService: ScimService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @Header('Content-Type', 'application/scim+json')
  async listUsers(
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('filter') filter?: string,
  ): Promise<ScimListResponse<ScimUserResource>> {
    const orgId = this.cls.get<string>('organizationId');
    const start = startIndex ? parseInt(startIndex, 10) : 1;
    const limit = count ? parseInt(count, 10) : 20;
    return this.scimService.listUsers(orgId, start, limit, filter);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', 'application/scim+json')
  async createUser(@Body() dto: ScimCreateUserDto): Promise<ScimUserResource> {
    const orgId = this.cls.get<string>('organizationId');
    return this.scimService.createUser(orgId, dto);
  }

  @Get(':id')
  @Header('Content-Type', 'application/scim+json')
  async getUser(@Param('id') id: string): Promise<ScimUserResource> {
    const orgId = this.cls.get<string>('organizationId');
    return this.scimService.getUser(orgId, id);
  }

  @Put(':id')
  @Header('Content-Type', 'application/scim+json')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: ScimCreateUserDto,
  ): Promise<ScimUserResource> {
    const orgId = this.cls.get<string>('organizationId');
    return this.scimService.updateUser(orgId, id, dto);
  }

  @Patch(':id')
  @Header('Content-Type', 'application/scim+json')
  async patchUser(
    @Param('id') id: string,
    @Body() dto: ScimPatchUserDto,
  ): Promise<ScimUserResource> {
    const orgId = this.cls.get<string>('organizationId');
    return this.scimService.patchUser(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deprovisionUser(@Param('id') id: string): Promise<void> {
    const orgId = this.cls.get<string>('organizationId');
    await this.scimService.deprovisionUser(orgId, id);
  }
}
