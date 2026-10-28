import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.5 CASL Permission Matrix for Portfolio Agreement Intelligence
 * Verifies role boundaries across Portfolio, ObligationRecord, Counterparty, and CustomExtractionField.
 */
describe('Phase 3 Sprint 3.5 Portfolio Intelligence CASL Permission Matrix', () => {
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
      subject: 'Portfolio',
      expected: true,
      name: 'owner can manage Portfolio',
    },
    {
      id: 2,
      role: 'owner',
      action: 'manage',
      subject: 'ObligationRecord',
      expected: true,
      name: 'owner can manage ObligationRecord',
    },
    {
      id: 3,
      role: 'owner',
      action: 'manage',
      subject: 'Counterparty',
      expected: true,
      name: 'owner can manage Counterparty',
    },
    {
      id: 4,
      role: 'owner',
      action: 'manage',
      subject: 'CustomExtractionField',
      expected: true,
      name: 'owner can manage CustomExtractionField',
    },
    {
      id: 5,
      role: 'admin',
      action: 'manage',
      subject: 'Portfolio',
      expected: true,
      name: 'admin can manage Portfolio',
    },
    {
      id: 6,
      role: 'admin',
      action: 'manage',
      subject: 'ObligationRecord',
      expected: true,
      name: 'admin can manage ObligationRecord',
    },
    {
      id: 7,
      role: 'admin',
      action: 'manage',
      subject: 'Counterparty',
      expected: true,
      name: 'admin can manage Counterparty',
    },
    {
      id: 8,
      role: 'admin',
      action: 'manage',
      subject: 'CustomExtractionField',
      expected: true,
      name: 'admin can manage CustomExtractionField',
    },

    // Manager
    {
      id: 9,
      role: 'manager',
      action: 'manage',
      subject: 'Portfolio',
      expected: true,
      name: 'manager can manage Portfolio',
    },
    {
      id: 10,
      role: 'manager',
      action: 'manage',
      subject: 'ObligationRecord',
      expected: true,
      name: 'manager can manage ObligationRecord',
    },
    {
      id: 11,
      role: 'manager',
      action: 'manage',
      subject: 'Counterparty',
      expected: true,
      name: 'manager can manage Counterparty',
    },
    {
      id: 12,
      role: 'manager',
      action: 'manage',
      subject: 'CustomExtractionField',
      expected: true,
      name: 'manager can manage CustomExtractionField',
    },

    // Member
    {
      id: 13,
      role: 'member',
      action: 'read',
      subject: 'Portfolio',
      expected: true,
      name: 'member can read Portfolio',
    },
    {
      id: 14,
      role: 'member',
      action: 'read',
      subject: 'ObligationRecord',
      expected: true,
      name: 'member can read ObligationRecord',
    },
    {
      id: 15,
      role: 'member',
      action: 'create',
      subject: 'ObligationRecord',
      expected: true,
      name: 'member can create ObligationRecord',
    },
    {
      id: 16,
      role: 'member',
      action: 'update',
      subject: 'ObligationRecord',
      expected: true,
      name: 'member can update ObligationRecord',
    },
    {
      id: 17,
      role: 'member',
      action: 'read',
      subject: 'Counterparty',
      expected: true,
      name: 'member can read Counterparty',
    },
    {
      id: 18,
      role: 'member',
      action: 'create',
      subject: 'Counterparty',
      expected: true,
      name: 'member can create Counterparty',
    },
    {
      id: 19,
      role: 'member',
      action: 'update',
      subject: 'Counterparty',
      expected: true,
      name: 'member can update Counterparty',
    },
    {
      id: 20,
      role: 'member',
      action: 'read',
      subject: 'CustomExtractionField',
      expected: true,
      name: 'member can read CustomExtractionField',
    },
    {
      id: 21,
      role: 'member',
      action: 'manage',
      subject: 'CustomExtractionField',
      expected: false,
      name: 'member cannot manage CustomExtractionField',
    },

    // Collaborator
    {
      id: 22,
      role: 'collaborator',
      action: 'read',
      subject: 'Portfolio',
      expected: true,
      name: 'collaborator can read Portfolio',
    },
    {
      id: 23,
      role: 'collaborator',
      action: 'read',
      subject: 'ObligationRecord',
      expected: true,
      name: 'collaborator can read ObligationRecord',
    },
    {
      id: 24,
      role: 'collaborator',
      action: 'create',
      subject: 'ObligationRecord',
      expected: false,
      name: 'collaborator cannot create ObligationRecord',
    },
    {
      id: 25,
      role: 'collaborator',
      action: 'update',
      subject: 'ObligationRecord',
      expected: false,
      name: 'collaborator cannot update ObligationRecord',
    },
    {
      id: 26,
      role: 'collaborator',
      action: 'delete',
      subject: 'ObligationRecord',
      expected: false,
      name: 'collaborator cannot delete ObligationRecord',
    },
    {
      id: 27,
      role: 'collaborator',
      action: 'read',
      subject: 'Counterparty',
      expected: true,
      name: 'collaborator can read Counterparty',
    },
    {
      id: 28,
      role: 'collaborator',
      action: 'create',
      subject: 'Counterparty',
      expected: false,
      name: 'collaborator cannot create Counterparty',
    },
    {
      id: 29,
      role: 'collaborator',
      action: 'update',
      subject: 'Counterparty',
      expected: false,
      name: 'collaborator cannot update Counterparty',
    },
    {
      id: 30,
      role: 'collaborator',
      action: 'manage',
      subject: 'CustomExtractionField',
      expected: false,
      name: 'collaborator cannot manage CustomExtractionField',
    },
  ];

  testCases.forEach((tc) => {
    it(`[TC-${tc.id}] ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      expect(ability.can(tc.action, tc.subject)).toBe(tc.expected);
    });
  });
});
