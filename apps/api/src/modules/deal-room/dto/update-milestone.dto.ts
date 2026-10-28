import {
  UpdateMapDto,
  UpdateMapDtoSchema,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

export class UpdateMapDtoClass implements UpdateMapDto {
  mutualActionPlan!: MutualActionPlanMilestone[];

  static validate(data: unknown): UpdateMapDto {
    return UpdateMapDtoSchema.parse(data);
  }
}
