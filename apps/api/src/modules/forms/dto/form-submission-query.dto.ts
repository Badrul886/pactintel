import { z } from 'zod';

export const FormSubmissionQueryDtoSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['partial', 'complete', 'voided', 'all']).optional(),
  search: z.string().max(100).optional(),
});

export type FormSubmissionQueryDto = z.input<typeof FormSubmissionQueryDtoSchema>;
