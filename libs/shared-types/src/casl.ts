export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'use'
  | 'send'
  | 'snooze'
  | 'dismiss'
  | 'decide';

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
  | 'Comment'
  | 'ContentLock'
  | 'ApprovalChain'
  | 'ApprovalStep'
  | 'AutomationRule'
  | 'FollowUpQueueItem'
  | 'AiFeature'
  | 'Webhook'
  | 'ClickwrapAgreement'
  | 'ClickwrapVersion'
  | 'ClickwrapAcceptance'
  | 'PaymentCredential'
  | 'all';

export interface RequiredPolicyRule {
  action: Action;
  subject: Subject;
}
