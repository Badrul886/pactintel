import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ContentLockService } from './content-lock.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LockBlockDto, LockBlockDtoSchema, UserRole } from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/documents/:id/content-locks')
export class ContentLockController {
  constructor(
    private readonly lockService: ContentLockService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async listLocks(@Param('id') documentId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.lockService.listLocks(orgId, documentId);
  }

  @Post()
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  @UsePipes(new ZodValidationPipe(LockBlockDtoSchema))
  async lockBlock(@Param('id') documentId: string, @Body() dto: LockBlockDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.lockService.lockBlock(orgId, userId, documentId, dto);
  }

  @Delete(':blockId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, CaslGuard)
  @CheckPolicies({ action: 'read', subject: 'Document' })
  async unlockBlock(@Param('id') documentId: string, @Param('blockId') blockId: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    const role = (this.cls.get<string>('userRole') as UserRole) || 'member';
    return this.lockService.unlockBlock(orgId, userId, role, documentId, blockId);
  }
}
