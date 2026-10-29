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
export const TemplateVariableFieldTypeEnum = z.enum([
  'text',
  'number',
  'date',
  'email',
  'single_select',
  'multi_select',
  'crm_field',
]);
export type TemplateVariableFieldType = z.infer<typeof TemplateVariableFieldTypeEnum>;

export const TemplateIntakeQuestionConditionSchema = z.object({
  questionId: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'is_truthy']),
  value: z.any().optional(),
});
export type TemplateIntakeQuestionCondition = z.infer<typeof TemplateIntakeQuestionConditionSchema>;

export const TemplateVariableFieldSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  label: z.string().min(1),
  type: TemplateVariableFieldTypeEnum,
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  crmFieldMapping: z.string().optional(),
  placeholder: z.string().optional(),
  dependsOn: TemplateIntakeQuestionConditionSchema.optional(),
});
export type TemplateVariableField = z.infer<typeof TemplateVariableFieldSchema>;

export const TemplateIntakeQuestionSchema = TemplateVariableFieldSchema;
export type TemplateIntakeQuestion = TemplateVariableField;

export const TemplateSignerRoleSchema = z.object({
  roleLabel: z.string().min(1),
  verificationMethod: VerificationMethodEnum.default('none'),
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
  visibility: z.enum(['workspace', 'organization']).optional().default('workspace'),
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
  visibility: z.enum(['workspace', 'organization']).optional(),
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
  visibility: z.string().optional(),
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
  visibility: z.enum(['workspace', 'organization']).optional().default('workspace'),
});
export type CreateContentBlockDto = z.input<typeof CreateContentBlockDtoSchema>;

export const UpdateContentBlockDtoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: ContentBlockTypeEnum.optional(),
  content: z.record(z.unknown()).optional(),
  tags: z.array(z.string().max(50)).optional(),
  visibility: z.enum(['workspace', 'organization']).optional(),
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

// --- CPQ Full Enterprise Suite: Bundles, Rules, Playbooks (Phase 3 Sprint 3.1) ---

export const BundleTypeEnum = z.enum(['fixed', 'sum_of_items', 'percent_discount']);
export type BundleType = z.infer<typeof BundleTypeEnum>;

export const CreateBundleItemDtoSchema = z.object({
  productItemId: z.string().uuid(),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  quantity: z.number().positive().default(1),
});
export type CreateBundleItemDto = z.input<typeof CreateBundleItemDtoSchema>;

export const UpdateBundleItemDtoSchema = z.object({
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  quantity: z.number().positive().optional(),
});
export type UpdateBundleItemDto = z.input<typeof UpdateBundleItemDtoSchema>;

export const CreateBundleDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  bundleType: BundleTypeEnum,
  fixedPrice: z.number().min(0).optional().nullable(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  items: z.array(CreateBundleItemDtoSchema).default([]),
});
export type CreateBundleDto = z.input<typeof CreateBundleDtoSchema>;

export const UpdateBundleDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  bundleType: BundleTypeEnum.optional(),
  fixedPrice: z.number().min(0).optional().nullable(),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateBundleDto = z.input<typeof UpdateBundleDtoSchema>;

export interface BundleItemResponseDto {
  id: string;
  bundleId: string;
  organizationId: string;
  productItemId: string;
  productItem?: ProductCatalogItem;
  isRequired: boolean;
  sortOrder: number;
  quantity: string | number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface BundleResponseDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  bundleType: BundleType;
  fixedPrice: string | number | null;
  discountPercent: string | number | null;
  isActive: boolean;
  version: number;
  items: BundleItemResponseDto[];
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

export const PricingRuleTypeEnum = z.enum([
  'volume_discount',
  'deal_value_threshold',
  'customer_segment',
  'time_based',
  'stacking_policy',
]);
export type PricingRuleType = z.infer<typeof PricingRuleTypeEnum>;

export const StackingModeEnum = z.enum(['stack_all', 'highest_wins', 'first_match']);
export type StackingMode = z.infer<typeof StackingModeEnum>;

export const CreatePricingRuleDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  ruleType: PricingRuleTypeEnum,
  conditions: z.record(z.unknown()).default({}),
  actions: z.record(z.unknown()).default({}),
  priority: z.number().int().default(0),
  stackingMode: StackingModeEnum.default('highest_wins'),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
});
export type CreatePricingRuleDto = z.input<typeof CreatePricingRuleDtoSchema>;

export const UpdatePricingRuleDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  ruleType: PricingRuleTypeEnum.optional(),
  conditions: z.record(z.unknown()).optional(),
  actions: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  stackingMode: StackingModeEnum.optional(),
  isActive: z.boolean().optional(),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
});
export type UpdatePricingRuleDto = z.input<typeof UpdatePricingRuleDtoSchema>;

export interface PricingRuleResponseDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  ruleType: PricingRuleType;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  priority: number;
  stackingMode: StackingMode;
  isActive: boolean;
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

export const CreatePlaybookDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  steps: z.array(z.record(z.unknown())).default([]),
});
export type CreatePlaybookDto = z.input<typeof CreatePlaybookDtoSchema>;

export const UpdatePlaybookDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  steps: z.array(z.record(z.unknown())).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePlaybookDto = z.input<typeof UpdatePlaybookDtoSchema>;

export const ExecutePlaybookDtoSchema = z.object({
  dealAttributes: z.record(z.union([z.string(), z.number(), z.boolean()])),
});
export type ExecutePlaybookDto = z.input<typeof ExecutePlaybookDtoSchema>;

export interface PlaybookResponseDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  steps: Record<string, unknown>[];
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

export const CpqLineItemInputSchema = z.object({
  id: z.string(),
  productItemId: z.string().uuid().optional().nullable(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  discountPercent: z.number().min(0).max(100).optional().nullable(),
  discountAmount: z.number().min(0).optional().nullable(),
  billingFrequency: z.string().optional().nullable(),
  isOptional: z.boolean().optional(),
  isSelected: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type CpqLineItemInput = z.infer<typeof CpqLineItemInputSchema>;

export const EvaluateCpqDtoSchema = z.object({
  lineItems: z.array(CpqLineItemInputSchema).min(1),
  dealAttributes: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  timestamp: z.string().datetime().optional(),
});
export type EvaluateCpqDto = z.input<typeof EvaluateCpqDtoSchema>;

export interface AppliedRuleDto {
  ruleId: string;
  ruleName: string;
  ruleType: PricingRuleType;
  discountAmount: string;
  targetLineItemId?: string;
  description: string;
}

export interface CpqEvaluationResultDto {
  appliedRules: AppliedRuleDto[];
  finalLineItems: CalculatedLineItemTotal[];
  totalBeforeDiscount: string;
  totalAfterDiscount: string;
  discountAmount: string;
  requiresApproval: boolean;
  approvalReasons: string[];
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

// --- Section Analytics (Phase 2 Sprint 2.1) ---
export const SectionViewEventSchema = z.object({
  blockId: z.string().min(1).max(255),
  sectionTitle: z.string().max(255).optional().nullable(),
  durationMs: z.number().int().min(0).max(3600000),
  visibilityPct: z.number().min(0).max(1),
  scrollDepthPct: z.number().min(0).max(1).optional().nullable(),
});
export type SectionViewEvent = z.infer<typeof SectionViewEventSchema>;

export const BatchSectionEventsDtoSchema = z.object({
  documentSlug: z.string().min(1),
  sessionId: z.string().min(1),
  events: z.array(SectionViewEventSchema).min(1).max(50),
});
export type BatchSectionEventsDto = z.infer<typeof BatchSectionEventsDtoSchema>;

export interface SectionAnalyticsSummary {
  blockId: string;
  sectionTitle: string | null;
  totalDurationMs: number;
  avgVisibilityPct: number;
  uniqueSessions: number;
  viewsCount: number;
}

export interface ViewerSessionSummary {
  sessionId: string;
  viewerEmail: string | null;
  firstOpenedAt: string;
  lastActiveAt: string;
  viewsCount: number;
  timeSpentSeconds: number;
  device: string;
  country: string | null;
}

export interface DocumentAnalyticsFullResponse {
  summary: DocumentAnalyticsSummary;
  completionRate: number;
  sections: SectionAnalyticsSummary[];
  viewers: ViewerSessionSummary[];
  nextCursor: string | null;
}

// --- Comments & Threads (Phase 2 Sprint 2.3) ---
export const CommentAuthorDtoSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().email(),
  avatarUrl: z.string().nullable().optional(),
});
export type CommentAuthorDto = z.infer<typeof CommentAuthorDtoSchema>;

export const CreateCommentDtoSchema = z.object({
  content: z.string().min(1).max(10000),
  blockId: z.string().max(255).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  documentVersionId: z.string().uuid().optional().nullable(),
});
export type CreateCommentDto = z.infer<typeof CreateCommentDtoSchema>;

export const UpdateCommentDtoSchema = z.object({
  content: z.string().min(1).max(10000),
});
export type UpdateCommentDto = z.infer<typeof UpdateCommentDtoSchema>;

export const CommentReplyDtoSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  authorId: z.string(),
  author: CommentAuthorDtoSchema,
  parentId: z.string(),
  blockId: z.string().nullable().optional(),
  content: z.string(),
  isResolved: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});
export type CommentReplyDto = z.infer<typeof CommentReplyDtoSchema>;

export const CommentThreadDtoSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  authorId: z.string(),
  author: CommentAuthorDtoSchema,
  parentId: z.null().optional(),
  blockId: z.string().nullable().optional(),
  content: z.string(),
  isResolved: z.boolean(),
  resolvedById: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  replies: z.array(CommentReplyDtoSchema),
});
export type CommentThreadDto = z.infer<typeof CommentThreadDtoSchema>;

export const ListCommentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  blockId: z.string().optional(),
  isResolved: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});
export type ListCommentsQuery = z.infer<typeof ListCommentsQuerySchema>;

export interface CommentsListResponseDto {
  items: CommentThreadDto[];
  nextCursor: string | null;
  totalCount: number;
}

// --- Content Locking (Phase 2 Sprint 2.3) ---
export const LockBlockDtoSchema = z.object({
  blockId: z.string().min(1).max(255),
});
export type LockBlockDto = z.infer<typeof LockBlockDtoSchema>;

export const ContentLockDtoSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  blockId: z.string(),
  lockedById: z.string(),
  lockedBy: CommentAuthorDtoSchema.optional(),
  lockedAt: z.string(),
});
export type ContentLockDto = z.infer<typeof ContentLockDtoSchema>;

export const ContentLockEventSchema = z.object({
  action: z.enum(['locked', 'unlocked']),
  documentId: z.string(),
  blockId: z.string(),
  lockedById: z.string(),
  lockedAt: z.string(),
});
export type ContentLockEvent = z.infer<typeof ContentLockEventSchema>;

// --- Approval Workflows (Phase 2 Sprint 2.4) ---
export const CreateApprovalStepDtoSchema = z.object({
  stepOrder: z.number().int().positive(),
  approverId: z.string().uuid().optional().nullable(),
  fallbackApproverId: z.string().uuid().optional().nullable(),
  timeoutHours: z.number().int().min(1).max(720).default(168),
});
export type CreateApprovalStepDto = z.infer<typeof CreateApprovalStepDtoSchema>;

export const CpqApprovalConditionsSchema = z.object({
  dealValueGt: z.number().positive().optional().nullable(),
  discountPctGt: z.number().min(0).max(100).optional().nullable(),
  restrictedProductIds: z.array(z.string().uuid()).optional().nullable(),
});
export type CpqApprovalConditions = z.infer<typeof CpqApprovalConditionsSchema>;

export const ApprovalConditionsSchema = z.object({
  triggerOn: z.enum(['document.sent', 'document.signed', 'manual']),
  minDealValue: z.number().positive().optional().nullable(),
  workspaceIds: z.array(z.string().uuid()).optional().nullable(),
  cpqConditions: CpqApprovalConditionsSchema.optional().nullable(),
});
export type ApprovalConditions = z.infer<typeof ApprovalConditionsSchema>;

export const CreateApprovalChainDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  conditions: ApprovalConditionsSchema,
  cpqConditions: CpqApprovalConditionsSchema.optional().nullable(),
  steps: z.array(CreateApprovalStepDtoSchema).min(1).max(10),
});
export type CreateApprovalChainDto = z.infer<typeof CreateApprovalChainDtoSchema>;

export const SubmitApprovalDecisionDtoSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).optional().nullable(),
});
export type SubmitApprovalDecisionDto = z.infer<typeof SubmitApprovalDecisionDtoSchema>;

export interface ApprovalStepDto {
  id: string;
  approvalChainId: string;
  organizationId: string;
  documentId: string | null;
  stepOrder: number;
  approverId: string | null;
  approver?: { id: string; name: string | null; email: string } | null;
  fallbackApproverId: string | null;
  fallbackApprover?: { id: string; name: string | null; email: string } | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  timeoutHours: number;
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalChainDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  conditions: ApprovalConditions;
  cpqConditions?: CpqApprovalConditions | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  steps: ApprovalStepDto[];
}

// --- Automation Rules (Phase 2 Sprint 2.4) ---
export const AutomationConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'gt', 'lt', 'contains', 'not_eq']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type AutomationCondition = z.infer<typeof AutomationConditionSchema>;

export const AutomationActionSchema = z.object({
  type: z.enum([
    'send_notification',
    'send_email',
    'add_to_follow_up',
    'trigger_webhook',
    'update_document_tag',
  ]),
  config: z.record(z.unknown()),
});
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

export const CreateAutomationRuleDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  triggerEvent: z.enum([
    'document.signed',
    'document.viewed',
    'document.sent',
    'document.expired',
    'approval.chain.approved',
    'approval.chain.rejected',
  ]),
  conditions: z.array(AutomationConditionSchema).max(5).default([]),
  actions: z.array(AutomationActionSchema).min(1).max(5),
});
export type CreateAutomationRuleDto = z.infer<typeof CreateAutomationRuleDtoSchema>;

export const UpdateAutomationRuleDtoSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  conditions: z.array(AutomationConditionSchema).max(5).optional(),
  actions: z.array(AutomationActionSchema).min(1).max(5).optional(),
});
export type UpdateAutomationRuleDto = z.infer<typeof UpdateAutomationRuleDtoSchema>;

export const TestAutomationRuleDtoSchema = z.object({
  samplePayload: z.record(z.unknown()),
});
export type TestAutomationRuleDto = z.infer<typeof TestAutomationRuleDtoSchema>;

export interface AutomationRuleDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  triggerEvent: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// --- In-Editor AI Drafting (Phase 2 Sprint 2.5) ---
export const AiTaskEnum = z.enum([
  'DRAFT_SECTION_V1',
  'REFINE_TEXT_V1',
  'GRAMMAR_FIX_V1',
  'TRANSLATE_V1',
  'draft-section',
  'refine-text',
  'grammar-fix',
  'translate',
  'guided-proposal-assembly',
  'url-to-draft',
  'document-extraction',
  'portfolio-report',
  'counterparty-normalization',
]);
export type AiTaskId = z.infer<typeof AiTaskEnum>;

export const AiDraftInputSchema = z
  .object({
    task: z.string().min(1).max(2000).optional(),
    originalText: z.string().min(1).max(50000).optional(),
    instruction: z.enum(['grammar_fix', 'condense', 'expand', 'change_tone', 'custom']).optional(),
    tone: z.enum(['professional', 'friendly', 'formal', 'casual']).optional(),
    documentContext: z.string().max(500).optional(), // Max 500 chars, summary only (RULE AI-014)
    additionalInstructions: z.string().max(500).optional(),
    sectionTitle: z.string().optional(),
    documentType: z.string().optional(),
    keyPoints: z.array(z.string()).optional(),
    text: z.string().optional(),
    targetLanguage: z.string().optional(),
  })
  .passthrough();
export type AiDraftInput = z.infer<typeof AiDraftInputSchema>;

export const AiDraftDtoSchema = z.object({
  documentId: z.string().uuid().optional().nullable(),
  taskId: AiTaskEnum,
  input: AiDraftInputSchema,
});
export type AiDraftDto = z.infer<typeof AiDraftDtoSchema>;

export interface AiResponseDto {
  content: string;
  taskId: string;
  tokensUsed: number;
}

// --- Sprint 3.4: Guided Proposal Builder & URL-to-Draft ---
export const AssembleProposalDtoSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().min(1).max(250).optional(),
  workspaceId: z.string().uuid().optional(),
  answers: z.record(z.any()),
  crmEntityId: z.string().optional(),
});
export type AssembleProposalDto = z.infer<typeof AssembleProposalDtoSchema>;

export interface AssembledProposalResponseDto {
  title: string;
  content: Record<string, unknown>;
  crmDataUsed: Record<string, unknown>;
  crmWarning?: string | null;
  tokensUsed: number;
}

export const UrlToDraftDtoSchema = z.object({
  url: z.string().url(),
});
export type UrlToDraftDto = z.infer<typeof UrlToDraftDtoSchema>;

export interface UrlToDraftResponseDto {
  title: string;
  summary: string;
  content: Record<string, unknown>;
  tokensUsed: number;
}

// --- Document Expiry & Reminders (Phase 2 Sprint 2.6) ---
export const UpdateDocumentSettingsDtoSchema = z.object({
  expiresInDays: z.number().int().min(1).max(730).nullable().optional(),
  inactivityReminderDays: z.number().int().min(1).max(365).nullable().optional(),
});
export type UpdateDocumentSettingsDto = z.infer<typeof UpdateDocumentSettingsDtoSchema>;

export const FollowUpReasonEnum = z.enum(['inactivity', 'expiry_warning', 'custom']);
export type FollowUpReason = z.infer<typeof FollowUpReasonEnum>;

export const FollowUpStatusEnum = z.enum(['pending', 'sent', 'snoozed', 'dismissed']);
export type FollowUpStatus = z.infer<typeof FollowUpStatusEnum>;

export const FollowUpQueueItemSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  documentId: z.string().uuid(),
  ownerId: z.string().uuid(),
  scheduledFor: z.coerce.date(),
  reason: FollowUpReasonEnum,
  status: FollowUpStatusEnum,
  sentAt: z.coerce.date().nullable().optional(),
  snoozedUntil: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  document: z
    .object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      status: z.string(),
      lastViewedAt: z.coerce.date().nullable().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
    })
    .optional(),
  owner: z
    .object({
      id: z.string(),
      name: z.string().nullable().optional(),
      email: z.string(),
    })
    .optional(),
});
export type FollowUpQueueItem = z.infer<typeof FollowUpQueueItemSchema>;

export const SnoozeFollowUpDtoSchema = z.object({
  snoozedUntil: z.coerce.date(),
});
export type SnoozeFollowUpDto = z.infer<typeof SnoozeFollowUpDtoSchema>;

// --- Webhooks (Sprint 2.7) ---
export const WebhookEventEnum = z.enum([
  'document.created',
  'document.sent',
  'document.viewed',
  'document.signed',
  'document.declined',
  'document.expired',
  'document.voided',
  'approval.chain.approved',
  'approval.chain.rejected',
  'payment.completed',
  'payment.failed',
  'comment.created',
  'follow_up.sent',
]);
export type WebhookEvent = z.infer<typeof WebhookEventEnum>;

export const CreateWebhookDtoSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(WebhookEventEnum).min(1).max(20),
});
export type CreateWebhookDto = z.infer<typeof CreateWebhookDtoSchema>;

export const UpdateWebhookDtoSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events: z.array(WebhookEventEnum).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookDto = z.infer<typeof UpdateWebhookDtoSchema>;

export const WebhookDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  isActive: z.boolean(),
  failureCount: z.number().int(),
  lastTriggeredAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  secret: z.string().optional(),
});
export type WebhookDto = z.infer<typeof WebhookDtoSchema>;

export const WebhookDeliveryLogDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  webhookId: z.string().uuid(),
  eventId: z.string(),
  eventType: z.string(),
  payloadHash: z.string(),
  attemptNumber: z.number().int(),
  httpStatus: z.number().int().nullable().optional(),
  responseBody: z.string().nullable().optional(),
  deliveredAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type WebhookDeliveryLogDto = z.infer<typeof WebhookDeliveryLogDtoSchema>;

// --- Clickwrap (Sprint 2.7) ---
export const CreateClickwrapAgreementDtoSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(3)
    .max(100),
});
export type CreateClickwrapAgreementDto = z.infer<typeof CreateClickwrapAgreementDtoSchema>;

export const CreateClickwrapVersionDtoSchema = z.object({
  content: z.string().min(10).max(100000),
});
export type CreateClickwrapVersionDto = z.infer<typeof CreateClickwrapVersionDtoSchema>;

export const RecordClickwrapAcceptanceDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});
export type RecordClickwrapAcceptanceDto = z.infer<typeof RecordClickwrapAcceptanceDtoSchema>;

export const ClickwrapAgreementDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ClickwrapAgreementDto = z.infer<typeof ClickwrapAgreementDtoSchema>;

export const ClickwrapVersionDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  clickwrapAgreementId: z.string().uuid(),
  versionNumber: z.number().int(),
  content: z.string(),
  contentHash: z.string(),
  isCurrent: z.boolean(),
  publishedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type ClickwrapVersionDto = z.infer<typeof ClickwrapVersionDtoSchema>;

export const ClickwrapAcceptanceDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  clickwrapVersionId: z.string().uuid(),
  acceptorEmail: z.string().email(),
  acceptorName: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  acceptedAt: z.coerce.date(),
});
export type ClickwrapAcceptanceDto = z.infer<typeof ClickwrapAcceptanceDtoSchema>;

// --- BYOK Payment Credentials (Sprint 2.7) ---
export const AddPaymentCredentialDtoSchema = z.object({
  providerType: z.enum(['stripe', 'paypal']),
  displayName: z.string().min(1).max(200),
  secretKey: z.string().min(10).max(500),
  publicKey: z.string().min(10).max(500).optional(),
  webhookSecret: z.string().min(10).max(500).optional(),
  supportedCurrencies: z.array(z.string()).default(['USD', 'EUR', 'GBP']),
});
export type AddPaymentCredentialDto = z.infer<typeof AddPaymentCredentialDtoSchema>;

export const PaymentCredentialResponseDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  providerType: z.string(),
  displayName: z.string(),
  supportedCurrencies: z.array(z.string()),
  isActive: z.boolean(),
  isVerified: z.boolean(),
  lastVerifiedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
});
export type PaymentCredentialResponseDto = z.infer<typeof PaymentCredentialResponseDtoSchema>;

// --- Workflow Orchestration Visual Builder (Sprint 3.2 - Maestro Equivalent) ---
export const WorkflowNodeTypeEnum = z.enum([
  'trigger',
  'condition',
  'action',
  'risk_assessment',
  'delay',
  'end',
]);
export type WorkflowNodeType = z.infer<typeof WorkflowNodeTypeEnum>;

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: WorkflowNodeTypeEnum,
  label: z.string().min(1).max(200),
  config: z.record(z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.enum(['true', 'false', 'default']).optional(),
  label: z.string().optional(),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDagSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).default([]),
  edges: z.array(WorkflowEdgeSchema).default([]),
});
export type WorkflowDag = z.infer<typeof WorkflowDagSchema>;

export const WorkflowDefinitionStatusEnum = z.enum(['draft', 'active', 'paused', 'archived']);
export type WorkflowDefinitionStatus = z.infer<typeof WorkflowDefinitionStatusEnum>;

export const WorkflowInstanceStatusEnum = z.enum([
  'running',
  'completed',
  'failed',
  'halted',
  'paused',
]);
export type WorkflowInstanceStatus = z.infer<typeof WorkflowInstanceStatusEnum>;

export const WorkflowNodeExecutionStatusEnum = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);
export type WorkflowNodeExecutionStatus = z.infer<typeof WorkflowNodeExecutionStatusEnum>;

export const CreateWorkflowDefinitionDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  triggerEvent: z.string().min(1).max(100),
  dag: WorkflowDagSchema,
  maxInstances: z.number().int().min(1).max(100000).optional().default(1000),
});
export type CreateWorkflowDefinitionDto = z.input<typeof CreateWorkflowDefinitionDtoSchema>;

export const UpdateWorkflowDefinitionDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  triggerEvent: z.string().min(1).max(100).optional(),
  dag: WorkflowDagSchema.optional(),
  status: WorkflowDefinitionStatusEnum.optional(),
  maxInstances: z.number().int().min(1).max(100000).optional(),
});
export type UpdateWorkflowDefinitionDto = z.input<typeof UpdateWorkflowDefinitionDtoSchema>;

export interface WorkflowDefinitionResponseDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  triggerEvent: string;
  dag: WorkflowDag;
  status: WorkflowDefinitionStatus;
  version: number;
  maxInstances: number;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface WorkflowInstanceResponseDto {
  id: string;
  organizationId: string;
  workflowId: string;
  triggerPayload: Record<string, unknown>;
  currentNodeId?: string | null;
  status: WorkflowInstanceStatus;
  chainDepth: number;
  visitedNodes: string[];
  errorMessage?: string | null;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  updatedAt: Date | string;
  workflowName?: string;
}

export interface WorkflowNodeExecutionDto {
  id: string;
  organizationId: string;
  instanceId: string;
  nodeId: string;
  nodeType: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status: WorkflowNodeExecutionStatus;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  errorMessage?: string | null;
  createdAt: Date | string;
}

export interface WorkflowMetricsDto {
  totalTriggered: number;
  totalCompleted: number;
  totalFailed: number;
  totalHalted: number;
  activeWorkflowsCount: number;
}

export const ResumeWorkflowInstanceDtoSchema = z.object({
  action: z.enum(['resume', 'halt', 'skip']),
  nodeId: z.string().optional(),
});
export type ResumeWorkflowInstanceDto = z.infer<typeof ResumeWorkflowInstanceDtoSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Deal Rooms (Sprint 3.3)
// ═══════════════════════════════════════════════════════════════════════════════

export const DealRoomStatusEnum = z.enum(['active', 'closed', 'archived']);
export type DealRoomStatus = z.infer<typeof DealRoomStatusEnum>;

export const DealRoomMemberRoleEnum = z.enum(['owner', 'member', 'viewer']);
export type DealRoomMemberRole = z.infer<typeof DealRoomMemberRoleEnum>;

export const DealRoomMessageVisibilityEnum = z.enum(['internal', 'external']);
export type DealRoomMessageVisibility = z.infer<typeof DealRoomMessageVisibilityEnum>;

export const MutualActionPlanMilestoneStatusEnum = z.enum([
  'pending',
  'in_progress',
  'complete',
  'blocked',
]);
export type MutualActionPlanMilestoneStatus = z.infer<typeof MutualActionPlanMilestoneStatusEnum>;

export const MutualActionPlanMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  owner: z.enum(['internal', 'external']),
  assigneeName: z.string().max(200).optional(),
  assigneeEmail: z.string().email().optional(),
  dueDate: z.string().optional(),
  status: MutualActionPlanMilestoneStatusEnum.default('pending'),
  order: z.number().int().default(0),
  completedAt: z.string().optional(),
});
export type MutualActionPlanMilestone = z.infer<typeof MutualActionPlanMilestoneSchema>;

export const CreateDealRoomDtoSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/i, 'Slug must be alphanumeric with hyphens')
    .optional(),
  brandKitId: z.string().uuid().optional(),
  initialDocumentId: z.string().uuid().optional(),
  mutualActionPlan: z.array(MutualActionPlanMilestoneSchema).default([]),
});
export type CreateDealRoomDto = z.input<typeof CreateDealRoomDtoSchema>;

export const UpdateDealRoomDtoSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: DealRoomStatusEnum.optional(),
  brandKitId: z.string().uuid().optional().nullable(),
  mutualActionPlan: z.array(MutualActionPlanMilestoneSchema).optional(),
});
export type UpdateDealRoomDto = z.input<typeof UpdateDealRoomDtoSchema>;

export const InviteDealRoomMemberDtoSchema = z.object({
  userId: z.string().uuid().optional(),
  externalEmail: z.string().email().optional(),
  externalName: z.string().min(1).max(200).optional(),
  role: DealRoomMemberRoleEnum.default('viewer'),
});
export type InviteDealRoomMemberDto = z.input<typeof InviteDealRoomMemberDtoSchema>;

export const AddDealRoomDocumentDtoSchema = z.object({
  documentId: z.string().uuid(),
});
export type AddDealRoomDocumentDto = z.input<typeof AddDealRoomDocumentDtoSchema>;

export const CreateDealRoomMessageDtoSchema = z.object({
  body: z.string().min(1).max(10000),
  visibility: DealRoomMessageVisibilityEnum.default('external'),
  parentId: z.string().optional(),
  authorName: z.string().max(200).optional(),
  authorEmail: z.string().email().optional(),
});
export type CreateDealRoomMessageDto = z.input<typeof CreateDealRoomMessageDtoSchema>;

export const UpdateMapDtoSchema = z.object({
  mutualActionPlan: z.array(MutualActionPlanMilestoneSchema),
});
export type UpdateMapDto = z.infer<typeof UpdateMapDtoSchema>;

export interface DealRoomMemberResponseDto {
  id: string;
  dealRoomId: string;
  organizationId: string;
  userId?: string | null;
  externalEmail?: string | null;
  externalName?: string | null;
  role: DealRoomMemberRole;
  invitedAt: Date | string;
  joinedAt?: Date | string | null;
  createdAt: Date | string;
  magicLinkUrl?: string;
}

export interface DealRoomDocumentResponseDto {
  id: string;
  dealRoomId: string;
  organizationId: string;
  documentId: string;
  addedBy: string;
  createdAt: Date | string;
  documentTitle?: string;
  documentSlug?: string;
  documentStatus?: string;
}

export interface DealRoomMessageResponseDto {
  id: string;
  dealRoomId: string;
  organizationId: string;
  authorUserId?: string | null;
  authorEmail?: string | null;
  authorName?: string | null;
  body: string;
  visibility: DealRoomMessageVisibility;
  parentId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  replies?: DealRoomMessageResponseDto[];
}

export interface DealRoomResponseDto {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: DealRoomStatus;
  brandKitId?: string | null;
  mutualActionPlan: MutualActionPlanMilestone[];
  createdAt: Date | string;
  updatedAt: Date | string;
  members?: DealRoomMemberResponseDto[];
  documents?: DealRoomDocumentResponseDto[];
  messages?: DealRoomMessageResponseDto[];
  brandKit?: Record<string, unknown> | null;
}

export interface DealRoomActivityDto {
  id: string;
  dealRoomId: string;
  type: string;
  title: string;
  actor: string;
  timestamp: Date | string;
  metadata?: Record<string, unknown>;
}

// --- Sprint 3.5: AI Data Extraction & Portfolio Intelligence ---

export const ExtractionFieldTypeEnum = z.enum(['text', 'numeric', 'date', 'boolean', 'list']);
export type ExtractionFieldType = z.infer<typeof ExtractionFieldTypeEnum>;

export const ObligationRecordDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  documentId: z.string(),
  documentVersionId: z.string(),
  fieldName: z.string(),
  fieldValue: z.string().nullable().optional(),
  fieldValueNumeric: z.number().nullable().optional(),
  fieldValueDate: z.string().nullable().optional(),
  fieldType: ExtractionFieldTypeEnum,
  confidenceScore: z.number().nullable().optional(),
  extractionMethod: z.string(),
  isCustomField: z.boolean(),
  isVerified: z.boolean(),
  pendingUpdate: z.record(z.unknown()).nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type ObligationRecordDto = z.infer<typeof ObligationRecordDtoSchema>;

export const VerifyObligationDtoSchema = z.object({
  fieldValue: z.string().optional(),
  fieldValueNumeric: z.number().optional(),
  fieldValueDate: z.string().optional(),
});
export type VerifyObligationDto = z.infer<typeof VerifyObligationDtoSchema>;

export const CounterpartyDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  domain: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  documentCount: z.number().optional(),
});
export type CounterpartyDto = z.infer<typeof CounterpartyDtoSchema>;

export const CreateCounterpartyDtoSchema = z.object({
  canonicalName: z.string().min(1).max(250),
  aliases: z.array(z.string().min(1).max(250)).optional().default([]),
  domain: z.string().max(250).optional(),
});
export type CreateCounterpartyDto = z.infer<typeof CreateCounterpartyDtoSchema>;

export const UpdateCounterpartyDtoSchema = z.object({
  canonicalName: z.string().min(1).max(250).optional(),
  aliases: z.array(z.string().min(1).max(250)).optional(),
  domain: z.string().max(250).optional(),
});
export type UpdateCounterpartyDto = z.infer<typeof UpdateCounterpartyDtoSchema>;

export const CreateCustomExtractionFieldDtoSchema = z.object({
  fieldName: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  fieldType: ExtractionFieldTypeEnum,
});
export type CreateCustomExtractionFieldDto = z.infer<typeof CreateCustomExtractionFieldDtoSchema>;

export const UpdateCustomExtractionFieldDtoSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomExtractionFieldDto = z.infer<typeof UpdateCustomExtractionFieldDtoSchema>;

export const CustomExtractionFieldDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  fieldName: z.string(),
  description: z.string(),
  fieldType: ExtractionFieldTypeEnum,
  isActive: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});
export type CustomExtractionFieldDto = z.infer<typeof CustomExtractionFieldDtoSchema>;

export const PortfolioSearchQueryDtoSchema = z.object({
  q: z.string().optional(),
  counterpartyId: z.string().optional(),
  status: z.string().optional(),
  obligationType: z.string().optional(),
  expiringWithinDays: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type PortfolioSearchQueryDto = z.infer<typeof PortfolioSearchQueryDtoSchema>;

export interface SearchResultItem {
  id: string;
  documentId: string;
  title: string;
  status: string;
  counterpartyName?: string | null;
  snippet?: string;
  matchScore?: number;
  updatedAt: string | Date;
}

export interface PortfolioStatsDto {
  totalAgreements: number;
  totalActiveObligations: number;
  unverifiedObligations: number;
  pendingAmendments: number;
  expiringWithin30Days: number;
  totalCounterparties: number;
}

// ---------------------------------------------------------------------------
// Sprint 3.6: Advanced ID-Verification Signing Types (KBA, Gov ID, QES)
// ---------------------------------------------------------------------------

export const KbaQuestionDtoSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
});
export type KbaQuestionDto = z.infer<typeof KbaQuestionDtoSchema>;

export const KbaSessionDtoSchema = z.object({
  sessionId: z.string(),
  questions: z.array(KbaQuestionDtoSchema),
  attemptsRemaining: z.number(),
  expiresAt: z.string(),
});
export type KbaSessionDto = z.infer<typeof KbaSessionDtoSchema>;

export const SubmitKbaAnswersDtoSchema = z.object({
  sessionId: z.string(),
  answers: z.record(z.string(), z.string()),
});
export type SubmitKbaAnswersDto = z.infer<typeof SubmitKbaAnswersDtoSchema>;

export const KbaResultDtoSchema = z.object({
  passed: z.boolean(),
  locked: z.boolean(),
  attemptsRemaining: z.number(),
  message: z.string(),
});
export type KbaResultDto = z.infer<typeof KbaResultDtoSchema>;

export const InitiateIdVerificationDtoSchema = z.object({
  returnUrl: z.string().url().optional(),
});
export type InitiateIdVerificationDto = z.infer<typeof InitiateIdVerificationDtoSchema>;

export const IdVerificationSessionDtoSchema = z.object({
  sessionId: z.string(),
  verificationUrl: z.string().url(),
  expiresAt: z.string(),
});
export type IdVerificationSessionDto = z.infer<typeof IdVerificationSessionDtoSchema>;

export const IdVerificationResultDtoSchema = z.object({
  status: z.enum(['pending', 'passed', 'failed', 'expired']),
  confidenceScore: z.number().min(0).max(100).optional(),
  vendorReferenceId: z.string().optional(),
  verifiedAt: z.string().optional(),
  biometricMatch: z.boolean().optional(),
  failureReason: z.string().optional(),
});
export type IdVerificationResultDto = z.infer<typeof IdVerificationResultDtoSchema>;

export const InitiateQesDtoSchema = z.object({
  countryCode: z.string().length(2).default('DE'),
  providerPreference: z.string().optional(),
  returnUrl: z.string().url().optional(),
});
export type InitiateQesDto = z.infer<typeof InitiateQesDtoSchema>;

export const QesSessionDtoSchema = z.object({
  sessionId: z.string(),
  qtspProvider: z.string(),
  signingUrl: z.string().url(),
  eidasLevel: z.literal('QES'),
  expiresAt: z.string(),
});
export type QesSessionDto = z.infer<typeof QesSessionDtoSchema>;

export const QesResultDtoSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed']),
  certificateIssuer: z.string().optional(),
  certificateSerial: z.string().optional(),
  qualifiedTimestamp: z.string().optional(),
  vendorReferenceId: z.string().optional(),
  verifiedAt: z.string().optional(),
});
export type QesResultDto = z.infer<typeof QesResultDtoSchema>;

export const VerificationFallbackConfigSchema = z.object({
  kbaFallback: z.enum(['sms', 'passcode', 'email']).default('sms'),
  idDocumentFallback: z.enum(['sms', 'passcode', 'email']).default('sms'),
  qesFallback: z.enum(['id_document', 'sms', 'passcode']).default('sms'),
});
export type VerificationFallbackConfig = z.infer<typeof VerificationFallbackConfigSchema>;

// ---------------------------------------------------------------------------
// Sprint 3.7: Risk-Adaptive Identity Verification Types
// ---------------------------------------------------------------------------

export const RiskLevelEnum = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export interface RiskContext {
  signerId: string;
  email: string;
  name?: string;
  ipAddress?: string;
  userAgent?: string;
  dealValue?: number;
  currency?: string;
  organizationId: string;
  documentId?: string;
  signatureRequestId?: string;
}

export interface RiskScoreResult {
  score: number; // 0.0 to 1.0
  level: RiskLevel;
  suggestedMethod: 'passcode' | 'sms' | 'kba' | 'id_document' | 'qes';
  factors: {
    ipReputationScore: number;
    deviceTrustScore: number;
    emailDomainRisk: number;
    dealSizeMultiplier: number;
  };
  circuitOpen?: boolean;
  fallbackApplied?: boolean;
  evaluatedAt: string;
}

export interface PreVerifiedCheckResult {
  isPreVerified: boolean;
  verificationMethod?: string;
  verifiedAt?: string;
  expiresAt?: string;
}

export const VerificationReportQuerySchema = z.object({
  format: z.enum(['json', 'pdf']).default('json'),
});
export type VerificationReportQuery = z.infer<typeof VerificationReportQuerySchema>;

export interface VerificationReportSignerEntry {
  signerId: string;
  name?: string;
  emailMasked: string;
  roleLabel?: string;
  status: string;
  verificationMethod: string;
  isPreVerified: boolean;
  riskAssessment?: {
    riskScore: number;
    riskLevel: string;
    evaluatedAt: string;
    fallbackApplied: boolean;
  };
  verificationResult?: {
    status: string;
    confidenceScore?: number;
    vendorReferenceId?: string;
    biometricMatch?: boolean;
    certificateIssuer?: string;
    certificateSerial?: string;
    verifiedAt: string;
  };
}

export interface VerificationReportResponse {
  reportId: string;
  signatureRequestId: string;
  documentId: string;
  documentTitle: string;
  documentHash: string;
  complianceStandard: string;
  generatedAt: string;
  signers: VerificationReportSignerEntry[];
  assuranceStatement: string;
}

// --- Multi-Workspace & Parent-Account Oversight (Sprint 3.8) ---
export type WorkspaceRole = 'admin' | 'manager' | 'member' | 'collaborator';
export type AssetVisibility = 'workspace' | 'organization';

export const CreateWorkspaceDtoSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  parentWorkspaceId: z.string().uuid().optional(),
  isSharedLibraryEnabled: z.boolean().optional(),
  brandingDefaults: z.record(z.any()).optional(),
});
export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceDtoSchema>;

export const UpdateWorkspaceDtoSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  parentWorkspaceId: z.string().uuid().nullable().optional(),
  isSharedLibraryEnabled: z.boolean().optional(),
  brandingDefaults: z.record(z.any()).optional(),
});
export type UpdateWorkspaceDto = z.infer<typeof UpdateWorkspaceDtoSchema>;

export const AddWorkspaceMemberDtoSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'manager', 'member', 'collaborator']).default('member'),
  hasContentAdmin: z.boolean().optional(),
});
export type AddWorkspaceMemberDto = z.infer<typeof AddWorkspaceMemberDtoSchema>;

export const UpdateWorkspaceMemberDtoSchema = z.object({
  role: z.enum(['admin', 'manager', 'member', 'collaborator']),
  hasContentAdmin: z.boolean().optional(),
});
export type UpdateWorkspaceMemberDto = z.infer<typeof UpdateWorkspaceMemberDtoSchema>;

export interface WorkspaceResponse {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  parentWorkspaceId?: string | null;
  isSharedLibraryEnabled: boolean;
  brandingDefaults?: Record<string, any> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  memberCount?: number;
  documentCount?: number;
}

export interface WorkspaceOverviewResponse {
  workspace: WorkspaceResponse;
  metrics: {
    totalDocuments: number;
    completedDocuments: number;
    pendingDocuments: number;
    totalDealValue: number;
    currency: string;
    totalMembers: number;
    sharedAssetsCount: number;
  };
}

// --- SAML SSO & SCIM Provisioning (Sprint 3.9) ---
export const SsoPolicySchema = z.enum(['optional', 'required', 'required_admin_bypass']);
export type SsoPolicy = z.infer<typeof SsoPolicySchema>;

export const ConfigureSamlDtoSchema = z.object({
  idpEntityId: z.string().min(1).max(500),
  idpSsoUrl: z.string().url().max(1000),
  idpCertificate: z.string().min(1),
  ssoPolicy: SsoPolicySchema.optional().default('optional'),
});
export type ConfigureSamlDto = z.input<typeof ConfigureSamlDtoSchema>;

export const UpdateSsoPolicyDtoSchema = z.object({
  ssoPolicy: SsoPolicySchema,
});
export type UpdateSsoPolicyDto = z.infer<typeof UpdateSsoPolicyDtoSchema>;

export interface SamlConfigResponse {
  organizationId: string;
  connectionId: string | null;
  ssoPolicy: SsoPolicy;
  status: 'active' | 'unconfigured' | 'error';
  idpEntityId?: string;
  idpSsoUrl?: string;
  updatedAt?: string | Date;
}

// SCIM 2.0 (RFC 7643 / RFC 7644)
export interface ScimName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
}

export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  userName: string;
  name?: ScimName;
  emails: ScimEmail[];
  active: boolean;
  roles?: string[];
  meta: {
    resourceType: string;
    created: string | Date;
    lastModified: string | Date;
    location?: string;
  };
}

export const ScimCreateUserDtoSchema = z.object({
  schemas: z.array(z.string()).optional(),
  userName: z.string().email(),
  name: z
    .object({
      formatted: z.string().optional(),
      familyName: z.string().optional(),
      givenName: z.string().optional(),
    })
    .optional(),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        type: z.string().optional(),
        primary: z.boolean().optional(),
      }),
    )
    .optional(),
  active: z.boolean().optional().default(true),
  roles: z.array(z.string()).optional(),
});
export type ScimCreateUserDto = z.input<typeof ScimCreateUserDtoSchema>;

export const ScimPatchOpSchema = z.object({
  op: z.enum(['add', 'replace', 'remove', 'Add', 'Replace', 'Remove']),
  path: z.string().optional(),
  value: z.any(),
});

export const ScimPatchUserDtoSchema = z.object({
  schemas: z.array(z.string()).optional(),
  Operations: z.array(ScimPatchOpSchema),
});
export type ScimPatchUserDto = z.infer<typeof ScimPatchUserDtoSchema>;

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  itemsPerPage: number;
  startIndex: number;
  Resources: T[];
}
