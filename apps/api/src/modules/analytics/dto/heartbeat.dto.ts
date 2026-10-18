import { HeartbeatDtoSchema } from '@pactintel/shared-types';

export class HeartbeatDto {
  static schema = HeartbeatDtoSchema;

  documentSlug!: string;
  sessionId!: string;
  durationMs!: number;
}
