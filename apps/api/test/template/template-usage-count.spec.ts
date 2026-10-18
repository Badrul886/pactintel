import { TemplateService } from '../../src/modules/template/template.service';
import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Integration Test: Template Usage Count Tracking', () => {
  let service: TemplateService;
  let mockRepo: Partial<TemplateRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = 'user-owner-1';
  const templateId = 'tmpl-usage-test-123';

  let currentUsageCount = 0;

  beforeEach(() => {
    currentUsageCount = 0;

    mockRepo = {
      findById: jest.fn().mockImplementation((org, id) => {
        if (org === orgId && id === templateId) {
          return Promise.resolve({
            id: templateId,
            organizationId: orgId,
            workspaceId: 'ws-1',
            title: 'Pricing Proposal Template',
            content: { type: 'doc', content: [] },
            usageCount: currentUsageCount,
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      }),
    };

    const mockTx = {
      document: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
      documentVersion: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
      template: {
        update: jest.fn().mockImplementation(({ data }) => {
          if (data.usageCount?.increment) {
            currentUsageCount += data.usageCount.increment;
          }
          return Promise.resolve({ id: templateId, usageCount: currentUsageCount });
        }),
      },
      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    service = new TemplateService(mockRepo as TemplateRepository, mockPrisma as PrismaService);
  });

  it('increments usageCount by 1 each time a document is created from the template', async () => {
    expect(currentUsageCount).toBe(0);

    // Call 1
    await service.createDocumentFromTemplate(orgId, userId, templateId, {
      title: 'Doc Instance 1',
    });
    expect(currentUsageCount).toBe(1);

    // Call 2
    await service.createDocumentFromTemplate(orgId, userId, templateId, {
      title: 'Doc Instance 2',
    });
    expect(currentUsageCount).toBe(2);
  });
});
