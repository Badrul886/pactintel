import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { UserRole } from '@pactintel/shared-types';

export type AppAbility = MongoAbility<[string, string]>;

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
        cannot('delete', 'Organization');
        cannot('manage', 'Billing');
        cannot('delete', 'User');
        break;

      case 'member':
        can('read', 'Document');
        can('create', 'Document');
        can('update', 'Document');
        can('read', 'User');
        can('read', 'Workspace');
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
        cannot('create', 'Workspace');
        cannot('manage', 'Organization');
        cannot('manage', 'Billing');
        break;

      case 'collaborator':
        can('read', 'Document');
        can('update', 'Document'); // Can comment/suggest, but not send/sign/delete
        can('read', 'Workspace');
        cannot('create', 'Document');
        cannot('delete', 'Document');
        cannot('create', 'User');
        cannot('delete', 'User');
        cannot('manage', 'Organization');
        cannot('manage', 'Billing');
        break;
    }

    return build();
  }
}
