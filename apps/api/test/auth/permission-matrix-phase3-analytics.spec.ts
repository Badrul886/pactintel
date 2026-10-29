import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.10 CASL Permission Matrix for Analytics & Custom Reports
 * Validates role boundaries across:
 * - Owner: full authority to manage CustomReport and read Analytics
 * - Admin: full authority to manage CustomReport and read Analytics
 * - Manager: authority to manage CustomReport and read Analytics
 * - Member: authority to create/read/update/delete CustomReport and read Analytics
 * - Collaborator: strictly denied access to CustomReport and Analytics
 */
describe('Phase 3 Sprint 3.10 Analytics & Custom Reports CASL Permission Matrix', () => {
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
      subject: 'CustomReport',
      expected: true,
      name: 'Owner can manage CustomReport',
    },
    {
      id: 2,
      role: 'owner',
      action: 'read',
      subject: 'Analytics',
      expected: true,
      name: 'Owner can read Analytics',
    },

    // Admin
    {
      id: 3,
      role: 'admin',
      action: 'manage',
      subject: 'CustomReport',
      expected: true,
      name: 'Admin can manage CustomReport',
    },
    {
      id: 4,
      role: 'admin',
      action: 'read',
      subject: 'Analytics',
      expected: true,
      name: 'Admin can read Analytics',
    },

    // Manager
    {
      id: 5,
      role: 'manager',
      action: 'manage',
      subject: 'CustomReport',
      expected: true,
      name: 'Manager can manage CustomReport',
    },
    {
      id: 6,
      role: 'manager',
      action: 'read',
      subject: 'Analytics',
      expected: true,
      name: 'Manager can read Analytics',
    },

    // Member
    {
      id: 7,
      role: 'member',
      action: 'create',
      subject: 'CustomReport',
      expected: true,
      name: 'Member can create CustomReport',
    },
    {
      id: 8,
      role: 'member',
      action: 'read',
      subject: 'CustomReport',
      expected: true,
      name: 'Member can read CustomReport',
    },
    {
      id: 9,
      role: 'member',
      action: 'delete',
      subject: 'CustomReport',
      expected: true,
      name: 'Member can delete CustomReport',
    },
    {
      id: 10,
      role: 'member',
      action: 'read',
      subject: 'Analytics',
      expected: true,
      name: 'Member can read Analytics',
    },

    // Collaborator (Restricted Guest Seat)
    {
      id: 11,
      role: 'collaborator',
      action: 'read',
      subject: 'Analytics',
      expected: false,
      name: 'Collaborator CANNOT read Analytics',
    },
    {
      id: 12,
      role: 'collaborator',
      action: 'read',
      subject: 'CustomReport',
      expected: false,
      name: 'Collaborator CANNOT read CustomReport',
    },
    {
      id: 13,
      role: 'collaborator',
      action: 'create',
      subject: 'CustomReport',
      expected: false,
      name: 'Collaborator CANNOT create CustomReport',
    },
    {
      id: 14,
      role: 'collaborator',
      action: 'manage',
      subject: 'CustomReport',
      expected: false,
      name: 'Collaborator CANNOT manage CustomReport',
    },
  ];

  testCases.forEach((tc) => {
    it(`[TC-${tc.id.toString().padStart(2, '0')}] ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      const result = ability.can(tc.action, tc.subject);
      expect(result).toBe(tc.expected);
    });
  });
});
