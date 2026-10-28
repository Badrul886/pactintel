import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DealRoomRepository } from './deal-room.repository';
import { DealRoomMagicLinkService } from './deal-room-magic-link.service';
import { InviteDealRoomMemberDto } from '@pactintel/shared-types';

@Injectable()
export class DealRoomMemberService {
  constructor(
    private readonly repository: DealRoomRepository,
    private readonly magicLinkService: DealRoomMagicLinkService,
  ) {}

  async inviteMember(
    orgId: string,
    dealRoomId: string,
    dto: InviteDealRoomMemberDto,
    options?: { baseUrl?: string },
  ) {
    const room = await this.repository.findDealRoomById(orgId, dealRoomId);
    if (!room) {
      throw new NotFoundException(`Deal room ${dealRoomId} not found`);
    }

    if (dto.externalEmail) {
      const existing = await this.repository.findMemberByEmail(
        orgId,
        dealRoomId,
        dto.externalEmail,
      );
      if (existing) {
        throw new ConflictException(
          `Member with email '${dto.externalEmail}' is already in this deal room`,
        );
      }
    }

    const member = await this.repository.addMember(orgId, dealRoomId, {
      userId: dto.userId,
      externalEmail: dto.externalEmail,
      externalName: dto.externalName,
      role: dto.role || 'viewer',
    });

    let magicLinkInfo = null;
    // For external members, generate an invitation magic link
    if (dto.externalEmail) {
      magicLinkInfo = await this.magicLinkService.generateMagicLink(orgId, dealRoomId, member.id, {
        baseUrl: options?.baseUrl,
      });
    }

    return {
      member,
      magicLink: magicLinkInfo,
    };
  }

  async getMembers(orgId: string, dealRoomId: string) {
    return this.repository.findMembers(orgId, dealRoomId);
  }

  async removeMember(orgId: string, dealRoomId: string, memberId: string) {
    return this.repository.removeMember(orgId, dealRoomId, memberId);
  }
}
