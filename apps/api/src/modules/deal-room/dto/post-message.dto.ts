import {
  CreateDealRoomMessageDto,
  CreateDealRoomMessageDtoSchema,
  DealRoomMessageVisibility,
} from '@pactintel/shared-types';

export class CreateDealRoomMessageDtoClass implements CreateDealRoomMessageDto {
  body!: string;
  visibility?: DealRoomMessageVisibility;
  parentId?: string;
  authorName?: string;
  authorEmail?: string;

  static validate(data: unknown): CreateDealRoomMessageDto {
    return CreateDealRoomMessageDtoSchema.parse(data);
  }
}
