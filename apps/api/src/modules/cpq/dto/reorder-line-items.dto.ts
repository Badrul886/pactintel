import { z } from 'zod';

export const ReorderLineItemsSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export type ReorderLineItemsInput = z.input<typeof ReorderLineItemsSchema>;
export type ReorderLineItemsDto = z.infer<typeof ReorderLineItemsSchema>;
