import { FormsSubmissionService } from '../../src/modules/forms/forms-submission.service';
import { FormsRepository } from '../../src/modules/forms/forms.repository';
import { FormsRoutingService } from '../../src/modules/forms/forms-routing.service';
import { FormsMagicLinkService } from '../../src/modules/forms/forms-magic-link.service';
import { UnauthorizedException } from '@nestjs/common';

describe('Multi-Role Staged Routing & Magic Links (Sprint 3.11, EC-FORM-11, EC-FORM-12)', () => {
  let submissionService: FormsSubmissionService;
  let magicLinkService: FormsMagicLinkService;
  let formsRepo: FormsRepository;

  const dbForms = new Map<string, any>();
  const dbSubmissions = new Map<string, any>();
  const dbMagicLinks = new Map<string, any>();
  const dbOutbox = new Map<string, any>();

  const orgId = 'org-corp-uuid';
  const formId = 'form-hiring-uuid';

  const mockPrisma: any = {
    $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    form: {
      findFirst: jest.fn().mockImplementation(() => {
        const form = dbForms.get(formId);
        return Promise.resolve(form ? { ...form } : null);
      }),
      findUnique: jest.fn().mockImplementation(() => {
        const form = dbForms.get(formId);
        return Promise.resolve(form ? { ...form } : null);
      }),
    },
    formSubmission: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: data.id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        dbSubmissions.set(record.id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const match = Array.from(dbSubmissions.values()).find((s) => {
          if (where.id && s.id !== where.id) return false;
          if (where.organizationId && s.organizationId !== where.organizationId) return false;
          return true;
        });
        return Promise.resolve(match || null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = dbSubmissions.get(where.id);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        dbSubmissions.set(where.id, updated);
        return Promise.resolve(updated);
      }),
    },
    formMagicLink: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = { ...data, usedAt: null, createdAt: new Date() };
        dbMagicLinks.set(data.tokenHash, record);
        return Promise.resolve(record);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const record = dbMagicLinks.get(where.tokenHash);
        if (!record) return Promise.resolve(null);
        return Promise.resolve({
          ...record,
          form: dbForms.get(record.formId),
          submission: dbSubmissions.get(record.submissionId),
        });
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const match = Array.from(dbMagicLinks.values()).find((l) => l.id === where.id);
        if (match) {
          Object.assign(match, data);
          return Promise.resolve(match);
        }
        return Promise.resolve(null);
      }),
    },
    outboxEvent: {
      create: jest.fn().mockImplementation(({ data }) => {
        dbOutbox.set(data.id, data);
        return Promise.resolve(data);
      }),
    },
  };

  beforeEach(() => {
    dbForms.clear();
    dbSubmissions.clear();
    dbMagicLinks.clear();
    dbOutbox.clear();

    formsRepo = new FormsRepository(mockPrisma);
    magicLinkService = new FormsMagicLinkService(formsRepo);
    const mockNotificationService: any = { notifyUser: jest.fn() };
    const routingService = new FormsRoutingService(
      formsRepo,
      magicLinkService,
      mockNotificationService,
    );
    submissionService = new FormsSubmissionService(formsRepo, routingService, magicLinkService);

    // Seed 2-role hiring form
    dbForms.set(formId, {
      id: formId,
      organizationId: orgId,
      name: 'Engineering Job Application',
      slug: 'eng-job-app',
      status: 'published',
      version: 1,
      roles: [
        { roleName: 'Applicant', sortOrder: 0, fields: ['f_name', 'f_portfolio'] },
        {
          roleName: 'HiringManager',
          sortOrder: 1,
          fields: ['f_rating', 'f_decision'],
          routingEmail: 'lead@company.com',
        },
      ],
      definition: {
        sections: [
          {
            id: 'sec-1',
            title: 'Candidate',
            fields: [
              { id: 'f_name', label: 'Candidate Name', type: 'text', required: true },
              { id: 'f_portfolio', label: 'Portfolio Link', type: 'text' },
              { id: 'f_rating', label: 'Score (1-5)', type: 'number', min: 1, max: 5 },
              { id: 'f_decision', label: 'Decision', type: 'text' },
            ],
          },
        ],
      },
      settings: {},
    });
  });

  it('progresses from Role 0 to Role 1 via magic link and completes upon final submission', async () => {
    // 1. Candidate submits Role 0
    const submitResult = await submissionService.submitForm({
      formId,
      submitterIp: '198.51.100.5',
      submitterEmail: 'candidate@dev.io',
      rawAnswers: {
        f_name: 'Alice Dev',
        f_portfolio: 'https://alice.dev',
      },
    });

    expect(submitResult.status).toBe('partial');
    expect(submitResult.nextRole).toBe('HiringManager');

    // Verify submission is stored as partial
    const subRecord = dbSubmissions.get(submitResult.submissionId);
    expect(subRecord.status).toBe('partial');
    expect(subRecord.currentRole).toBe('HiringManager');
    expect(subRecord.data.f_name).toBe('Alice Dev');

    // Verify magic link was stored with SHA-256 hash
    expect(dbMagicLinks.size).toBe(1);
    const storedLink = Array.from(dbMagicLinks.values())[0];
    expect(storedLink.roleName).toBe('HiringManager');
    expect(storedLink.usedAt).toBeNull();
    expect(storedLink.tokenHash).toBeDefined();

    // Simulate Manager opening continuation via raw token
    // We create a known token to test continuation submission:
    const { token: managerToken } = await magicLinkService.createMagicLink({
      organizationId: orgId,
      formId,
      submissionId: submitResult.submissionId,
      roleName: 'HiringManager',
    });

    // 2. Manager fills Role 1 section via magic link
    const continueResult = await submissionService.submitContinued(managerToken, {
      f_rating: 5,
      f_decision: 'Hire immediately',
    });

    expect(continueResult.completed).toBe(true);
    expect(continueResult.message).toContain('complete');

    // Verify submission is now complete with all merged answers
    const finalSub = dbSubmissions.get(submitResult.submissionId);
    expect(finalSub.status).toBe('complete');
    expect(finalSub.currentRole).toBeNull();
    expect(finalSub.data.f_name).toBe('Alice Dev');
    expect(finalSub.data.f_rating).toBe(5);
    expect(finalSub.data.f_decision).toBe('Hire immediately');

    // 3. Replay attack: Manager attempts to submit again with same magic link -> 401 TOKEN_ALREADY_USED
    await expect(submissionService.submitContinued(managerToken, { f_rating: 1 })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
