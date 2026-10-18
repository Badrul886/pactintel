export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'use';

export type Subject =
  | 'Document'
  | 'User'
  | 'Organization'
  | 'Workspace'
  | 'Payment'
  | 'Signature'
  | 'Billing'
  | 'Template'
  | 'ContentBlock'
  | 'PricingTable'
  | 'LineItem'
  | 'ProductCatalogItem'
  | 'BrandKit'
  | 'CustomDomain'
  | 'IntegrationConnection'
  | 'Folder'
  | 'NotificationPreference'
  | 'all';

export interface RequiredPolicyRule {
  action: Action;
  subject: Subject;
}
