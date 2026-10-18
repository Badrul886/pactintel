import { z } from 'zod';
import {
  DiscountRuleSchema,
  TaxConfigSchema,
  PricingTableSettingsSchema,
} from './create-pricing-table.dto';

export const UpdatePricingTableSchema = z.object({
  displayFormat: z.enum(['line_items', 'tier_cards', 'combined']).optional(),
  discountRules: z.array(DiscountRuleSchema).optional(),
  taxConfig: TaxConfigSchema.optional(),
  settings: PricingTableSettingsSchema.optional(),
});

export type UpdatePricingTableInput = z.input<typeof UpdatePricingTableSchema>;
export type UpdatePricingTableDto = z.infer<typeof UpdatePricingTableSchema>;
