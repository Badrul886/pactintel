import { z } from 'zod';

export const SyncConfigDtoSchema = z.object({
  syncContacts: z.boolean().default(true),
  syncDeals: z.boolean().default(true),
  dealStageOnSent: z.string().optional().default('contractsent'),
  dealStageOnSigned: z.string().optional().default('closedwon'),
  fieldMappings: z.record(z.string()).optional().default({}),
});

export type SyncConfigDto = z.infer<typeof SyncConfigDtoSchema>;
