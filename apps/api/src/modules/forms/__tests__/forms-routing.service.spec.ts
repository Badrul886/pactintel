import { FormsRoutingService } from '../forms-routing.service';
import { FormsRepository } from '../forms.repository';
import { FormsMagicLinkService } from '../forms-magic-link.service';
import { NotificationService } from '../../notification/notification.service';
import { FormRoleDefinition, FormRoutingRule } from '@pactintel/shared-types';

describe('FormsRoutingService Unit Tests (Sprint 3.11, EC-FORM-11, EC-FORM-13)', () => {
  let service: FormsRoutingService;
  let mockRepo: jest.Mocked<FormsRepository>;
  let mockMagicLink: jest.Mocked<FormsMagicLinkService>;
  let mockNotification: jest.Mocked<NotificationService>;

  const orgId = 'org-uuid-1';
  const formId = 'form-uuid-1';
  const submissionId = 'sub-uuid-1';

  beforeEach(() => {
    mockRepo = {
      updateSubmission: jest.fn(),
    } as unknown as jest.Mocked<FormsRepository>;

    mockMagicLink = {
      createMagicLink: jest.fn(),
    } as unknown as jest.Mocked<FormsMagicLinkService>;

    mockNotification = {
      notifyUser: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    service = new FormsRoutingService(mockRepo, mockMagicLink, mockNotification);
  });

  describe('advanceRole (EC-FORM-11 Multi-role progression)', () => {
    const roles: FormRoleDefinition[] = [
      { roleName: 'Applicant', sortOrder: 0, fields: ['f_name', 'f_email'] },
      {
        roleName: 'Manager',
        sortOrder: 1,
        fields: ['f_approved', 'f_budget'],
        routingEmail: 'manager@example.com',
      },
      {
        roleName: 'HR',
        sortOrder: 2,
        fields: ['f_salary'],
        routingEmail: 'hr@example.com',
      },
    ];

    it('advances from Applicant (Role 0) to Manager (Role 1), generates magic link and notifies', async () => {
      mockMagicLink.createMagicLink.mockResolvedValue({
        token: 'token-manager-123',
        expiresAt: new Date(),
      });

      const result = await service.advanceRole({
        organizationId: orgId,
        form: {
          id: formId,
          name: 'Job Application',
          slug: 'job-app',
          roles,
        },
        submission: {
          id: submissionId,
          currentRole: 'Applicant',
          data: { f_name: 'John', f_email: 'john@example.com' },
          submitterEmail: 'john@example.com',
        },
        newAnswers: {},
      });

      expect(result.completed).toBe(false);
      expect(result.nextRole).toBe('Manager');
      expect(result.magicLinkToken).toBe('token-manager-123');

      expect(mockMagicLink.createMagicLink).toHaveBeenCalledWith({
        organizationId: orgId,
        formId,
        submissionId,
        roleName: 'Manager',
      });

      expect(mockRepo.updateSubmission).toHaveBeenCalledWith(orgId, submissionId, {
        data: { f_name: 'John', f_email: 'john@example.com' },
        status: 'partial',
        currentRole: 'Manager',
      });

      expect(mockNotification.notifyUser).toHaveBeenCalledWith(
        'manager@example.com',
        orgId,
        expect.objectContaining({
          title: expect.stringContaining('Manager'),
          eventType: 'form_role_invite',
        }),
      );
    });

    it('advances from Manager (Role 1) to HR (Role 2)', async () => {
      mockMagicLink.createMagicLink.mockResolvedValue({
        token: 'token-hr-456',
        expiresAt: new Date(),
      });

      const result = await service.advanceRole({
        organizationId: orgId,
        form: {
          id: formId,
          name: 'Job Application',
          slug: 'job-app',
          roles,
        },
        submission: {
          id: submissionId,
          currentRole: 'Manager',
          data: { f_name: 'John', f_email: 'john@example.com' },
          submitterEmail: 'john@example.com',
        },
        newAnswers: { f_approved: true, f_budget: 10000 },
      });

      expect(result.completed).toBe(false);
      expect(result.nextRole).toBe('HR');
      expect(result.magicLinkToken).toBe('token-hr-456');

      expect(mockRepo.updateSubmission).toHaveBeenCalledWith(orgId, submissionId, {
        data: { f_name: 'John', f_email: 'john@example.com', f_approved: true, f_budget: 10000 },
        status: 'partial',
        currentRole: 'HR',
      });
    });

    it('marks submission complete when final role (HR) submits', async () => {
      const result = await service.advanceRole({
        organizationId: orgId,
        form: {
          id: formId,
          name: 'Job Application',
          slug: 'job-app',
          roles,
        },
        submission: {
          id: submissionId,
          currentRole: 'HR',
          data: { f_name: 'John', f_email: 'john@example.com', f_approved: true },
          submitterEmail: 'john@example.com',
        },
        newAnswers: { f_salary: 85000 },
      });

      expect(result.completed).toBe(true);
      expect(result.nextRole).toBeUndefined();

      expect(mockRepo.updateSubmission).toHaveBeenCalledWith(orgId, submissionId, {
        data: {
          f_name: 'John',
          f_email: 'john@example.com',
          f_approved: true,
          f_salary: 85000,
        },
        status: 'complete',
        currentRole: null,
        submittedAt: expect.any(Date),
      });
    });

    it('completes single-role form immediately upon initial submission', async () => {
      const result = await service.advanceRole({
        organizationId: orgId,
        form: {
          id: formId,
          name: 'Feedback Form',
          slug: 'feedback',
          roles: [{ roleName: 'Submitter', sortOrder: 0, fields: ['f_rating'] }],
        },
        submission: {
          id: submissionId,
          currentRole: null,
          data: {},
        },
        newAnswers: { f_rating: 5 },
      });

      expect(result.completed).toBe(true);
      expect(mockRepo.updateSubmission).toHaveBeenCalledWith(orgId, submissionId, {
        data: { f_rating: 5 },
        status: 'complete',
        currentRole: null,
        submittedAt: expect.any(Date),
      });
    });
  });

  describe('evaluateRoutingRules (EC-FORM-13)', () => {
    it('evaluates greater_than condition and dispatches alert notification', async () => {
      const rules: FormRoutingRule[] = [
        {
          id: 'rule-high-budget',
          condition: {
            fieldId: 'budget',
            operator: 'greater_than',
            value: 50000,
          },
          action: {
            type: 'notify_email',
            target: 'enterprise-sales@pactintel.com',
          },
        },
      ];

      const { triggeredCount, matchedActions } = await service.evaluateRoutingRules(
        orgId,
        rules,
        { budget: 75000 },
        'Enterprise Intake',
      );

      expect(triggeredCount).toBe(1);
      expect(matchedActions).toContain('notify_email:enterprise-sales@pactintel.com');
      expect(mockNotification.notifyUser).toHaveBeenCalledWith(
        'enterprise-sales@pactintel.com',
        orgId,
        expect.objectContaining({
          title: expect.stringContaining('Enterprise Intake'),
          eventType: 'form_routing_alert',
        }),
      );
    });

    it('evaluates contains condition accurately', async () => {
      const rules: FormRoutingRule[] = [
        {
          id: 'rule-vip',
          condition: {
            fieldId: 'notes',
            operator: 'contains',
            value: 'urgent',
          },
          action: {
            type: 'notify_email',
            target: 'vip-desk@pactintel.com',
          },
        },
      ];

      const { triggeredCount } = await service.evaluateRoutingRules(
        orgId,
        rules,
        { notes: 'This is an URGENT request' },
        'Contact Form',
      );

      expect(triggeredCount).toBe(1);
    });
  });
});
