import { CpqService } from '../../src/modules/cpq/cpq.service';
import { CpqRepository } from '../../src/modules/cpq/cpq.repository';
import { DocumentService } from '../../src/modules/document/document.service';
import { AbilityFactory } from '../../src/modules/organization/casl/ability.factory';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Integration Test: Phase 3 Sprint 3.1 CPQ Full Suite', () => {
  let cpqService: CpqService;
  let mockCpqRepo: Partial<Record<keyof CpqRepository, jest.Mock>>;

  const orgA = '0192a000-0000-7000-8000-000000000001';
  const orgB = '0192a000-0000-7000-8000-000000000002';
  const workspaceA = '0192a000-0000-7000-8000-000000000003';
  const bundleA = '0192a000-0000-7000-8000-000000000004';
  const documentA = '0192a000-0000-7000-8000-000000000005';

  let inMemoryBundles: any[] = [];
  let inMemoryRules: any[] = [];

  beforeEach(() => {
    inMemoryBundles = [
      {
        id: bundleA,
        organizationId: orgA,
        workspaceId: workspaceA,
        name: 'Enterprise Security Bundle',
        bundleType: 'fixed',
        fixedPrice: 15000,
        discountPercent: null,
        isActive: true,
        version: 1,
        items: [],
      },
    ];

    inMemoryRules = [
      {
        id: 'rule-1',
        organizationId: orgA,
        workspaceId: workspaceA,
        name: 'Volume 15%',
        ruleType: 'volume_discount',
        conditions: { minQuantity: 10 },
        actions: { discountPercent: 15 },
        priority: 1,
        stackingMode: 'highest_wins',
        isActive: true,
      },
    ];

    mockCpqRepo = {
      createBundle: jest.fn().mockImplementation((orgId, dto) => {
        const b = {
          id: 'bundle-new',
          organizationId: orgId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          bundleType: dto.bundleType,
          fixedPrice: dto.fixedPrice,
          discountPercent: dto.discountPercent,
          isActive: true,
          version: 1,
          items: [],
        };
        inMemoryBundles.push(b);
        return Promise.resolve(b);
      }),
      findBundles: jest.fn().mockImplementation((orgId, _options) => {
        const filtered = inMemoryBundles.filter((b) => b.organizationId === orgId);
        return Promise.resolve({ items: filtered, nextCursor: null, hasMore: false });
      }),
      findBundleById: jest.fn().mockImplementation((id, orgId) => {
        const found = inMemoryBundles.find(
          (b) => b.id === id && (!orgId || b.organizationId === orgId),
        );
        return Promise.resolve(found || null);
      }),
      findPricingRules: jest.fn().mockImplementation((orgId, _options) => {
        const filtered = inMemoryRules.filter((r) => r.organizationId === orgId);
        return Promise.resolve(filtered);
      }),
    };

    cpqService = new CpqService(mockCpqRepo as unknown as CpqRepository);
  });

  describe('1. Role-Based Access Control on CPQ Operations (CASL Matrix)', () => {
    it('Admin role can manage Bundle (allowed)', () => {
      const ability = AbilityFactory.createForUser('admin', { id: 'admin-1' });
      expect(ability.can('create', 'Bundle')).toBe(true);
      expect(ability.can('manage', 'Bundle')).toBe(true);
    });

    it('Member role CANNOT create or manage Bundle (403 forbidden boundary)', () => {
      const ability = AbilityFactory.createForUser('member', { id: 'member-1' });
      expect(ability.can('create', 'Bundle')).toBe(false);
      expect(ability.can('manage', 'Bundle')).toBe(false);
      expect(ability.can('read', 'Bundle')).toBe(true); // Member can only read & use
      expect(ability.can('use', 'Bundle')).toBe(true);
    });

    it('Collaborator role CANNOT use or read Bundle', () => {
      const ability = AbilityFactory.createForUser('collaborator', { id: 'collab-1' });
      expect(ability.can('read', 'Bundle')).toBe(false);
      expect(ability.can('use', 'Bundle')).toBe(false);
    });
  });

  describe('2. Cross-Tenant RLS Isolation (Invariants I-02 & I-03)', () => {
    it('Org B cannot access or list bundles belonging to Org A', async () => {
      const resultOrgB = await cpqService.listBundles(orgB, {});
      expect(resultOrgB.items).toHaveLength(0);

      const resultOrgA = await cpqService.listBundles(orgA, {});
      expect(resultOrgA.items).toHaveLength(1);
      expect(resultOrgA.items[0].id).toBe(bundleA);
    });

    it('Org B querying bundle ID from Org A receives NotFoundException', async () => {
      await expect(cpqService.getBundle(bundleA, orgB)).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Pricing Rules Evaluation Integration', () => {
    it('Evaluates quote against active rules and returns financial breakdown', async () => {
      const result = await cpqService.evaluateRules(orgA, {
        lineItems: [
          {
            id: 'li-1',
            name: 'Cloud Compute Unit',
            quantity: 10,
            unitPrice: 200, // 10 * 200 = $2,000 subtotal
          },
        ],
        dealAttributes: {},
      });

      expect(result.totalBeforeDiscount).toBe('2000.00');
      // 15% volume discount applied -> $300 discount
      expect(result.discountAmount).toBe('300.00');
      expect(result.totalAfterDiscount).toBe('1700.00');
      expect(result.appliedRules).toHaveLength(1);
      expect(result.appliedRules[0].ruleName).toBe('Volume 15%');
    });
  });

  describe('4. CPQ Approval Threshold Gate on Document Send (Rule WF-003)', () => {
    let docService: DocumentService;
    let mockDocRepo: any;
    let mockOutbox: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockDocRepo = {
        findById: jest.fn().mockImplementation((orgId, docId) => {
          if (orgId === orgA && docId === documentA) {
            return Promise.resolve({
              id: documentA,
              organizationId: orgA,
              status: 'draft',
              slug: 'quote-doc-1',
              totalValue: '75000',
            });
          }
          return Promise.resolve(null);
        }),
      };
      mockOutbox = { emit: jest.fn().mockResolvedValue(undefined) };
      mockPrisma = {
        document: {
          findFirst: jest.fn().mockResolvedValue({
            id: documentA,
            organizationId: orgA,
            status: 'draft',
            slug: 'quote-doc-1',
            totalValue: '75000',
          }),
          update: jest.fn().mockResolvedValue({ id: documentA, status: 'sent' }),
        },
        subscription: {
          findUnique: jest.fn().mockResolvedValue({
            organizationId: orgA,
            documentLimit: null,
            documentsUsedThisPeriod: 0,
            planTier: 'enterprise',
          }),
        },
        approvalStep: {
          findFirst: jest.fn(),
        },
        $transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockPrisma);
        }),
      };

      docService = new DocumentService(mockDocRepo, mockOutbox, mockPrisma);
    });

    it('blocks document send when pending approval step exists on document', async () => {
      // Pending approval exists
      mockPrisma.approvalStep.findFirst.mockResolvedValue({
        id: 'step-1',
        documentId: documentA,
        organizationId: orgA,
        status: 'pending',
      });

      await expect(docService.sendDocument(orgA, documentA)).rejects.toThrow(ForbiddenException);
      await expect(docService.sendDocument(orgA, documentA)).rejects.toThrow(
        'Document send is blocked: pending approval steps must be decided before sending.',
      );

      // Verify document status was NOT transitioned to sent
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });

    it('allows document send when all approval steps have been approved', async () => {
      // No pending approvals
      mockPrisma.approvalStep.findFirst.mockResolvedValue(null);

      const result = await docService.sendDocument(orgA, documentA);

      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: documentA, organizationId: orgA },
        data: { status: 'sent' },
      });
      expect(result.status).toBe('sent');
      expect(mockOutbox.emit).toHaveBeenCalledWith(
        expect.anything(),
        orgA,
        'document.sent',
        documentA,
        expect.any(Object),
      );
    });
  });

  describe('5. CRM Embedded CPQ Endpoint', () => {
    it('returns available bundles, active rules count, and postMessage sync protocol', async () => {
      const embedData = await cpqService.getCrmEmbedData(orgA, workspaceA, { dealSize: 100000 });
      expect(embedData.organizationId).toBe(orgA);
      expect(embedData.embeddedSyncProtocol).toBe('postMessage');
      expect(embedData.availableBundles).toHaveLength(1);
      expect(embedData.supportedCrmTypes).toContain('hubspot');
      expect(embedData.supportedCrmTypes).toContain('salesforce');
    });
  });
});
