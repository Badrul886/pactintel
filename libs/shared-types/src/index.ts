import { z } from 'zod';

export * from './events';
export * from './casl';

// =============================================================================
// Status Enums & Literal Unions
// =============================================================================

export const DocumentStatusEnum = z.enum([
  'draft',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'archived',
  'voided',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusEnum>;

export const DocumentTypeEnum = z.enum([
  'proposal',
  'quote',
  'contract',
  'brochure',
  'sow',
  'sign_off',
  'job_offer',
  'form',
]);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const SignerStatusEnum = z.enum([
  'pending',
  'sent',
  'viewed',
  'signed',
  'declined',
  'reassigned',
]);
export type SignerStatus = z.infer<typeof SignerStatusEnum>;

export const SigningOrderEnum = z.enum(['parallel', 'sequential']);
export type SigningOrder = z.infer<typeof SigningOrderEnum>;

export const SignatureRequestStatusEnum = z.enum([
  'pending',
  'in_progress',
  'completed',
  'declined',
  'voided',
  'expired',
]);
export type SignatureRequestStatus = z.infer<typeof SignatureRequestStatusEnum>;

export const VerificationMethodEnum = z.enum([
  'none',
  'email',
  'passcode',
  'sms',
  'kba',
  'id_document',
  'qes',
]);
export type VerificationMethod = z.infer<typeof VerificationMethodEnum>;

export const PaymentStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'disputed',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

export const PaymentTypeEnum = z.enum(['full', 'deposit', 'installment', 'recurring']);
export type PaymentType = z.infer<typeof PaymentTypeEnum>;

export const PlanTierEnum = z.enum(['free', 'starter', 'professional', 'business', 'enterprise']);
export type PlanTier = z.infer<typeof PlanTierEnum>;

export const SubscriptionStatusEnum = z.enum([
  'active',
  'past_due',
  'paused',
  'cancelled',
  'trialing',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusEnum>;

export const UserRoleEnum = z.enum(['owner', 'admin', 'manager', 'member', 'collaborator']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const UserStatusEnum = z.enum(['active', 'pending', 'deactivated']);
export type UserStatus = z.infer<typeof UserStatusEnum>;

export const SeatTypeEnum = z.enum(['full', 'collab']);
export type SeatType = z.infer<typeof SeatTypeEnum>;

// =============================================================================
// API Envelopes & Pagination
// =============================================================================

export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

// =============================================================================
// Entity DTO Schemas
// =============================================================================

// --- Organization ---
export const OrganizationDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  cellId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;

export const CreateOrganizationDtoSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
});
export type CreateOrganizationDto = z.infer<typeof CreateOrganizationDtoSchema>;

// --- User ---
export const UserDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  role: UserRoleEnum,
  status: UserStatusEnum,
  seatType: SeatTypeEnum,
  createdAt: z.coerce.date(),
});
export type UserDto = z.infer<typeof UserDtoSchema>;

export const InviteUserDtoSchema = z.object({
  email: z.string().email(),
  role: UserRoleEnum.default('member'),
  seatType: SeatTypeEnum.default('full'),
});
export type InviteUserDto = z.infer<typeof InviteUserDtoSchema>;

// --- Document & Versions ---
export const DocumentDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1),
  type: DocumentTypeEnum,
  status: DocumentStatusEnum,
  slug: z.string().min(1),
  currency: z.string().default('USD'),
  totalValue: z.number().nullable().optional(),
  currentVersionId: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DocumentDto = z.infer<typeof DocumentDtoSchema>;

export const CreateDocumentDtoSchema = z.object({
  title: z.string().min(1).max(200),
  type: DocumentTypeEnum.default('proposal'),
  workspaceId: z.string().uuid(),
  currency: z.string().default('USD'),
  sourceTemplateId: z.string().uuid().optional(),
});
export type CreateDocumentDto = z.infer<typeof CreateDocumentDtoSchema>;

export const UpdateDocumentDtoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  totalValue: z.number().optional(),
  currency: z.string().optional(),
  passwordHash: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
  domainRestriction: z.array(z.string()).optional(),
});
export type UpdateDocumentDto = z.infer<typeof UpdateDocumentDtoSchema>;

export const DocumentVersionDtoSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  contentSnapshot: z.record(z.unknown()),
  contentHash: z.string(),
  isSigned: z.boolean(),
  isCurrent: z.boolean(),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type DocumentVersionDto = z.infer<typeof DocumentVersionDtoSchema>;

export const CreateDocumentVersionDtoSchema = z.object({
  contentSnapshot: z.record(z.unknown()),
});
export type CreateDocumentVersionDto = z.infer<typeof CreateDocumentVersionDtoSchema>;

// --- Signers & Signature Requests ---
export const SignerDtoSchema = z.object({
  id: z.string().uuid(),
  signatureRequestId: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  roleLabel: z.string().nullable().optional(),
  signingOrder: z.number().int().default(0),
  verificationMethod: VerificationMethodEnum.default('none'),
  status: SignerStatusEnum,
  signedAt: z.coerce.date().nullable().optional(),
});
export type SignerDto = z.infer<typeof SignerDtoSchema>;

export const SignatureRequestDtoSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  externalProviderId: z.string().nullable().optional(),
  status: SignatureRequestStatusEnum,
  signingOrder: SigningOrderEnum,
  signers: z.array(SignerDtoSchema).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SignatureRequestDto = z.infer<typeof SignatureRequestDtoSchema>;

export const CreateSignatureRequestDtoSchema = z.object({
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  signingOrder: SigningOrderEnum.default('parallel'),
  signers: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        roleLabel: z.string().optional(),
        signingOrder: z.number().int().default(0),
        verificationMethod: VerificationMethodEnum.default('none'),
        passcode: z.string().optional(),
      }),
    )
    .min(1),
});
export type CreateSignatureRequestDto = z.infer<typeof CreateSignatureRequestDtoSchema>;

export const ReassignSignerDtoSchema = z.object({
  newEmail: z.string().email(),
  newName: z.string().optional(),
  reason: z.string().min(1),
});
export type ReassignSignerDto = z.infer<typeof ReassignSignerDtoSchema>;

export const VerifySignerIdentityDtoSchema = z.object({
  passcode: z.string().optional(),
  otpCode: z.string().optional(),
});
export type VerifySignerIdentityDto = z.infer<typeof VerifySignerIdentityDtoSchema>;

export const SignWithTokenDtoSchema = z.object({
  signatureData: z.union([z.string(), z.record(z.unknown())]),
  legalAssent: z.boolean(),
});
export type SignWithTokenDto = z.infer<typeof SignWithTokenDtoSchema>;

export const DeclineWithTokenDtoSchema = z.object({
  reason: z.string().min(1),
});
export type DeclineWithTokenDto = z.infer<typeof DeclineWithTokenDtoSchema>;

// --- Payments ---
export const PaymentDtoSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid(),
  payerEmail: z.string().email(),
  payerName: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string(),
  status: PaymentStatusEnum,
  paymentType: PaymentTypeEnum,
  externalCheckoutUrl: z.string().nullable().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type PaymentDto = z.infer<typeof PaymentDtoSchema>;

export const InitiatePaymentDtoSchema = z.object({
  documentId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  payerEmail: z.string().email(),
  payerName: z.string().optional(),
});
export type InitiatePaymentDto = z.infer<typeof InitiatePaymentDtoSchema>;

// --- Billing & Subscriptions ---
export const SubscriptionDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  planTier: PlanTierEnum,
  status: SubscriptionStatusEnum,
  fullSeatLimit: z.number().int(),
  fullSeatCount: z.number().int(),
  documentLimit: z.number().int().nullable().optional(),
  documentsUsedThisPeriod: z.number().int(),
  billingCycle: z.enum(['monthly', 'annual']),
  currentPeriodStart: z.coerce.date().nullable().optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
});
export type SubscriptionDto = z.infer<typeof SubscriptionDtoSchema>;

// --- Templates (Phase 1 Sprint 1) ---
export const TemplateVariableFieldTypeEnum = z.enum(['text', 'number', 'date', 'email']);
export type TemplateVariableFieldType = z.infer<typeof TemplateVariableFieldTypeEnum>;

export const TemplateVariableFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: TemplateVariableFieldTypeEnum,
  required: z.boolean().default(false),
});
export type TemplateVariableField = z.infer<typeof TemplateVariableFieldSchema>;

export const TemplateSignerRoleSchema = z.object({
  roleLabel: z.string().min(1),
  verificationMethod: z.enum(['none', 'email', 'passcode', 'sms']).default('none'),
});
export type TemplateSignerRole = z.infer<typeof TemplateSignerRoleSchema>;

export const TemplateDefaultSettingsSchema = z.object({
  expiresInDays: z.number().int().positive().optional(),
  maxViews: z.number().int().positive().optional(),
  domainRestriction: z.array(z.string()).optional(),
  requirePassword: z.boolean().optional(),
});
export type TemplateDefaultSettings = z.infer<typeof TemplateDefaultSettingsSchema>;

export const CreateTemplateDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  category: z.string().max(100).optional(),
  industryTags: z.array(z.string().max(50)).max(10).optional().default([]),
  content: z.record(z.unknown()),
  defaultSettings: TemplateDefaultSettingsSchema.optional().default({}),
  variableFields: z.array(TemplateVariableFieldSchema).optional().default([]),
  signerRoles: z.array(TemplateSignerRoleSchema).optional().default([]),
  folderId: z.string().uuid().optional(),
});
export type CreateTemplateDto = z.input<typeof CreateTemplateDtoSchema>;

export const UpdateTemplateDtoSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  category: z.string().max(100).optional(),
  industryTags: z.array(z.string().max(50)).max(10).optional(),
  content: z.record(z.unknown()).optional(),
  defaultSettings: TemplateDefaultSettingsSchema.optional(),
  variableFields: z.array(TemplateVariableFieldSchema).optional(),
  signerRoles: z.array(TemplateSignerRoleSchema).optional(),
  folderId: z.string().uuid().nullable().optional(),
});
export type UpdateTemplateDto = z.input<typeof UpdateTemplateDtoSchema>;

export const CreateFromTemplateDtoSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  variables: z
    .record(z.union([z.string(), z.number()]))
    .optional()
    .default({}),
});
export type CreateFromTemplateDto = z.input<typeof CreateFromTemplateDtoSchema>;

export const SaveDocumentAsTemplateDtoSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  category: z.string().max(100).optional(),
  industryTags: z.array(z.string().max(50)).max(10).optional().default([]),
  folderId: z.string().uuid().optional(),
});
export type SaveDocumentAsTemplateDto = z.input<typeof SaveDocumentAsTemplateDtoSchema>;

export const TemplateResponseDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string(),
  category: z.string().nullable().optional(),
  industryTags: z.array(z.string()),
  content: z.record(z.unknown()),
  defaultSettings: z.record(z.unknown()),
  variableFields: z.array(z.record(z.unknown())),
  signerRoles: z.array(z.record(z.unknown())),
  isSystem: z.boolean(),
  usageCount: z.number().int(),
  folderId: z.string().uuid().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TemplateResponseDto = z.infer<typeof TemplateResponseDtoSchema>;

// --- Content Blocks (Phase 1 Sprint 1) ---
export const ContentBlockTypeEnum = z.enum(['text', 'image', 'case_study', 'clause', 'bio']);
export type ContentBlockType = z.infer<typeof ContentBlockTypeEnum>;

export const CreateContentBlockDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: ContentBlockTypeEnum,
  content: z.record(z.unknown()),
  tags: z.array(z.string().max(50)).optional().default([]),
});
export type CreateContentBlockDto = z.input<typeof CreateContentBlockDtoSchema>;

export const UpdateContentBlockDtoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: ContentBlockTypeEnum.optional(),
  content: z.record(z.unknown()).optional(),
  tags: z.array(z.string().max(50)).optional(),
});
export type UpdateContentBlockDto = z.input<typeof UpdateContentBlockDtoSchema>;

// --- Folders (Phase 1 Sprint 1) ---
export const FolderEntityTypeEnum = z.enum(['document', 'template']);
export type FolderEntityType = z.infer<typeof FolderEntityTypeEnum>;

export const CreateFolderDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  entityType: FolderEntityTypeEnum,
  parentId: z.string().uuid().optional(),
});
export type CreateFolderDto = z.input<typeof CreateFolderDtoSchema>;

export const UpdateFolderDtoSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type UpdateFolderDto = z.input<typeof UpdateFolderDtoSchema>;

// --- CPQ & Interactive Pricing Tables (Phase 1 Sprint 2) ---
export const PricingTableDisplayFormatEnum = z.enum(['line_items', 'tier_cards', 'combined']);
export type PricingTableDisplayFormat = z.infer<typeof PricingTableDisplayFormatEnum>;

export const BillingFrequencyEnum = z.enum([
  'one_time',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
]);
export type BillingFrequency = z.infer<typeof BillingFrequencyEnum>;

export const DiscountRuleDtoSchema = z.object({
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0),
  condition: z.string().optional(),
  label: z.string().optional(),
});
export type DiscountRuleDto = z.infer<typeof DiscountRuleDtoSchema>;

export const TaxConfigDtoSchema = z.object({
  taxRate: z.number().min(0).max(1).default(0),
  taxLabel: z.string().default('Tax'),
  taxIncluded: z.boolean().default(false),
});
export type TaxConfigDto = z.input<typeof TaxConfigDtoSchema>;

export const PricingTableSettingsDtoSchema = z.object({
  showDiscount: z.boolean().default(true),
  showTax: z.boolean().default(true),
  currency: z.string().length(3).default('USD'),
  allowBuyerQuantityChange: z.boolean().default(false),
});
export type PricingTableSettingsDto = z.input<typeof PricingTableSettingsDtoSchema>;

export const CreatePricingTableDtoSchema = z.object({
  documentId: z.string().uuid(),
  displayFormat: PricingTableDisplayFormatEnum.default('line_items'),
  discountRules: z.array(DiscountRuleDtoSchema).default([]),
  taxConfig: TaxConfigDtoSchema.default({ taxRate: 0, taxLabel: 'Tax', taxIncluded: false }),
  settings: PricingTableSettingsDtoSchema.default({
    showDiscount: true,
    showTax: true,
    currency: 'USD',
    allowBuyerQuantityChange: false,
  }),
});
export type CreatePricingTableDto = z.input<typeof CreatePricingTableDtoSchema>;

export const UpdatePricingTableDtoSchema = z.object({
  displayFormat: PricingTableDisplayFormatEnum.optional(),
  discountRules: z.array(DiscountRuleDtoSchema).optional(),
  taxConfig: TaxConfigDtoSchema.optional(),
  settings: PricingTableSettingsDtoSchema.optional(),
});
export type UpdatePricingTableDto = z.input<typeof UpdatePricingTableDtoSchema>;

export const CreateLineItemDtoSchema = z.object({
  pricingTableId: z.string().uuid(),
  productItemId: z.string().uuid().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).default(0),
  billingFrequency: BillingFrequencyEnum.default('one_time'),
  isOptional: z.boolean().default(false),
  isSelected: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CreateLineItemDto = z.input<typeof CreateLineItemDtoSchema>;

export const UpdateLineItemDtoSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  productItemId: z.string().uuid().optional().nullable(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  discountAmount: z.number().min(0).optional().nullable(),
  billingFrequency: BillingFrequencyEnum.optional(),
  isOptional: z.boolean().optional(),
  isSelected: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateLineItemDto = z.input<typeof UpdateLineItemDtoSchema>;

export const BuyerSelectionItemDtoSchema = z.object({
  lineItemId: z.string().uuid(),
  isSelected: z.boolean(),
  quantity: z.number().positive().optional(),
});
export type BuyerSelectionItemDto = z.infer<typeof BuyerSelectionItemDtoSchema>;

export const UpdateBuyerSelectionsDtoSchema = z.object({
  viewerSessionId: z.string().min(1).default('anonymous-session'),
  selections: z.array(BuyerSelectionItemDtoSchema).min(1),
});
export type UpdateBuyerSelectionsDto = z.input<typeof UpdateBuyerSelectionsDtoSchema>;

export const ReorderLineItemsDtoSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});
export type ReorderLineItemsDto = z.input<typeof ReorderLineItemsDtoSchema>;

export const CreateCatalogItemDtoSchema = z.object({
  sku: z.string().max(100).optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  unitPrice: z.number().min(0),
  currency: z.string().length(3).default('USD'),
  billingFrequency: BillingFrequencyEnum.default('one_time'),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateCatalogItemDto = z.input<typeof CreateCatalogItemDtoSchema>;

export const UpdateCatalogItemDtoSchema = z.object({
  sku: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  billingFrequency: BillingFrequencyEnum.optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateCatalogItemDto = z.input<typeof UpdateCatalogItemDtoSchema>;

export const CreatePricingTableSchema = CreatePricingTableDtoSchema;
export const UpdatePricingTableSchema = UpdatePricingTableDtoSchema;
export const CreateLineItemSchema = CreateLineItemDtoSchema;
export const UpdateLineItemSchema = UpdateLineItemDtoSchema;
export const UpdateBuyerSelectionsSchema = UpdateBuyerSelectionsDtoSchema;
export const ReorderLineItemsSchema = ReorderLineItemsDtoSchema;
export const CreateCatalogItemSchema = CreateCatalogItemDtoSchema;
export const UpdateCatalogItemSchema = UpdateCatalogItemDtoSchema;

export interface ProductCatalogItem {
  id: string;
  organizationId: string;
  sku: string | null;
  name: string;
  description: string | null;
  unitPrice: string | number;
  currency: string;
  billingFrequency: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

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
  lineDiscount?: string;
  lineNet?: string;
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

// --- Brand Kit (Phase 1 Sprint 3) ---
export const HexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const CreateBrandKitDtoSchema = z.object({
  name: z.string().min(1).max(100),
  workspaceId: z.string().uuid().optional(),
  primaryColor: z.string().regex(HexColorRegex, 'Primary color must be in #RRGGBB format'),
  secondaryColor: z.string().regex(HexColorRegex).optional(),
  accentColor: z.string().regex(HexColorRegex).optional(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  fontHeading: z.string().max(100).optional(),
  fontBody: z.string().max(100).optional(),
  customCss: z.string().max(50000).optional(),
  emailFromName: z.string().max(100).optional(),
  emailFromDomain: z.string().max(100).optional(),
  removeBadge: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});
export type CreateBrandKitDto = z.input<typeof CreateBrandKitDtoSchema>;

export const UpdateBrandKitDtoSchema = CreateBrandKitDtoSchema.partial();
export type UpdateBrandKitDto = z.input<typeof UpdateBrandKitDtoSchema>;

export interface BrandKitResponseDto {
  id: string;
  organizationId: string;
  name: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  customCss: string | null;
  emailFromName: string | null;
  emailFromDomain: string | null;
  removeBadge: boolean;
  isDefault: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

// --- Notifications (Phase 1 Sprint 3) ---
export const NotificationChannelEnum = z.enum(['email', 'in_app', 'push']);
export type NotificationChannel = z.infer<typeof NotificationChannelEnum>;

export const NotificationEventTypeEnum = z.enum([
  'document_viewed',
  'document_signed',
  'document_declined',
  'document_expired',
  'signing_invitation',
  'billing_alert',
  'system_alert',
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeEnum>;

export const InAppNotificationDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: NotificationEventTypeEnum,
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2000),
  resourceType: z.string().optional().nullable(),
  resourceId: z.string().optional().nullable(),
  isRead: z.boolean().default(false),
  readAt: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date(),
});
export type InAppNotificationDto = z.infer<typeof InAppNotificationDtoSchema>;

export const NotificationPreferenceItemSchema = z.object({
  channel: NotificationChannelEnum,
  eventType: NotificationEventTypeEnum,
  isEnabled: z.boolean(),
});
export type NotificationPreferenceItem = z.infer<typeof NotificationPreferenceItemSchema>;

export const UpdateNotificationPreferencesDtoSchema = z.object({
  preferences: z.array(NotificationPreferenceItemSchema),
});
export type UpdateNotificationPreferencesDto = z.infer<
  typeof UpdateNotificationPreferencesDtoSchema
>;

// --- Analytics Telemetry (Phase 1 Sprint 3) ---
export const HeartbeatDtoSchema = z.object({
  documentSlug: z.string().min(1),
  sessionId: z.string().min(1),
  durationMs: z.number().int().min(1).max(3600000), // Max 1 hour per heartbeat
});
export type HeartbeatDto = z.infer<typeof HeartbeatDtoSchema>;

export interface DocumentAnalyticsSummary {
  documentId: string;
  uniqueViews: number;
  totalDurationSeconds: number;
  lastViewedAt: string | null;
  sessionsCount: number;
}
