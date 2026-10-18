import { z } from 'zod';

export const UpdateLineItemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  productItemId: z.string().uuid().optional().nullable(),
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
    .optional(),
  unitPrice: z
    .number()
    .min(0)
    .refine(
      (val) =>
        Number((val % 0.0001).toFixed(6)) === 0 || Number((val % 0.0001).toFixed(6)) === 0.0001,
      {
        message: 'Unit price must be a multiple of 0.0001',
      },
    )
    .optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  discountAmount: z.number().min(0).optional().nullable(),
  billingFrequency: z
    .enum(['one_time', 'monthly', 'quarterly', 'semi_annual', 'annual'])
    .optional(),
  isOptional: z.boolean().optional(),
  isSelected: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateLineItemInput = z.input<typeof UpdateLineItemSchema>;
export type UpdateLineItemDto = z.infer<typeof UpdateLineItemSchema>;
