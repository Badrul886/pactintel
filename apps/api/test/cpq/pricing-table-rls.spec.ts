import { CpqService } from '../../src/modules/cpq/cpq.service';
import { CatalogService } from '../../src/modules/cpq/catalog.service';
import { CpqRepository } from '../../src/modules/cpq/cpq.repository';
import { CatalogRepository } from '../../src/modules/cpq/catalog.repository';
import { NotFoundException } from '@nestjs/common';

describe('Integration Test: CPQ & Catalog Cross-Tenant RLS Isolation (Invariant I-02 & I-03)', () => {
  let cpqService: CpqService;
  let catalogService: CatalogService;
  let mockCpqRepo: Partial<CpqRepository>;
  let mockCatalogRepo: Partial<CatalogRepository>;

  const orgA = '11111111-1111-7111-8111-111111111111';
  const orgB = '22222222-2222-7222-8222-222222222222';

  // Simulating RLS-enforced PostgreSQL tables
  let pricingTablesDB: any[] = [];
  let lineItemsDB: any[] = [];
  let catalogDB: any[] = [];

  beforeEach(() => {
    pricingTablesDB = [
      {
        id: 'table-org-a',
        organizationId: orgA,
        documentId: 'doc-org-a',
        displayFormat: 'line_items',
        discountRules: [],
        taxConfig: { taxRate: 0, taxIncluded: false },
        settings: { currency: 'USD' },
        createdAt: new Date(),
        updatedAt: new Date(),
        lineItems: [
          {
            id: 'line-org-a',
            organizationId: orgA,
            pricingTableId: 'table-org-a',
            name: 'Confidential Enterprise Feature',
            quantity: 1,
            unitPrice: 5000,
            subtotal: 5000,
            isSelected: true,
          },
        ],
      },
    ];

    catalogDB = [
      {
        id: 'sku-org-a',
        organizationId: orgA,
        sku: 'CONF-SKU-001',
        name: 'Proprietary Algorithm License',
        unitPrice: 25000,
        currency: 'USD',
        billingFrequency: 'annual',
        isActive: true,
        deletedAt: null,
      },
    ];

    mockCpqRepo = {
      findPricingTableById: jest.fn().mockImplementation((id: string, orgId?: string) => {
        const item = pricingTablesDB.find((t) => t.id === id);
        if (!item) return Promise.resolve(null);
        if (orgId && item.organizationId !== orgId) {
          return Promise.resolve(null); // RLS block
        }
        return Promise.resolve(item);
      }),

      findPricingTablesByDocumentId: jest
        .fn()
        .mockImplementation((docId: string, orgId?: string) => {
          return Promise.resolve(
            pricingTablesDB.filter(
              (t) => t.documentId === docId && (!orgId || t.organizationId === orgId),
            ),
          );
        }),

      findLineItemById: jest.fn().mockImplementation((id: string, orgId?: string) => {
        const item = lineItemsDB.find((l) => l.id === id);
        if (!item) return Promise.resolve(null);
        if (orgId && item.organizationId !== orgId) {
          return Promise.resolve(null); // RLS block
        }
        return Promise.resolve(item);
      }),
    };

    mockCatalogRepo = {
      findById: jest.fn().mockImplementation((id: string, orgId?: string) => {
        const item = catalogDB.find((c) => c.id === id && !c.deletedAt);
        if (!item) return Promise.resolve(null);
        if (orgId && item.organizationId !== orgId) {
          return Promise.resolve(null); // RLS block
        }
        return Promise.resolve(item);
      }),

      findAll: jest.fn().mockImplementation((orgId: string) => {
        return Promise.resolve(catalogDB.filter((c) => c.organizationId === orgId && !c.deletedAt));
      }),
    };

    cpqService = new CpqService(mockCpqRepo as any);
    catalogService = new CatalogService(mockCatalogRepo as any);
  });

  it('Tenant B cannot read Tenant A pricing table (returns NotFoundException)', async () => {
    // Org A can access its own table
    const tableA = await cpqService.getPricingTableById('table-org-a', orgA);
    expect(tableA).toBeDefined();
    expect(tableA.id).toBe('table-org-a');

    // Org B attempting to access Org A table receives 404
    await expect(cpqService.getPricingTableById('table-org-a', orgB)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('Tenant B cannot read Tenant A product catalog items (RLS isolation)', async () => {
    // Org A accesses its catalog
    const catalogA = await catalogService.findAll(orgA);
    expect(catalogA).toHaveLength(1);
    expect(catalogA[0].sku).toBe('CONF-SKU-001');

    // Org B queries catalog -> receives 0 items
    const catalogB = await catalogService.findAll(orgB);
    expect(catalogB).toHaveLength(0);

    // Direct lookup of Org A item by Org B throws 404
    await expect(catalogService.findById('sku-org-a', orgB)).rejects.toThrow(NotFoundException);
  });
});
