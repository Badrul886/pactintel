import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

export type AppAbility = MongoAbility<[Action, Subject]>;

export class AbilityFactory {
  static createForUser(role: UserRole, user?: { id: string }): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    const userId = user?.id;

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
        can('update', 'Workspace');
        cannot('delete', 'Workspace');
        can('manage', 'Template');
        can('use', 'Template');
        can('manage', 'ContentBlock');
        can('use', 'ContentBlock');
        can('manage', 'Folder');
        can('manage', 'PricingTable');
        can('manage', 'LineItem');
        can('manage', 'ProductCatalogItem');
        can('manage', 'Bundle');
        can('manage', 'PricingRule');
        can('manage', 'Playbook');
        can('decide', 'CpqApproval');
        // Phase 3 additions for manager (Workflow Orchestration):
        can('manage', 'WorkflowDefinition');
        can('manage', 'WorkflowInstance');
        // Phase 3 additions for manager (Deal Rooms):
        can('manage', 'DealRoom');
        can('manage', 'DealRoomMessage');
        // Phase 3 additions for manager (Portfolio Intelligence):
        can('manage', 'Portfolio');
        can('manage', 'ObligationRecord');
        can('manage', 'Counterparty');
        can('manage', 'CustomExtractionField');
        can('manage', 'Signature');
        can('manage', 'CustomReport');
        can('read', 'Analytics');
        can('manage', 'Form');
        can('manage', 'FormSubmission');
        can('read', 'BrandKit');
        // Phase 2 additions for manager:
        can(['read', 'create', 'update', 'delete'], 'Comment');
        can(['read', 'create', 'delete'], 'ContentLock');
        can(['read', 'create', 'update'], 'ApprovalChain');
        can(['read', 'decide'], 'ApprovalStep');
        can(['read', 'create', 'update', 'delete'], 'AutomationRule');
        can('use', 'AiFeature');
        can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem');
        can('read', 'Webhook');
        cannot('manage', 'Webhook'); // explicit deny — admin only
        can(['read', 'create'], 'ClickwrapAgreement');
        can(['read', 'create'], 'ClickwrapVersion');
        can('read', 'ClickwrapAcceptance');
        cannot('manage', 'ClickwrapAgreement');
        cannot('manage', 'PaymentCredential'); // admin only
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
        cannot('create', 'Workspace');
        cannot('update', 'Workspace');
        cannot('delete', 'Workspace');
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
        // Phase 3 additions for member (CPQ):
        can('read', 'Bundle');
        can('use', 'Bundle');
        can('read', 'PricingRule');
        can('read', 'Playbook');
        can('use', 'Playbook');
        cannot('create', 'Bundle');
        cannot('update', 'Bundle');
        cannot('delete', 'Bundle');
        cannot('create', 'PricingRule');
        cannot('update', 'PricingRule');
        cannot('delete', 'PricingRule');
        cannot('create', 'Playbook');
        cannot('update', 'Playbook');
        cannot('delete', 'Playbook');
        cannot('decide', 'CpqApproval');
        // Phase 3 additions for member (Workflow Orchestration):
        can('read', 'WorkflowDefinition');
        can('execute', 'WorkflowDefinition');
        can('read', 'WorkflowInstance');
        cannot('create', 'WorkflowDefinition');
        cannot('update', 'WorkflowDefinition');
        cannot('delete', 'WorkflowDefinition');
        // Phase 3 additions for member (Deal Rooms):
        can('read', 'DealRoom');
        can('create', 'DealRoom');
        can('update', 'DealRoom');
        cannot('delete', 'DealRoom');
        can(['read', 'create'], 'DealRoomMessage');
        if (userId) {
          can('update', 'DealRoomMessage', { authorId: { $eq: userId } } as any);
          can('delete', 'DealRoomMessage', { authorId: { $eq: userId } } as any);
        } else {
          can('update', 'DealRoomMessage');
          can('delete', 'DealRoomMessage');
        }
        // Phase 3 additions for member (Portfolio Intelligence):
        can('read', 'Portfolio');
        can(['read', 'create', 'update'], 'ObligationRecord');
        can(['read', 'create', 'update'], 'Counterparty');
        can(['read', 'create', 'update'], 'CustomExtractionField');
        can(['read', 'create', 'update'], 'Signature');
        cannot('delete', 'Signature');
        cannot('delete', 'ObligationRecord');
        cannot('delete', 'Counterparty');
        cannot('manage', 'CustomReport');
        cannot('read', 'CustomReport');
        cannot('read', 'Analytics');
        cannot('delete', 'CustomExtractionField');
        can(['read', 'create', 'update', 'delete'], 'CustomReport');
        can('read', 'Analytics');
        can(['read', 'create', 'update', 'delete'], 'Form');
        can('read', 'FormSubmission');
        cannot(['create', 'update', 'delete'], 'FormSubmission');
        // Phase 2 additions for member:
        can(['read', 'create'], 'Comment');
        if (userId) {
          can('update', 'Comment', { authorId: { $eq: userId } } as any);
          can('delete', 'Comment', { authorId: { $eq: userId } } as any);
        } else {
          can('update', 'Comment');
          can('delete', 'Comment');
        }
        cannot('create', 'ContentLock'); // content locking = manager/admin only
        can('read', 'ContentLock');
        can('read', 'ApprovalStep');
        cannot('decide', 'ApprovalStep'); // unless assigned as approver — handled in service
        can('read', 'ApprovalChain');
        cannot('create', 'ApprovalChain');
        can('read', 'AutomationRule');
        cannot('create', 'AutomationRule');
        cannot('manage', 'AutomationRule');
        can('use', 'AiFeature');
        if (userId) {
          can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem', {
            ownerId: { $eq: userId },
          } as any);
        } else {
          can(['read', 'send', 'snooze', 'dismiss'], 'FollowUpQueueItem');
        }
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
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
        cannot('manage', 'all'); // Baseline: collaborator cannot manage anything unless explicitly permitted
        can('read', 'Document');
        can('update', 'Document'); // Can comment/suggest, but not send/sign/delete
        can('read', 'Workspace');
        cannot('create', 'Workspace');
        cannot('update', 'Workspace');
        cannot('delete', 'Workspace');
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
        // Phase 3 additions for collaborator (CPQ):
        cannot('manage', 'Bundle');
        cannot('use', 'Bundle');
        cannot('manage', 'PricingRule');
        cannot('manage', 'Playbook');
        cannot('use', 'Playbook');
        cannot('decide', 'CpqApproval');
        // Phase 3 additions for collaborator (Workflow Orchestration):
        cannot('manage', 'WorkflowDefinition');
        cannot('read', 'WorkflowDefinition');
        cannot('execute', 'WorkflowDefinition');
        cannot('manage', 'WorkflowInstance');
        cannot('read', 'WorkflowInstance');
        // Phase 3 additions for collaborator (Deal Rooms):
        can('read', 'DealRoom');
        can('read', 'Form');
        cannot(['create', 'update', 'delete'], 'Form');
        cannot(['read', 'create', 'update', 'delete'], 'FormSubmission');
        cannot('create', 'DealRoom');
        cannot('update', 'DealRoom');
        cannot('delete', 'DealRoom');
        can('read', 'DealRoomMessage');
        can('create', 'DealRoomMessage');
        cannot('update', 'DealRoomMessage');
        cannot('delete', 'DealRoomMessage');
        cannot('manage', 'Signature');
        cannot('create', 'Signature');
        cannot('update', 'Signature');
        cannot('delete', 'Signature');
        // Phase 3 additions for collaborator (Portfolio Intelligence):
        can('read', 'Portfolio');
        can('read', 'ObligationRecord');
        can('read', 'Counterparty');
        cannot('manage', 'CustomExtractionField');
        cannot('create', 'ObligationRecord');
        cannot('update', 'ObligationRecord');
        cannot('delete', 'ObligationRecord');
        cannot('create', 'Counterparty');
        cannot('update', 'Counterparty');
        cannot('delete', 'Counterparty');
        cannot('manage', 'CustomReport');
        cannot('read', 'CustomReport');
        cannot('read', 'Analytics');
        // Phase 2 additions for collaborator:
        can('read', 'Comment');
        can('create', 'Comment'); // collaborators can comment
        can('read', 'ContentLock');
        cannot('use', 'AiFeature'); // Explicit deny: AI requires full seat
        cannot('decide', 'ApprovalStep');
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
