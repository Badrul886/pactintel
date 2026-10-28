import {
  InviteDealRoomMemberDto,
  InviteDealRoomMemberDtoSchema,
  DealRoomMemberRole,
} from '@pactintel/shared-types';

export class InviteDealRoomMemberDtoClass implements InviteDealRoomMemberDto {
  userId?: string;
  externalEmail?: string;
  externalName?: string;
  role?: DealRoomMemberRole;

  static validate(data: unknown): InviteDealRoomMemberDto {
    return InviteDealRoomMemberDtoSchema.parse(data);
  }
}
