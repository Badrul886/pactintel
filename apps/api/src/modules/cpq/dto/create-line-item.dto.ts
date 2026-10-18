import { z } from 'zod';

export const CreateLineItemSchema = z.object({
  pricingTableId: z.string().uuid(),
  productItemId: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  quantity: z
    .number()
    .positive()
    .refine(
      (val) =>
        Number((val % 0.0001).toFixed(6)) === 0 || Number((val % 0.0001).toFixed(6)) === 0.0001,
      {
        message: 'Quantity must be a multiple of 0.0001',
      },
    )
    .default(1),
  unitPrice: z
    .number()
    .min(0)
    .refine(
      (val) =>
        Number((val % 0.0001).toFixed(6)) === 0 || Number((val % 0.0001).toFixed(6)) === 0.0001,
      {
        message: 'Unit price must be a multiple of 0.0001',
      },
    ),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).default(0),
  billingFrequency: z
    .enum(['one_time', 'monthly', 'quarterly', 'semi_annual', 'annual'])
    .default('one_time'),
  isOptional: z.boolean().default(false),
  isSelected: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreateLineItemInput = z.input<typeof CreateLineItemSchema>;
export type CreateLineItemDto = z.infer<typeof CreateLineItemSchema>;
