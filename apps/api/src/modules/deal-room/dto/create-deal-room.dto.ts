import {
  CreateDealRoomDto,
  CreateDealRoomDtoSchema,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

export class CreateDealRoomDtoClass implements CreateDealRoomDto {
  workspaceId!: string;
  title!: string;
  slug?: string;
  brandKitId?: string;
  initialDocumentId?: string;
  mutualActionPlan?: MutualActionPlanMilestone[];

  static validate(data: unknown): CreateDealRoomDto {
    return CreateDealRoomDtoSchema.parse(data);
  }
}
