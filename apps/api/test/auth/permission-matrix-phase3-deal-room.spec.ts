import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';
import { subject } from '@casl/ability';

/**
 * Phase 3 Sprint 3.3 CASL Permission Matrix for Deal Rooms (Digital Sales Rooms)
 * Verifies role boundaries across DealRoom and DealRoomMessage.
 */
describe('Phase 3 Sprint 3.3 Deal Rooms CASL Permission Matrix', () => {
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
      subject: 'DealRoom',
      expected: true,
      name: 'owner can manage DealRoom',
    },
    {
      id: 2,
      role: 'owner',
      action: 'manage',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'owner can manage DealRoomMessage',
    },
    {
      id: 3,
      role: 'admin',
      action: 'manage',
      subject: 'DealRoom',
      expected: true,
      name: 'admin can manage DealRoom',
    },
    {
      id: 4,
      role: 'admin',
      action: 'manage',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'admin can manage DealRoomMessage',
    },

    // Manager
    {
      id: 5,
      role: 'manager',
      action: 'create',
      subject: 'DealRoom',
      expected: true,
      name: 'manager can create DealRoom',
    },
    {
      id: 6,
      role: 'manager',
      action: 'read',
      subject: 'DealRoom',
      expected: true,
      name: 'manager can read DealRoom',
    },
    {
      id: 7,
      role: 'manager',
      action: 'update',
      subject: 'DealRoom',
      expected: true,
      name: 'manager can update DealRoom',
    },
    {
      id: 8,
      role: 'manager',
      action: 'delete',
      subject: 'DealRoom',
      expected: true,
      name: 'manager can delete DealRoom',
    },
    {
      id: 9,
      role: 'manager',
      action: 'manage',
      subject: 'DealRoom',
      expected: true,
      name: 'manager can manage DealRoom',
    },
    {
      id: 10,
      role: 'manager',
      action: 'manage',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'manager can manage DealRoomMessage',
    },
    {
      id: 11,
      role: 'manager',
      action: 'read',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'manager can read DealRoomMessage',
    },
    {
      id: 12,
      role: 'manager',
      action: 'create',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'manager can create DealRoomMessage',
    },

    // Member
    {
      id: 13,
      role: 'member',
      action: 'read',
      subject: 'DealRoom',
      expected: true,
      name: 'member can read DealRoom',
    },
    {
      id: 14,
      role: 'member',
      action: 'create',
      subject: 'DealRoom',
      expected: true,
      name: 'member can create DealRoom',
    },
    {
      id: 15,
      role: 'member',
      action: 'update',
      subject: 'DealRoom',
      expected: true,
      name: 'member can update DealRoom',
    },
    {
      id: 16,
      role: 'member',
      action: 'delete',
      subject: 'DealRoom',
      expected: false,
      name: 'member cannot delete DealRoom',
    },
    {
      id: 17,
      role: 'member',
      action: 'manage',
      subject: 'DealRoom',
      expected: false,
      name: 'member cannot manage DealRoom',
    },
    {
      id: 18,
      role: 'member',
      action: 'read',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'member can read DealRoomMessage',
    },
    {
      id: 19,
      role: 'member',
      action: 'create',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'member can create DealRoomMessage',
    },
    {
      id: 20,
      role: 'member',
      action: 'manage',
      subject: 'DealRoomMessage',
      expected: false,
      name: 'member cannot manage DealRoomMessage',
    },

    // Collaborator
    {
      id: 21,
      role: 'collaborator',
      action: 'read',
      subject: 'DealRoom',
      expected: true,
      name: 'collaborator can read DealRoom',
    },
    {
      id: 22,
      role: 'collaborator',
      action: 'create',
      subject: 'DealRoom',
      expected: false,
      name: 'collaborator cannot create DealRoom',
    },
    {
      id: 23,
      role: 'collaborator',
      action: 'update',
      subject: 'DealRoom',
      expected: false,
      name: 'collaborator cannot update DealRoom',
    },
    {
      id: 24,
      role: 'collaborator',
      action: 'delete',
      subject: 'DealRoom',
      expected: false,
      name: 'collaborator cannot delete DealRoom',
    },
    {
      id: 25,
      role: 'collaborator',
      action: 'read',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'collaborator can read DealRoomMessage',
    },
    {
      id: 26,
      role: 'collaborator',
      action: 'create',
      subject: 'DealRoomMessage',
      expected: true,
      name: 'collaborator can create DealRoomMessage',
    },
    {
      id: 27,
      role: 'collaborator',
      action: 'update',
      subject: 'DealRoomMessage',
      expected: false,
      name: 'collaborator cannot update DealRoomMessage',
    },
    {
      id: 28,
      role: 'collaborator',
      action: 'delete',
      subject: 'DealRoomMessage',
      expected: false,
      name: 'collaborator cannot delete DealRoomMessage',
    },
  ];

  testCases.forEach((tc) => {
    it(`[TC-${tc.id}] ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      expect(ability.can(tc.action, tc.subject)).toBe(tc.expected);
    });
  });

  describe('Field/Attribute-level checks for Member', () => {
    it('member can update their own message', () => {
      const ability = AbilityFactory.createForUser('member', user);
      const ownMessage = subject('DealRoomMessage', { authorId: user.id } as any);
      expect(ability.can('update', ownMessage)).toBe(true);
    });

    it('member cannot update another member message', () => {
      const ability = AbilityFactory.createForUser('member', user);
      const otherMessage = subject('DealRoomMessage', { authorId: 'usr-other-999' } as any);
      expect(ability.can('update', otherMessage)).toBe(false);
    });
  });
});
