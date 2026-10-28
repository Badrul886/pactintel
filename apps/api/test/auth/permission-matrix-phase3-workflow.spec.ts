import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';

/**
 * Phase 3 Sprint 3.2 CASL Permission Matrix for Visual Workflow Orchestration
 * Verifies role boundaries across WorkflowDefinition and WorkflowInstance.
 */
describe('Phase 3 Sprint 3.2 Workflow Orchestration CASL Permission Matrix', () => {
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
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'owner can manage WorkflowDefinition',
    },
    {
      id: 2,
      role: 'owner',
      action: 'manage',
      subject: 'WorkflowInstance',
      expected: true,
      name: 'owner can manage WorkflowInstance',
    },
    {
      id: 3,
      role: 'admin',
      action: 'manage',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'admin can manage WorkflowDefinition',
    },
    {
      id: 4,
      role: 'admin',
      action: 'manage',
      subject: 'WorkflowInstance',
      expected: true,
      name: 'admin can manage WorkflowInstance',
    },

    // Manager
    {
      id: 5,
      role: 'manager',
      action: 'create',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'manager can create WorkflowDefinition',
    },
    {
      id: 6,
      role: 'manager',
      action: 'read',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'manager can read WorkflowDefinition',
    },
    {
      id: 7,
      role: 'manager',
      action: 'update',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'manager can update WorkflowDefinition',
    },
    {
      id: 8,
      role: 'manager',
      action: 'delete',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'manager can delete WorkflowDefinition',
    },
    {
      id: 9,
      role: 'manager',
      action: 'manage',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'manager can manage WorkflowDefinition',
    },
    {
      id: 10,
      role: 'manager',
      action: 'manage',
      subject: 'WorkflowInstance',
      expected: true,
      name: 'manager can manage WorkflowInstance',
    },
    {
      id: 11,
      role: 'manager',
      action: 'read',
      subject: 'WorkflowInstance',
      expected: true,
      name: 'manager can read WorkflowInstance',
    },

    // Member
    {
      id: 12,
      role: 'member',
      action: 'read',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'member can read WorkflowDefinition',
    },
    {
      id: 13,
      role: 'member',
      action: 'execute',
      subject: 'WorkflowDefinition',
      expected: true,
      name: 'member can execute WorkflowDefinition',
    },
    {
      id: 14,
      role: 'member',
      action: 'read',
      subject: 'WorkflowInstance',
      expected: true,
      name: 'member can read WorkflowInstance',
    },
    {
      id: 15,
      role: 'member',
      action: 'create',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'member cannot create WorkflowDefinition',
    },
    {
      id: 16,
      role: 'member',
      action: 'update',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'member cannot update WorkflowDefinition',
    },
    {
      id: 17,
      role: 'member',
      action: 'delete',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'member cannot delete WorkflowDefinition',
    },
    {
      id: 18,
      role: 'member',
      action: 'manage',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'member cannot manage WorkflowDefinition',
    },
    {
      id: 19,
      role: 'member',
      action: 'manage',
      subject: 'WorkflowInstance',
      expected: false,
      name: 'member cannot manage WorkflowInstance',
    },

    // Collaborator
    {
      id: 20,
      role: 'collaborator',
      action: 'read',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'collaborator cannot read WorkflowDefinition',
    },
    {
      id: 21,
      role: 'collaborator',
      action: 'execute',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'collaborator cannot execute WorkflowDefinition',
    },
    {
      id: 22,
      role: 'collaborator',
      action: 'create',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'collaborator cannot create WorkflowDefinition',
    },
    {
      id: 23,
      role: 'collaborator',
      action: 'manage',
      subject: 'WorkflowDefinition',
      expected: false,
      name: 'collaborator cannot manage WorkflowDefinition',
    },
    {
      id: 24,
      role: 'collaborator',
      action: 'read',
      subject: 'WorkflowInstance',
      expected: false,
      name: 'collaborator cannot read WorkflowInstance',
    },
    {
      id: 25,
      role: 'collaborator',
      action: 'manage',
      subject: 'WorkflowInstance',
      expected: false,
      name: 'collaborator cannot manage WorkflowInstance',
    },
  ];

  testCases.forEach((tc) => {
    it(`[TC-${tc.id}] ${tc.name}`, () => {
      const ability = AbilityFactory.createForUser(tc.role, user);
      expect(ability.can(tc.action, tc.subject)).toBe(tc.expected);
    });
  });
});
