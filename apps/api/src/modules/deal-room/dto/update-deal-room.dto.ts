import {
  UpdateDealRoomDto,
  UpdateDealRoomDtoSchema,
  DealRoomStatus,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

export class UpdateDealRoomDtoClass implements UpdateDealRoomDto {
  title?: string;
  status?: DealRoomStatus;
  brandKitId?: string | null;
  mutualActionPlan?: MutualActionPlanMilestone[];

  static validate(data: unknown): UpdateDealRoomDto {
    return UpdateDealRoomDtoSchema.parse(data);
  }
}
