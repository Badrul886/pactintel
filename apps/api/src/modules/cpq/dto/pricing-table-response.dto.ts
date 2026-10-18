export interface CalculatedLineItemTotal {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  subtotal: string;
  discount: string;
  net: string;
  isOptional: boolean;
  isSelected: boolean;
  billingFrequency: string;
  sortOrder: number;
}

export interface PricingTotalsResponse {
  subtotal: string;
  totalDiscount: string;
  taxAmount: string;
  total: string;
  currency: string;
  lineItems: CalculatedLineItemTotal[];
}

export interface PricingTableResponseDto {
  id: string;
  documentId: string;
  organizationId: string;
  displayFormat: string;
  discountRules: any[];
  taxConfig: any;
  settings: any;
  totals: PricingTotalsResponse;
  lineItems: any[];
  createdAt: string;
  updatedAt: string;
}
