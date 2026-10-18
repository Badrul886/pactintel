import { z } from 'zod';

export const ConnectIntegrationDtoSchema = z.object({
  provider: z.enum(['hubspot', 'salesforce', 'pipedrive']),
  code: z.string().min(1),
  state: z.string().min(1),
});

export type ConnectIntegrationDto = z.infer<typeof ConnectIntegrationDtoSchema>;
