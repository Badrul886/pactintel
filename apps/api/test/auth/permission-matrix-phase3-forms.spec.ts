import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.11 CASL Permission Matrix for Standalone Forms & Submissions
 * Validates role boundaries across:
 * - Owner: full authority to manage Form and FormSubmission
 * - Admin: full authority to manage Form and FormSubmission
 * - Manager: authority to manage Form and FormSubmission
 * - Member: authority to read, create, update, delete Form; read FormSubmission; cannot manage FormSubmission
 * - Collaborator: read Form only; cannot create, update, delete Form; cannot read or manage FormSubmission
 */
describe('Phase 3 Sprint 3.11 Forms & Submissions CASL Permission Matrix', () => {
  const user = { id: '0192a000-0000-7000-8000-000000000001' };

  interface TestCase {
    id: number;
    role: UserRole;
    action: Action;
    subject: Subject;
    expected: boolean;
    name: string;
  }

  const testCases: TestCase[] = [
    // Owner
    {
      id: 1,
      role: 'owner',
      action: 'manage',
      subject: 'Form',
      expected: true,
      name: 'Owner can manage Form',
    },
    {
      id: 2,
      role: 'owner',
      action: 'manage',
      subject: 'FormSubmission',
      expected: true,
      name: 'Owner can manage FormSubmission',
    },

    // Admin
    {
      id: 3,
      role: 'admin',
      action: 'manage',
      subject: 'Form',
      expected: true,
      name: 'Admin can manage Form',
    },
    {
      id: 4,
      role: 'admin',
      action: 'manage',
      subject: 'FormSubmission',
      expected: true,
      name: 'Admin can manage FormSubmission',
    },

    // Manager
    {
      id: 5,
      role: 'manager',
      action: 'manage',
      subject: 'Form',
      expected: true,
      name: 'Manager can manage Form',
    },
    {
      id: 6,
      role: 'manager',
      action: 'manage',
      subject: 'FormSubmission',
      expected: true,
      name: 'Manager can manage FormSubmission',
    },

    // Member
    {
      id: 7,
      role: 'member',
      action: 'read',
      subject: 'Form',
      expected: true,
      name: 'Member can read Form',
    },
    {
      id: 8,
      role: 'member',
      action: 'create',
      subject: 'Form',
      expected: true,
      name: 'Member can create Form',
    },
    {
      id: 9,
      role: 'member',
      action: 'update',
      subject: 'Form',
      expected: true,
      name: 'Member can update Form',
    },
    {
      id: 10,
      role: 'member',
      action: 'delete',
      subject: 'Form',
      expected: true,
      name: 'Member can delete Form',
    },
    {
      id: 11,
      role: 'member',
      action: 'read',
      subject: 'FormSubmission',
      expected: true,
      name: 'Member can read FormSubmission',
    },
    {
      id: 12,
      role: 'member',
      action: 'manage',
      subject: 'FormSubmission',
      expected: false,
      name: 'Member cannot manage FormSubmission',
    },

    // Collaborator
    {
      id: 13,
      role: 'collaborator',
      action: 'read',
      subject: 'Form',
      expected: true,
      name: 'Collaborator can read Form',
    },
    {
      id: 14,
      role: 'collaborator',
      action: 'create',
      subject: 'Form',
      expected: false,
      name: 'Collaborator cannot create Form',
    },
    {
      id: 15,
      role: 'collaborator',
      action: 'update',
      subject: 'Form',
      expected: false,
      name: 'Collaborator cannot update Form',
    },
    {
      id: 16,
      role: 'collaborator',
      action: 'delete',
      subject: 'Form',
      expected: false,
      name: 'Collaborator cannot delete Form',
    },
    {
      id: 17,
      role: 'collaborator',
      action: 'read',
      subject: 'FormSubmission',
      expected: false,
      name: 'Collaborator cannot read FormSubmission',
    },
    {
      id: 18,
      role: 'collaborator',
      action: 'manage',
      subject: 'FormSubmission',
      expected: false,
      name: 'Collaborator cannot manage FormSubmission',
    },
  ];

  testCases.forEach(({ id, role, action, subject, expected, name }) => {
    it(`[TC-${id.toString().padStart(2, '0')}] ${name}`, () => {
      const ability = AbilityFactory.createForUser(role, user);
      expect(ability.can(action, subject)).toBe(expected);
    });
  });
});
