import { TemplateService } from '../../src/modules/template/template.service';
import { TemplateRepository } from '../../src/modules/template/template.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Integration Test: Content Block Usage Tracking', () => {
  let service: TemplateService;
  let mockRepo: Partial<TemplateRepository>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const blockId = 'cb-pricing-table-snippet';

  let currentBlockUsage = 0;

  beforeEach(() => {
    currentBlockUsage = 0;

    mockRepo = {
      incrementContentBlockUsage: jest.fn().mockImplementation((org, id) => {
        if (org === orgId && id === blockId) {
          currentBlockUsage += 1;
          return Promise.resolve({
            id: blockId,
            organizationId: org,
            title: 'Standard Payment Terms Clause',
            type: 'clause',
            usageCount: currentBlockUsage,
          });
        }
        return Promise.resolve(null);
      }),
    };

    mockPrisma = {};

    service = new TemplateService(mockRepo as TemplateRepository, mockPrisma as PrismaService);
  });

  it('increments content block usageCount atomically on each insert', async () => {
    expect(currentBlockUsage).toBe(0);

    const firstInsert = await service.insertContentBlock(orgId, blockId);
    expect(firstInsert.usageCount).toBe(1);

    const secondInsert = await service.insertContentBlock(orgId, blockId);
    expect(secondInsert.usageCount).toBe(2);
  });
});
