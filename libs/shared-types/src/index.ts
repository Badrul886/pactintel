import { z } from 'zod';

export * from './events';

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
