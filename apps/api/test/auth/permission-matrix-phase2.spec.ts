import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { UserRole, Action, Subject } from '@pactintel/shared-types';
import { subject } from '@casl/ability';

/**
 * Phase 2 CASL Permission Matrix (Blueprint §7.3 & Phase 2 Build Plan §2.8.1)
 * Exhaustive 18 Parametrized Test Cases
 */
describe('Phase 2 CASL Permission Matrix (Phase 2 Build Plan §2.8.1)', () => {
  const memberUser = { id: 'usr-member-123' };
  const otherUser = { id: 'usr-other-456' };

  interface TestCase {
    id: number;
    role: UserRole;
    action: Action;
    subject: Subject;
    expected: boolean;
    name: string;
    subjectInstance?: any;
    user?: { id: string };
  }

  const testCases: TestCase[] = [
    {
      id: 1,
      role: 'admin',
      action: 'manage',
      subject: 'Webhook',
      expected: true,
      name: '1. admin + manage + Webhook = allow',
    },
    {
      id: 2,
      role: 'manager',
      action: 'manage',
      subject: 'Webhook',
      expected: false,
      name: '2. manager + manage + Webhook = deny (admin only)',
    },
    {
      id: 3,
      role: 'member',
      action: 'create',
      subject: 'Comment',
      expected: true,
      name: '3. member + create + Comment = allow',
    },
    {
      id: 4,
      role: 'member',
      action: 'update',
      subject: 'Comment',
      expected: false,
      name: "4. member + update + Comment (other's) = deny",
      user: memberUser,
      subjectInstance: subject('Comment', { authorId: otherUser.id } as any),
    },
    {
      id: 5,
      role: 'member',
      action: 'update',
      subject: 'Comment',
      expected: true,
      name: '5. member + update + Comment (own) = allow',
      user: memberUser,
      subjectInstance: subject('Comment', { authorId: memberUser.id } as any),
    },
    {
      id: 6,
      role: 'collaborator',
      action: 'use',
      subject: 'AiFeature',
      expected: false,
      name: '6. collaborator + use + AiFeature = deny (AI requires full seat)',
    },
    {
      id: 7,
      role: 'member',
      action: 'use',
      subject: 'AiFeature',
      expected: true,
      name: '7. member + use + AiFeature = allow',
    },
    {
      id: 8,
      role: 'manager',
      action: 'create',
      subject: 'ContentLock',
      expected: true,
      name: '8. manager + create + ContentLock = allow',
    },
    {
      id: 9,
      role: 'member',
      action: 'create',
      subject: 'ContentLock',
      expected: false,
      name: '9. member + create + ContentLock = deny (manager/admin only)',
    },
    {
      id: 10,
      role: 'admin',
      action: 'manage',
      subject: 'PaymentCredential',
      expected: true,
      name: '10. admin + manage + PaymentCredential = allow',
    },
    {
      id: 11,
      role: 'manager',
      action: 'manage',
      subject: 'PaymentCredential',
      expected: false,
      name: '11. manager + manage + PaymentCredential = deny (admin only)',
    },
    {
      id: 12,
      role: 'admin',
      action: 'manage',
      subject: 'ApprovalChain',
      expected: true,
      name: '12. admin + manage + ApprovalChain = allow',
    },
    {
      id: 13,
      role: 'manager',
      action: 'create',
      subject: 'ApprovalChain',
      expected: true,
      name: '13. manager + create + ApprovalChain = allow',
    },
    {
      id: 14,
      role: 'member',
      action: 'create',
      subject: 'ApprovalChain',
      expected: false,
      name: '14. member + create + ApprovalChain = deny',
    },
    {
      id: 15,
      role: 'admin',
      action: 'manage',
      subject: 'ClickwrapAgreement',
      expected: true,
      name: '15. admin + manage + ClickwrapAgreement = allow',
    },
    {
      id: 16,
      role: 'member',
      action: 'manage',
      subject: 'ClickwrapAgreement',
      expected: false,
      name: '16. member + manage + ClickwrapAgreement = deny',
    },
    {
      id: 17,
      role: 'collaborator',
      action: 'create',
      subject: 'Comment',
      expected: true,
      name: '17. collaborator + create + Comment = allow',
    },
    {
      id: 18,
      role: 'manager',
      action: 'create',
      subject: 'AutomationRule',
      expected: true,
      name: '18. manager + create + AutomationRule = allow',
    },
  ];

  test.each(testCases)(
    '$name',
    ({ role, action, subject: sub, expected, subjectInstance, user }) => {
      const ability = AbilityFactory.createForUser(role, user);
      const target = subjectInstance || sub;
      const isAllowed = ability.can(action, target);
      expect(isAllowed).toBe(expected);
    },
  );
});
