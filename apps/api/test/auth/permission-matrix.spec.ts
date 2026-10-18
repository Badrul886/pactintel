import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';

describe('CASL Permission Matrix (Blueprint §7.3)', () => {
  describe('Owner role', () => {
    const ability = AbilityFactory.createForUser('owner');

    it('can manage all resources', () => {
      expect(ability.can('manage', 'all')).toBe(true);
      expect(ability.can('delete', 'Organization')).toBe(true);
      expect(ability.can('create', 'Document')).toBe(true);
      expect(ability.can('manage', 'Billing')).toBe(true);
    });
  });

  describe('Admin role', () => {
    const ability = AbilityFactory.createForUser('admin');

    it('can manage all except deleting the root Organization', () => {
      expect(ability.can('create', 'Document')).toBe(true);
      expect(ability.can('delete', 'Document')).toBe(true);
      expect(ability.can('create', 'User')).toBe(true);
      expect(ability.can('delete', 'Organization')).toBe(false);
    });
  });

  describe('Manager role', () => {
    const ability = AbilityFactory.createForUser('manager');

    it('can create and update documents and invite users, but cannot delete Organization or manage Billing', () => {
      expect(ability.can('create', 'Document')).toBe(true);
      expect(ability.can('update', 'Document')).toBe(true);
      expect(ability.can('create', 'User')).toBe(true);
      expect(ability.can('create', 'Workspace')).toBe(true);

      expect(ability.can('delete', 'Organization')).toBe(false);
      expect(ability.can('manage', 'Billing')).toBe(false);
      expect(ability.can('delete', 'User')).toBe(false);
    });
  });

  describe('Member role', () => {
    const ability = AbilityFactory.createForUser('member');

    it('can create and edit documents, but cannot delete documents, manage users, or manage org', () => {
      expect(ability.can('read', 'Document')).toBe(true);
      expect(ability.can('create', 'Document')).toBe(true);
      expect(ability.can('update', 'Document')).toBe(true);

      expect(ability.can('delete', 'Document')).toBe(false);
      expect(ability.can('create', 'User')).toBe(false);
      expect(ability.can('delete', 'User')).toBe(false);
      expect(ability.can('create', 'Workspace')).toBe(false);
      expect(ability.can('manage', 'Organization')).toBe(false);
      expect(ability.can('manage', 'Billing')).toBe(false);
    });
  });

  describe('Collaborator role', () => {
    const ability = AbilityFactory.createForUser('collaborator');

    it('can only view and update/comment on documents, cannot create or delete anything', () => {
      expect(ability.can('read', 'Document')).toBe(true);
      expect(ability.can('update', 'Document')).toBe(true);

      expect(ability.can('create', 'Document')).toBe(false);
      expect(ability.can('delete', 'Document')).toBe(false);
      expect(ability.can('create', 'User')).toBe(false);
      expect(ability.can('manage', 'Organization')).toBe(false);
      expect(ability.can('manage', 'Billing')).toBe(false);
    });
  });
});
