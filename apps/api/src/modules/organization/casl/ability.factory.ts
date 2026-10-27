import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

export type AppAbility = MongoAbility<[Action, Subject]>;

export class AbilityFactory {
  static createForUser(role: UserRole): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    switch (role) {
      case 'owner':
        can('manage', 'all');
        break;

      case 'admin':
        can('manage', 'all');
        cannot('delete', 'Organization'); // Only Owner can delete the organization
        break;

      case 'manager':
        can('read', 'all');
        can('create', 'Document');
        can('update', 'Document');
        can('delete', 'Document');
        can('create', 'User');
        can('update', 'User');
        can('create', 'Workspace');
        can('read', 'Workspace');
        can('manage', 'Template');
        can('use', 'Template');
        can('manage', 'ContentBlock');
        can('use', 'ContentBlock');
        can('manage', 'Folder');
        can('manage', 'PricingTable');
        can('manage', 'LineItem');
        can('manage', 'ProductCatalogItem');
        can('read', 'BrandKit');
        can('manage', 'Comment');
        can('manage', 'ContentLock');
        can('manage', 'ApprovalChain');
        can('manage', 'ApprovalStep');
        can('manage', 'AutomationRule');
        can('use', 'AiFeature');
        can(['read', 'send', 'snooze', 'dismiss', 'manage'], 'FollowUpQueueItem');
        can('read', 'Webhook');
        cannot('manage', 'Webhook');
        can(['read', 'create'], 'ClickwrapAgreement');
        can(['read', 'create'], 'ClickwrapVersion');
        can('read', 'ClickwrapAcceptance');
        cannot('manage', 'ClickwrapAgreement');
        cannot('manage', 'PaymentCredential');
        cannot('delete', 'Organization');
        cannot('manage', 'Billing');
        cannot('delete', 'User');
        cannot('manage', 'BrandKit');
        cannot('manage', 'CustomDomain');
        cannot('manage', 'IntegrationConnection');
        break;

      case 'member':
        can('read', 'Document');
        can('create', 'Document');
        can('update', 'Document');
        can('read', 'User');
        can('read', 'Workspace');
        can('read', 'Template');
        can('use', 'Template');
        cannot('create', 'Template');
        cannot('update', 'Template');
        cannot('delete', 'Template');
        can('read', 'ContentBlock');
        can('use', 'ContentBlock');
        cannot('create', 'ContentBlock');
        cannot('update', 'ContentBlock');
        cannot('delete', 'ContentBlock');
        can('read', 'Folder');
        cannot('delete', 'Folder');
        can('create', 'PricingTable');
        can('read', 'PricingTable');
        can('update', 'PricingTable');
        can('create', 'LineItem');
        can('read', 'LineItem');
        can('update', 'LineItem');
        can('read', 'BrandKit');
        can('read', 'ProductCatalogItem');
        can('manage', 'Comment');
        can('manage', 'ContentLock');
        can('read', 'ApprovalChain');
        can('read', 'ApprovalStep');
        can('update', 'ApprovalStep');
        can('read', 'AutomationRule');
        can('use', 'AiFeature');
        can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem');
        cannot('create', 'ApprovalChain');
        cannot('create', 'AutomationRule');
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
        cannot('create', 'Workspace');
        cannot('manage', 'Organization');
        cannot('manage', 'Billing');
        cannot('manage', 'BrandKit');
        cannot('manage', 'CustomDomain');
        cannot('manage', 'IntegrationConnection');
        cannot('manage', 'Webhook');
        cannot('manage', 'ClickwrapAgreement');
        cannot('manage', 'PaymentCredential');
        break;

      case 'collaborator':
        can('read', 'Document');
        can('update', 'Document'); // Can comment/suggest, but not send/sign/delete
        can('read', 'Workspace');
        can('read', 'Template');
        cannot('use', 'Template'); // Explicit deny
        cannot('create', 'Template');
        cannot('update', 'Template');
        cannot('delete', 'Template');
        can('read', 'ContentBlock');
        cannot('use', 'ContentBlock');
        cannot('create', 'ContentBlock');
        cannot('update', 'ContentBlock');
        cannot('delete', 'ContentBlock');
        can('read', 'Folder');
        cannot('delete', 'Folder');
        cannot('create', 'PricingTable');
        cannot('update', 'PricingTable');
        cannot('delete', 'PricingTable');
        can('read', 'BrandKit');
        can('read', 'ProductCatalogItem');
        can('create', 'Comment');
        can('read', 'Comment');
        can('update', 'Comment');
        can('delete', 'Comment');
        can('read', 'ContentLock');
        cannot('use', 'AiFeature'); // Explicit deny: AI requires full seat
        cannot('manage', 'ApprovalChain');
        cannot('manage', 'ApprovalStep');
        cannot('manage', 'AutomationRule');
        cannot('read', 'FollowUpQueueItem');
        cannot('manage', 'FollowUpQueueItem');
        cannot('manage', 'Webhook');
        cannot('manage', 'ClickwrapAgreement');
        cannot('manage', 'PaymentCredential');
        cannot('create', 'Document');
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
        cannot('manage', 'Organization');
        cannot('manage', 'Billing');
        cannot('manage', 'BrandKit');
        cannot('manage', 'CustomDomain');
        cannot('manage', 'IntegrationConnection');
        break;
    }

    return build();
  }
}
