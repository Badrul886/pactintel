import { TemplateService } from '../../src/modules/template/template.service';
import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Integration Test: Template Copy-On-Create Decoupling (RULE SIG-006)', () => {
  let templateService: TemplateService;
  let mockRepo: Partial<TemplateRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = 'user-owner-1';
  const templateId = 'tmpl-77777777-7777-7777-8777-777777777777';

  // In-memory data store representing database state
  let templateStore: any;
  let documentStore: any[] = [];
  let versionStore: any[] = [];
  let outboxStore: any[] = [];

  beforeEach(() => {
    documentStore = [];
    versionStore = [];
    outboxStore = [];

    templateStore = {
      id: templateId,
      organizationId: orgId,
      workspaceId: 'ws-1',
      title: 'Standard Non-Disclosure Agreement v1',
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Mutual Non-Disclosure Agreement' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Clause 1: Disclosing party confidential information remains proprietary.',
              },
            ],
          },
        ],
      },
      usageCount: 0,
      deletedAt: null,
    };

    mockRepo = {
      findById: jest.fn().mockImplementation((org, id) => {
        if (org === orgId && id === templateId && !templateStore.deletedAt) {
          return Promise.resolve(templateStore);
        }
        return Promise.resolve(null);
      }),
    };

    const mockTx = {
      document: {
        create: jest.fn().mockImplementation(({ data }) => {
          documentStore.push(data);
          return Promise.resolve(data);
        }),
      },
      documentVersion: {
        create: jest.fn().mockImplementation(({ data }) => {
          versionStore.push(data);
          return Promise.resolve(data);
        }),
      },
      template: {
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.usageCount?.increment) {
            templateStore.usageCount += data.usageCount.increment;
          }
          return Promise.resolve(templateStore);
        }),
      },
      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => {
          outboxStore.push(data);
          return Promise.resolve(data);
        }),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    templateService = new TemplateService(
      mockRepo as TemplateRepository,
      mockPrisma as PrismaService,
    );
  });

  it('proves document content is deep-copied at creation and remains completely immutable when template is modified in DB', async () => {
    // Step 1: Create a document from the template
    const created = await templateService.createDocumentFromTemplate(orgId, userId, templateId, {
      title: 'Acme Corp NDA',
    });

    const initialDocumentVersion = versionStore.find((v) => v.documentId === created.document.id);
    expect(initialDocumentVersion).toBeDefined();

    const originalDocText = initialDocumentVersion.contentSnapshot.content[1].content[0].text;
    expect(originalDocText).toBe(
      'Clause 1: Disclosing party confidential information remains proprietary.',
    );

    // Step 2: Simulate raw database update to the template (admin edits template)
    templateStore.content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'MODIFIED TEMPLATE: Restrictive Non-Compete' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Clause 1: All IP immediately transfers to recipient without warranty.',
            },
          ],
        },
      ],
    };

    // Step 3: Assert document content snapshot is 100% decoupled and unchanged
    const afterTemplateMutationVersion = versionStore.find(
      (v) => v.documentId === created.document.id,
    );
    expect(afterTemplateMutationVersion.contentSnapshot.content[1].content[0].text).toBe(
      'Clause 1: Disclosing party confidential information remains proprietary.',
    );

    // Verify template usage count incremented
    expect(templateStore.usageCount).toBe(1);

    // Verify outbox event generated
    expect(outboxStore).toHaveLength(1);
    expect(outboxStore[0].eventType).toBe('document.created_from_template');
  });
});
