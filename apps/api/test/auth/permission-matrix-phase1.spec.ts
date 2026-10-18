import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

describe('Phase 1 CASL Permission Matrix (Blueprint §7.3 & Build Plan §4.1)', () => {
  interface TestCase {
    role: UserRole;
    action: Action;
    subject: Subject;
    expected: boolean;
    name: string;
  }

  const testCases: TestCase[] = [
    {
      role: 'member',
      action: 'use',
      subject: 'Template',
      expected: true,
      name: 'member + use + Template = allow',
    },
    {
      role: 'collaborator',
      action: 'use',
      subject: 'Template',
      expected: false,
      name: 'collaborator + use + Template = deny (explicit deny)',
    },
    {
      role: 'member',
      action: 'create',
      subject: 'Template',
      expected: false,
      name: 'member + create + Template = deny',
    },
    {
      role: 'manager',
      action: 'create',
      subject: 'Template',
      expected: true,
      name: 'manager + create + Template = allow',
    },
    {
      role: 'member',
      action: 'create',
      subject: 'PricingTable',
      expected: true,
      name: 'member + create + PricingTable = allow',
    },
    {
      role: 'collaborator',
      action: 'create',
      subject: 'PricingTable',
      expected: false,
      name: 'collaborator + create + PricingTable = deny',
    },
    {
      role: 'admin',
      action: 'manage',
      subject: 'BrandKit',
      expected: true,
      name: 'admin + manage + BrandKit = allow',
    },
    {
      role: 'member',
      action: 'update',
      subject: 'BrandKit',
      expected: false,
      name: 'member + update + BrandKit = deny',
    },
    {
      role: 'admin',
      action: 'manage',
      subject: 'CustomDomain',
      expected: true,
      name: 'admin + manage + CustomDomain = allow',
    },
    {
      role: 'manager',
      action: 'manage',
      subject: 'CustomDomain',
      expected: false,
      name: 'manager + manage + CustomDomain = deny',
    },
    {
      role: 'admin',
      action: 'manage',
      subject: 'IntegrationConnection',
      expected: true,
      name: 'admin + manage + IntegrationConnection = allow',
    },
    {
      role: 'member',
      action: 'manage',
      subject: 'IntegrationConnection',
      expected: false,
      name: 'member + manage + IntegrationConnection = deny',
    },
  ];

  testCases.forEach(({ role, action, subject, expected, name }) => {
    it(name, () => {
      const ability = AbilityFactory.createForUser(role);
      expect(ability.can(action, subject)).toBe(expected);
    });
  });
});
