import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.8 CASL Permission Matrix for Multi-Workspace
 * Verifies role boundaries across the Workspace subject:
 * - Owner / Admin: full management rights
 * - Manager: can create, read, and update workspaces; cannot delete workspaces
 * - Member: read-only access to workspaces; cannot create, update, or delete
 * - Collaborator: read-only access to workspaces; cannot create, update, or delete
 */
describe('Phase 3 Sprint 3.8 Multi-Workspace CASL Permission Matrix', () => {
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
    // --- Owner ---
    {
      id: 1,
      role: 'owner',
      action: 'manage',
      subject: 'Workspace',
      expected: true,
      name: 'Owner can manage Workspace',
    },
    {
      id: 2,
      role: 'owner',
      action: 'create',
      subject: 'Workspace',
      expected: true,
      name: 'Owner can create Workspace',
    },
    {
      id: 3,
      role: 'owner',
      action: 'read',
      subject: 'Workspace',
      expected: true,
      name: 'Owner can read Workspace',
    },
    {
      id: 4,
      role: 'owner',
      action: 'update',
      subject: 'Workspace',
      expected: true,
      name: 'Owner can update Workspace',
    },
    {
      id: 5,
      role: 'owner',
      action: 'delete',
      subject: 'Workspace',
      expected: true,
      name: 'Owner can delete Workspace',
    },

    // --- Admin ---
    {
      id: 6,
      role: 'admin',
      action: 'manage',
      subject: 'Workspace',
      expected: true,
      name: 'Admin can manage Workspace',
    },
    {
      id: 7,
      role: 'admin',
      action: 'create',
      subject: 'Workspace',
      expected: true,
      name: 'Admin can create Workspace',
    },
    {
      id: 8,
      role: 'admin',
      action: 'read',
      subject: 'Workspace',
      expected: true,
      name: 'Admin can read Workspace',
    },
    {
      id: 9,
      role: 'admin',
      action: 'update',
      subject: 'Workspace',
      expected: true,
      name: 'Admin can update Workspace',
    },
    {
      id: 10,
      role: 'admin',
      action: 'delete',
      subject: 'Workspace',
      expected: true,
      name: 'Admin can delete Workspace',
    },

    // --- Manager ---
    {
      id: 11,
      role: 'manager',
      action: 'create',
      subject: 'Workspace',
      expected: true,
      name: 'Manager can create Workspace',
    },
    {
      id: 12,
      role: 'manager',
      action: 'read',
      subject: 'Workspace',
      expected: true,
      name: 'Manager can read Workspace',
    },
    {
      id: 13,
      role: 'manager',
      action: 'update',
      subject: 'Workspace',
      expected: true,
      name: 'Manager can update Workspace',
    },
    {
      id: 14,
      role: 'manager',
      action: 'delete',
      subject: 'Workspace',
      expected: false,
      name: 'Manager CANNOT delete Workspace',
    },

    // --- Member ---
    {
      id: 15,
      role: 'member',
      action: 'read',
      subject: 'Workspace',
      expected: true,
      name: 'Member can read Workspace',
    },
    {
      id: 16,
      role: 'member',
      action: 'create',
      subject: 'Workspace',
      expected: false,
      name: 'Member CANNOT create Workspace',
    },
    {
      id: 17,
      role: 'member',
      action: 'update',
      subject: 'Workspace',
      expected: false,
      name: 'Member CANNOT update Workspace',
    },
    {
      id: 18,
      role: 'member',
      action: 'delete',
      subject: 'Workspace',
      expected: false,
      name: 'Member CANNOT delete Workspace',
    },

    // --- Collaborator ---
    {
      id: 19,
      role: 'collaborator',
      action: 'read',
      subject: 'Workspace',
      expected: true,
      name: 'Collaborator can read Workspace',
    },
    {
      id: 20,
      role: 'collaborator',
      action: 'create',
      subject: 'Workspace',
      expected: false,
      name: 'Collaborator CANNOT create Workspace',
    },
    {
      id: 21,
      role: 'collaborator',
      action: 'update',
      subject: 'Workspace',
      expected: false,
      name: 'Collaborator CANNOT update Workspace',
    },
    {
      id: 22,
      role: 'collaborator',
      action: 'delete',
      subject: 'Workspace',
      expected: false,
      name: 'Collaborator CANNOT delete Workspace',
    },
  ];

  testCases.forEach((tc) => {
    it(`[TC-${tc.id.toString().padStart(2, '0')}] ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      expect(ability.can(tc.action, tc.subject)).toBe(tc.expected);
    });
  });
});
