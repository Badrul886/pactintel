import { z } from 'zod';

export const BuyerSelectionItemSchema = z.object({
  lineItemId: z.string().uuid(),
  isSelected: z.boolean(),
  quantity: z.number().positive().optional(),
});

export const UpdateBuyerSelectionsSchema = z.object({
  viewerSessionId: z.string().min(1).default('anonymous-session'),
  selections: z.array(BuyerSelectionItemSchema).min(1),
});

export type BuyerSelectionItem = z.infer<typeof BuyerSelectionItemSchema>;
export type UpdateBuyerSelectionsInput = z.input<typeof UpdateBuyerSelectionsSchema>;
export type UpdateBuyerSelectionsDto = z.infer<typeof UpdateBuyerSelectionsSchema>;
