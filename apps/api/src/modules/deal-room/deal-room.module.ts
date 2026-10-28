import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrganizationModule } from '../organization/organization.module';
import { DealRoomController } from './deal-room.controller';
import { DealRoomRepository } from './deal-room.repository';
import { DealRoomService } from './deal-room.service';
import { DealRoomMemberService } from './deal-room-member.service';
import { DealRoomDocumentService } from './deal-room-document.service';
import { DealRoomMessageService } from './deal-room-message.service';
import { DealRoomMagicLinkService } from './deal-room-magic-link.service';
import { DealRoomActivityService } from './deal-room-activity.service';

@Module({
  imports: [forwardRef(() => OrganizationModule)],
  controllers: [DealRoomController],
  providers: [
    PrismaService,
    DealRoomRepository,
    DealRoomService,
    DealRoomMemberService,
    DealRoomDocumentService,
    DealRoomMessageService,
    DealRoomMagicLinkService,
    DealRoomActivityService,
  ],
  exports: [
    DealRoomService,
    DealRoomMemberService,
    DealRoomDocumentService,
    DealRoomMessageService,
    DealRoomMagicLinkService,
    DealRoomActivityService,
    DealRoomRepository,
  ],
})
export class DealRoomModule {}
