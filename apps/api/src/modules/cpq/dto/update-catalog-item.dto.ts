import { z } from 'zod';

export const UpdateCatalogItemSchema = z.object({
  sku: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  billingFrequency: z
    .enum(['one_time', 'monthly', 'quarterly', 'semi_annual', 'annual'])
    .optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateCatalogItemInput = z.input<typeof UpdateCatalogItemSchema>;
export type UpdateCatalogItemDto = z.infer<typeof UpdateCatalogItemSchema>;
