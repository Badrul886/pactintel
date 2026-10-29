import { FormsService } from '../../src/modules/forms/forms.service';
import { FormsSubmissionService } from '../../src/modules/forms/forms-submission.service';
import { FormsRepository } from '../../src/modules/forms/forms.repository';
import { FormsRoutingService } from '../../src/modules/forms/forms-routing.service';
import { FormsMagicLinkService } from '../../src/modules/forms/forms-magic-link.service';
import { NotFoundException } from '@nestjs/common';

describe('Standalone Forms Lifecycle & Tenant Isolation (Sprint 3.11)', () => {
  let formsService: FormsService;
  let submissionService: FormsSubmissionService;
  let formsRepo: FormsRepository;

  // In-memory tenant data stores
  const dbForms = new Map<string, any>();
  const dbSubmissions = new Map<string, any>();
  const dbRoles = new Map<string, any>();
  const dbOutbox = new Map<string, any>();

  const mockPrisma: any = {
    $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    form: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: data.id,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        dbForms.set(record.id, record);
        return Promise.resolve(record);
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        const match = Array.from(dbForms.values()).find((f) => {
          if (where.id && f.id !== where.id) return false;
          if (where.organizationId && f.organizationId !== where.organizationId) return false;
          if (where.slug && f.slug !== where.slug) return false;
          if (where.deletedAt === null && f.deletedAt !== null) return false;
          return true;
        });
        return Promise.resolve(match ? { ...match, roles: [] } : null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const match = dbForms.get(where.id);
        return Promise.resolve(match ? { ...match, roles: [] } : null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const results = Array.from(dbForms.values()).filter((f) => {
          if (where.organizationId && f.organizationId !== where.organizationId) return false;
          if (where.deletedAt === null && f.deletedAt !== null) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = dbForms.get(where.id);
        if (!existing) throw new Error('Form not found');
        const updated = { ...existing, ...data, updatedAt: new Date() };
        dbForms.set(where.id, updated);
        return Promise.resolve(updated);
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
          if (where.formId && s.formId !== where.formId) return false;
          if (where.submitterEmail && s.submitterEmail !== where.submitterEmail) return false;
          return true;
        });
        return Promise.resolve(match || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        const results = Array.from(dbSubmissions.values()).filter((s) => {
          if (where.organizationId && s.organizationId !== where.organizationId) return false;
          if (where.formId && s.formId !== where.formId) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        const count = Array.from(dbSubmissions.values()).filter((s) => {
          if (where.formId && s.formId !== where.formId) return false;
          if (where.status && s.status !== where.status) return false;
          return true;
        }).length;
        return Promise.resolve(count);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const existing = dbSubmissions.get(where.id);
        if (!existing) throw new Error('Submission not found');
        const updated = { ...existing, ...data, updatedAt: new Date() };
        dbSubmissions.set(where.id, updated);
        return Promise.resolve(updated);
      }),
    },
    formRole: {
      create: jest.fn().mockImplementation(({ data }) => {
        dbRoles.set(data.id, data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    dbRoles.clear();
    dbOutbox.clear();

    formsRepo = new FormsRepository(mockPrisma);
    const mockMagicLinkService = new FormsMagicLinkService(formsRepo);
    const mockNotificationService: any = { notifyUser: jest.fn() };
    const routingService = new FormsRoutingService(
      formsRepo,
      mockMagicLinkService,
      mockNotificationService,
    );

    formsService = new FormsService(formsRepo);
    submissionService = new FormsSubmissionService(formsRepo, routingService, mockMagicLinkService);
  });

  describe('Full Form Lifecycle (Create -> Publish -> Submit -> Inbox -> Export CSV)', () => {
    it('executes full happy path cleanly within tenant boundaries', async () => {
      // 1. Create Form in Org A
      const form = await formsService.createForm(
        'org-a',
        'user-a',
        {
          name: 'Client Intake 2026',
          workspaceId: 'ws-a',
          definition: {
            sections: [
              {
                id: 'sec-1',
                title: 'General',
                fields: [
                  { id: 'f_name', label: 'Client Name', type: 'text', required: true },
                  { id: 'f_email', label: 'Work Email', type: 'email', required: true },
                ],
              },
            ],
          },
          settings: {
            oneResponsePerEmail: true,
          },
        },
        'ws-a',
      );

      expect(form).toBeDefined();
      expect(form?.status).toBe('draft');
      expect(form?.version).toBe(1);

      // 2. Publish Form
      const published = await formsService.publishForm('org-a', form!.id);
      expect(published.status).toBe('published');

      // 3. Submit Public Response
      const submitRes = await submissionService.submitForm({
        formId: form!.id,
        submitterIp: '203.0.113.10',
        submitterEmail: 'client@partner.com',
        rawAnswers: {
          f_name: 'Acme Partner',
          f_email: 'client@partner.com',
        },
      });

      expect(submitRes.status).toBe('complete');
      expect(submitRes.submissionId).toBeDefined();

      // 4. Verify in Submissions Inbox
      const inbox = await submissionService.listSubmissions('org-a', form!.id);
      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0].submitterEmail).toBe('client@partner.com');
      expect(inbox.items[0].status).toBe('complete');

      // 5. Export Submissions to CSV
      const csv = await submissionService.exportSubmissionsCsv('org-a', form!.id);
      expect(csv).toContain('Client Name');
      expect(csv).toContain('Acme Partner');
      expect(csv).toContain('client@partner.com');

      // 6. Soft Delete Form
      const deleted = await formsService.deleteForm('org-a', form!.id);
      expect(deleted.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('Tenant RLS Isolation', () => {
    it('prevents Org B from querying, accessing, or exporting Org A forms or submissions', async () => {
      // Create Form in Org A
      const formA = await formsService.createForm(
        'org-a',
        'user-a',
        { name: 'Confidential HR Form', workspaceId: 'ws-a' },
        'ws-a',
      );

      // Org B attempts to retrieve Org A form -> 404
      await expect(formsService.getForm('org-b', formA!.id)).rejects.toThrow(NotFoundException);

      // Org B attempts to export Org A submissions -> 404
      await expect(submissionService.exportSubmissionsCsv('org-b', formA!.id)).rejects.toThrow(
        NotFoundException,
      );

      // Org B listing forms returns empty page
      const orgBList = await formsService.listForms('org-b');
      expect(orgBList.items).toHaveLength(0);
    });
  });
});
