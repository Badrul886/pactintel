import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.1 CASL Permission Matrix for CPQ
 * Verifies role boundaries across Bundle, PricingRule, Playbook, and CpqApproval.
 */
describe('Phase 3 Sprint 3.1 CPQ CASL Permission Matrix', () => {
  const user = { id: 'usr-test-123' };

  interface TestCase {
    id: number;
    role: UserRole;
    action: Action;
    subject: Subject;
    expected: boolean;
    name: string;
  }

  const testCases: TestCase[] = [
    // Owner / Admin
    {
      id: 1,
      role: 'owner',
      action: 'manage',
      subject: 'Bundle',
      expected: true,
      name: 'owner can manage Bundle',
    },
    {
      id: 2,
      role: 'owner',
      action: 'manage',
      subject: 'PricingRule',
      expected: true,
      name: 'owner can manage PricingRule',
    },
    {
      id: 3,
      role: 'owner',
      action: 'manage',
      subject: 'Playbook',
      expected: true,
      name: 'owner can manage Playbook',
    },
    {
      id: 4,
      role: 'owner',
      action: 'decide',
      subject: 'CpqApproval',
      expected: true,
      name: 'owner can decide CpqApproval',
    },
    {
      id: 5,
      role: 'admin',
      action: 'manage',
      subject: 'Bundle',
      expected: true,
      name: 'admin can manage Bundle',
    },
    {
      id: 6,
      role: 'admin',
      action: 'manage',
      subject: 'PricingRule',
      expected: true,
      name: 'admin can manage PricingRule',
    },
    {
      id: 7,
      role: 'admin',
      action: 'manage',
      subject: 'Playbook',
      expected: true,
      name: 'admin can manage Playbook',
    },
    {
      id: 8,
      role: 'admin',
      action: 'decide',
      subject: 'CpqApproval',
      expected: true,
      name: 'admin can decide CpqApproval',
    },

    // Manager
    {
      id: 9,
      role: 'manager',
      action: 'create',
      subject: 'Bundle',
      expected: true,
      name: 'manager can create Bundle',
    },
    {
      id: 10,
      role: 'manager',
      action: 'update',
      subject: 'Bundle',
      expected: true,
      name: 'manager can update Bundle',
    },
    {
      id: 11,
      role: 'manager',
      action: 'delete',
      subject: 'Bundle',
      expected: true,
      name: 'manager can delete Bundle',
    },
    {
      id: 12,
      role: 'manager',
      action: 'manage',
      subject: 'PricingRule',
      expected: true,
      name: 'manager can manage PricingRule',
    },
    {
      id: 13,
      role: 'manager',
      action: 'manage',
      subject: 'Playbook',
      expected: true,
      name: 'manager can manage Playbook',
    },
    {
      id: 14,
      role: 'manager',
      action: 'decide',
      subject: 'CpqApproval',
      expected: true,
      name: 'manager can decide CpqApproval',
    },

    // Member
    {
      id: 15,
      role: 'member',
      action: 'read',
      subject: 'Bundle',
      expected: true,
      name: 'member can read Bundle',
    },
    {
      id: 16,
      role: 'member',
      action: 'use',
      subject: 'Bundle',
      expected: true,
      name: 'member can use Bundle',
    },
    {
      id: 17,
      role: 'member',
      action: 'create',
      subject: 'Bundle',
      expected: false,
      name: 'member cannot create Bundle',
    },
    {
      id: 18,
      role: 'member',
      action: 'update',
      subject: 'Bundle',
      expected: false,
      name: 'member cannot update Bundle',
    },
    {
      id: 19,
      role: 'member',
      action: 'delete',
      subject: 'Bundle',
      expected: false,
      name: 'member cannot delete Bundle',
    },
    {
      id: 20,
      role: 'member',
      action: 'read',
      subject: 'PricingRule',
      expected: true,
      name: 'member can read PricingRule',
    },
    {
      id: 21,
      role: 'member',
      action: 'create',
      subject: 'PricingRule',
      expected: false,
      name: 'member cannot create PricingRule',
    },
    {
      id: 22,
      role: 'member',
      action: 'read',
      subject: 'Playbook',
      expected: true,
      name: 'member can read Playbook',
    },
    {
      id: 23,
      role: 'member',
      action: 'use',
      subject: 'Playbook',
      expected: true,
      name: 'member can use Playbook',
    },
    {
      id: 24,
      role: 'member',
      action: 'create',
      subject: 'Playbook',
      expected: false,
      name: 'member cannot create Playbook',
    },
    {
      id: 25,
      role: 'member',
      action: 'decide',
      subject: 'CpqApproval',
      expected: false,
      name: 'member cannot decide CpqApproval',
    },

    // Collaborator
    {
      id: 26,
      role: 'collaborator',
      action: 'read',
      subject: 'Bundle',
      expected: false,
      name: 'collaborator cannot read Bundle',
    },
    {
      id: 27,
      role: 'collaborator',
      action: 'use',
      subject: 'Bundle',
      expected: false,
      name: 'collaborator cannot use Bundle',
    },
    {
      id: 28,
      role: 'collaborator',
      action: 'create',
      subject: 'Bundle',
      expected: false,
      name: 'collaborator cannot create Bundle',
    },
    {
      id: 29,
      role: 'collaborator',
      action: 'manage',
      subject: 'PricingRule',
      expected: false,
      name: 'collaborator cannot manage PricingRule',
    },
    {
      id: 30,
      role: 'collaborator',
      action: 'use',
      subject: 'Playbook',
      expected: false,
      name: 'collaborator cannot use Playbook',
    },
    {
      id: 31,
      role: 'collaborator',
      action: 'decide',
      subject: 'CpqApproval',
      expected: false,
      name: 'collaborator cannot decide CpqApproval',
    },
  ];

  testCases.forEach((tc) => {
    it(`Case ${tc.id}: ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      const allowed = ability.can(tc.action, tc.subject);
      expect(allowed).toBe(tc.expected);
    });
  });
});
