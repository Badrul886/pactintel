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
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
        cannot('create', 'Workspace');
        cannot('manage', 'Organization');
        cannot('manage', 'Billing');
        cannot('manage', 'BrandKit');
        cannot('manage', 'CustomDomain');
        cannot('manage', 'IntegrationConnection');
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
