import { z } from 'zod';

export const CreateCatalogItemSchema = z.object({
  sku: z.string().max(100).optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  unitPrice: z.number().min(0),
  currency: z.string().length(3).default('USD'),
  billingFrequency: z
    .enum(['one_time', 'monthly', 'quarterly', 'semi_annual', 'annual'])
    .default('one_time'),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateCatalogItemInput = z.input<typeof CreateCatalogItemSchema>;
export type CreateCatalogItemDto = z.infer<typeof CreateCatalogItemSchema>;
