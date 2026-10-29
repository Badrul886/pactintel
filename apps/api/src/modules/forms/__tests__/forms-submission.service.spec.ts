import { FormsSubmissionService } from '../forms-submission.service';
import { FormsRepository } from '../forms.repository';
import { FormsRoutingService } from '../forms-routing.service';
import { FormsMagicLinkService } from '../forms-magic-link.service';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FormDefinition } from '@pactintel/shared-types';

describe('FormsSubmissionService Unit Tests (Sprint 3.11, EC-FORM-03 … EC-FORM-14)', () => {
  let service: FormsSubmissionService;
  let mockRepo: jest.Mocked<FormsRepository>;
  let mockRouting: jest.Mocked<FormsRoutingService>;
  let mockMagicLink: jest.Mocked<FormsMagicLinkService>;

  const formId = 'form-test-id';
  const orgId = 'org-test-uuid';

  const sampleDefinition: FormDefinition = {
    sections: [
      {
        id: 'sec-1',
        title: 'Basic Info',
        fields: [
          { id: 'f_name', label: 'Full Name', type: 'text', required: true },
          { id: 'f_email', label: 'Email Address', type: 'email', required: true },
          { id: 'f_age', label: 'Age', type: 'number', min: 18, max: 120 },
          {
            id: 'f_company_size',
            label: 'Company Size',
            type: 'number',
          },
          {
            id: 'f_enterprise_needs',
            label: 'Enterprise Needs',
            type: 'text',
            required: true,
            dependsOn: {
              fieldId: 'f_company_size',
              operator: 'greater_than',
              value: 50,
            },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      findFormById: jest.fn(),
      findSubmissionById: jest.fn(),
      findSubmissionByEmail: jest.fn(),
      countCompletedSubmissions: jest.fn(),
      createSubmission: jest.fn(),
      updateSubmission: jest.fn(),
      updateForm: jest.fn(),
      listSubmissions: jest.fn(),
    } as unknown as jest.Mocked<FormsRepository>;

    mockRouting = {
      advanceRole: jest.fn(),
      evaluateRoutingRules: jest.fn(),
    } as unknown as jest.Mocked<FormsRoutingService>;

    mockMagicLink = {
      validateMagicLink: jest.fn(),
      markUsed: jest.fn(),
      createMagicLink: jest.fn(),
    } as unknown as jest.Mocked<FormsMagicLinkService>;

    service = new FormsSubmissionService(mockRepo, mockRouting, mockMagicLink);
  });

  describe('Rate Limiting (EC-FORM-03)', () => {
    it('allows 10 requests and rejects 11th request from same IP with 429 Too Many Requests', async () => {
      const ip = '198.51.100.25';
      for (let i = 0; i < 10; i++) {
        await expect(service.checkRateLimit(ip)).resolves.not.toThrow();
      }

      await expect(service.checkRateLimit(ip)).rejects.toThrow(HttpException);
      try {
        await service.checkRateLimit(ip);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  describe('Form Ingestion Guardrails (EC-FORM-04, EC-FORM-05, EC-FORM-06, EC-FORM-07)', () => {
    it('rejects submission if form status is draft or closed (403 Forbidden)', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: formId,
        status: 'draft',
      } as any);

      await expect(
        service.submitForm({
          formId,
          submitterIp: '1.2.3.4',
          rawAnswers: {},
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects submission and auto-closes form if closeDate has passed (EC-FORM-05)', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      mockRepo.findFormById.mockResolvedValue({
        id: formId,
        organizationId: orgId,
        status: 'published',
        settings: { closeDate: pastDate },
      } as any);

      await expect(
        service.submitForm({
          formId,
          submitterIp: '1.2.3.4',
          rawAnswers: {},
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockRepo.updateForm).toHaveBeenCalledWith(orgId, formId, { status: 'closed' });
    });

    it('rejects submission and auto-closes form if submissionLimit is reached (EC-FORM-06)', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: formId,
        organizationId: orgId,
        status: 'published',
        settings: { submissionLimit: 5 },
      } as any);
      mockRepo.countCompletedSubmissions.mockResolvedValue(5);

      await expect(
        service.submitForm({
          formId,
          submitterIp: '1.2.3.4',
          rawAnswers: {},
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.updateForm).toHaveBeenCalledWith(orgId, formId, { status: 'closed' });
    });

    it('rejects duplicate email submission when oneResponsePerEmail is true (EC-FORM-07)', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: formId,
        organizationId: orgId,
        status: 'published',
        settings: { oneResponsePerEmail: true },
      } as any);
      mockRepo.findSubmissionByEmail.mockResolvedValue({ id: 'existing-sub' } as any);

      await expect(
        service.submitForm({
          formId,
          submitterIp: '1.2.3.4',
          submitterEmail: 'john.doe@example.com',
          rawAnswers: {},
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockRepo.findSubmissionByEmail).toHaveBeenCalledWith(formId, 'john.doe@example.com');
    });
  });

  describe('Field Validation & Conditional Logic (EC-FORM-08, EC-FORM-09)', () => {
    it('throws BadRequestException when required field is missing', () => {
      expect(() =>
        service.validateAndPruneAnswers(sampleDefinition, { f_email: 'test@example.com' }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException on invalid email format', () => {
      expect(() =>
        service.validateAndPruneAnswers(sampleDefinition, {
          f_name: 'Alice',
          f_email: 'not-an-email',
        }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when numeric bounds are violated', () => {
      expect(() =>
        service.validateAndPruneAnswers(sampleDefinition, {
          f_name: 'Alice',
          f_email: 'alice@example.com',
          f_age: 15, // min is 18
        }),
      ).toThrow(BadRequestException);
    });

    it('exempts conditional field when condition is not met (prunes hidden fields)', () => {
      // f_enterprise_needs is required ONLY IF f_company_size > 50
      const answers = service.validateAndPruneAnswers(sampleDefinition, {
        f_name: 'Bob',
        f_email: 'bob@example.com',
        f_company_size: 10, // <= 50, so f_enterprise_needs should be skipped
      });

      expect(answers.f_name).toBe('Bob');
      expect(answers.f_email).toBe('bob@example.com');
      expect(answers.f_enterprise_needs).toBeUndefined();
    });

    it('enforces required on conditional field when condition IS met', () => {
      expect(() =>
        service.validateAndPruneAnswers(sampleDefinition, {
          f_name: 'Charlie',
          f_email: 'charlie@example.com',
          f_company_size: 100, // > 50, so f_enterprise_needs is required
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('OWASP Formula Injection Defense in CSV Export (EC-FORM-14)', () => {
    it('prefixes formula triggers (=, +, -, @, \\t, \\r) with single quote in exported CSV', async () => {
      mockRepo.findFormById.mockResolvedValue({
        id: formId,
        definition: sampleDefinition,
      } as any);

      mockRepo.listSubmissions.mockResolvedValue({
        items: [
          {
            id: 'sub-1',
            status: 'complete',
            submitterEmail: 'attacker@example.com',
            submitterIp: '1.2.3.4',
            submittedAt: new Date('2026-10-29T10:00:00Z'),
            data: {
              f_name: '=CMD("calc.exe")',
              f_email: '+1234567890',
              f_age: 25,
            },
          },
          {
            id: 'sub-2',
            status: 'complete',
            submitterEmail: 'safe@example.com',
            submitterIp: '1.2.3.4',
            submittedAt: new Date('2026-10-29T10:05:00Z'),
            data: {
              f_name: '@SUM(A1:A10)',
              f_email: 'safe@example.com',
              f_age: 30,
            },
          },
        ],
      } as any);

      const csv = await service.exportSubmissionsCsv(orgId, formId);

      // Verify formula cells are single-quote escaped
      expect(csv).toContain('"\'=CMD(""calc.exe"")"');
      expect(csv).toContain('"\'@SUM(A1:A10)"');
      expect(csv).toContain('"\'=CMD');
    });
  });
});
