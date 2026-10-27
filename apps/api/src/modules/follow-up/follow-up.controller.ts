import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { FollowUpService } from './follow-up.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SnoozeFollowUpDto, SnoozeFollowUpDtoSchema } from '@pactintel/shared-types';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/follow-ups')
@UseGuards(AuthGuard, CaslGuard)
export class FollowUpController {
  constructor(
    private readonly followUpService: FollowUpService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @CheckPolicies({ action: 'read', subject: 'FollowUpQueueItem' })
  async listFollowUps(
    @Query('reason') reason?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.followUpService.listFollowUps(
      orgId,
      userId,
      reason,
      cursor,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post(':id/send')
  @CheckPolicies({ action: 'send', subject: 'FollowUpQueueItem' })
  async sendFollowUp(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.followUpService.sendFollowUp(orgId, userId, id);
  }

  @Post(':id/snooze')
  @CheckPolicies({ action: 'snooze', subject: 'FollowUpQueueItem' })
  @UsePipes(new ZodValidationPipe(SnoozeFollowUpDtoSchema))
  async snoozeFollowUp(@Param('id') id: string, @Body() dto: SnoozeFollowUpDto) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.followUpService.snoozeFollowUp(orgId, userId, id, new Date(dto.snoozedUntil));
  }

  @Delete(':id')
  @CheckPolicies({ action: 'dismiss', subject: 'FollowUpQueueItem' })
  async dismissFollowUp(@Param('id') id: string) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');
    return this.followUpService.dismissFollowUp(orgId, userId, id);
  }
}
