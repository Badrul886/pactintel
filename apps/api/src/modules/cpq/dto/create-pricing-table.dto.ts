import { z } from 'zod';

export const DiscountRuleSchema = z.object({
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0),
  condition: z.string().optional(),
  label: z.string().optional(),
});

export const TaxConfigSchema = z.object({
  taxRate: z.number().min(0).max(1).default(0),
  taxLabel: z.string().default('Tax'),
  taxIncluded: z.boolean().default(false),
});

export const PricingTableSettingsSchema = z.object({
  showDiscount: z.boolean().default(true),
  showTax: z.boolean().default(true),
  currency: z.string().length(3).default('USD'),
  allowBuyerQuantityChange: z.boolean().default(false),
});

export const CreatePricingTableSchema = z.object({
  documentId: z.string().uuid(),
  displayFormat: z.enum(['line_items', 'tier_cards', 'combined']).default('line_items'),
  discountRules: z.array(DiscountRuleSchema).default([]),
  taxConfig: TaxConfigSchema.default({
    taxRate: 0,
    taxLabel: 'Tax',
    taxIncluded: false,
  }),
  settings: PricingTableSettingsSchema.default({
    showDiscount: true,
    showTax: true,
    currency: 'USD',
    allowBuyerQuantityChange: false,
  }),
});

export type CreatePricingTableInput = z.input<typeof CreatePricingTableSchema>;
export type CreatePricingTableDto = z.infer<typeof CreatePricingTableSchema>;
export type DiscountRule = z.infer<typeof DiscountRuleSchema>;
export type TaxConfig = z.infer<typeof TaxConfigSchema>;
export type PricingTableSettings = z.infer<typeof PricingTableSettingsSchema>;
