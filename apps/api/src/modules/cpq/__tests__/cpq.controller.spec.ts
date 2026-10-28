import { CpqController } from '../cpq.controller';
import { CpqService } from '../cpq.service';

describe('CpqController', () => {
  let controller: CpqController;
  let mockService: jest.Mocked<CpqService>;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const req = { user: { organizationId: orgId, id: 'user-1' } };

  beforeEach(() => {
    mockService = {
      createPricingTable: jest.fn(),
      getPricingTablesByDocument: jest.fn(),
      getPricingTableById: jest.fn(),
      updatePricingTable: jest.fn(),
      deletePricingTable: jest.fn(),
      addLineItem: jest.fn(),
      getLineItems: jest.fn(),
      updateLineItem: jest.fn(),
      deleteLineItem: jest.fn(),
      reorderLineItems: jest.fn(),
      updateBuyerSelections: jest.fn(),
      getTableTotals: jest.fn(),
      createBundle: jest.fn().mockResolvedValue({ id: 'bundle-1', name: 'Starter' } as any),
      listBundles: jest
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null, hasMore: false } as any),
      getBundle: jest.fn().mockResolvedValue({ id: 'bundle-1', name: 'Starter' } as any),
      updateBundle: jest.fn().mockResolvedValue({ id: 'bundle-1', version: 2 } as any),
      deleteBundle: jest.fn().mockResolvedValue({ success: true } as any),
      addBundleItem: jest.fn().mockResolvedValue({ id: 'bi-1' } as any),
      updateBundleItem: jest.fn().mockResolvedValue({ id: 'bi-1', quantity: 2 } as any),
      deleteBundleItem: jest.fn().mockResolvedValue({ success: true } as any),
      createPricingRule: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Volume' } as any),
      listPricingRules: jest.fn().mockResolvedValue([] as any),
      getPricingRule: jest.fn().mockResolvedValue({ id: 'rule-1' } as any),
      updatePricingRule: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Updated' } as any),
      deletePricingRule: jest.fn().mockResolvedValue({ success: true } as any),
      evaluateRules: jest.fn().mockResolvedValue({
        appliedRules: [],
        finalLineItems: [],
        totalBeforeDiscount: '1000.00',
        totalAfterDiscount: '900.00',
        discountAmount: '100.00',
        requiresApproval: false,
        approvalReasons: [],
      } as any),
      createPlaybook: jest.fn().mockResolvedValue({ id: 'pb-1', name: 'Playbook 1' } as any),
      listPlaybooks: jest.fn().mockResolvedValue([] as any),
      getPlaybook: jest.fn().mockResolvedValue({ id: 'pb-1' } as any),
      updatePlaybook: jest.fn().mockResolvedValue({ id: 'pb-1' } as any),
      deletePlaybook: jest.fn().mockResolvedValue({ success: true } as any),
      executePlaybook: jest.fn().mockResolvedValue({
        playbookId: 'pb-1',
        eligibleCatalogItems: [],
        recommendedBundles: [],
      } as any),
      getCrmEmbedData: jest.fn().mockResolvedValue({
        organizationId: orgId,
        availableBundles: [],
        embeddedSyncProtocol: 'postMessage',
      } as any),
    } as any;

    controller = new CpqController(mockService);
  });

  it('1. createBundle delegates to service with orgId', async () => {
    const body: any = {
      workspaceId: '11111111-1111-7111-8111-222222222222',
      name: 'Starter',
      bundleType: 'fixed',
      fixedPrice: 1000,
      items: [],
    };
    const res = await controller.createBundle(req, body);
    expect(mockService.createBundle).toHaveBeenCalledWith(orgId, body);
    expect(res.id).toBe('bundle-1');
  });

  it('2. listBundles delegates to service with query params', async () => {
    await controller.listBundles(req, 'ws-1', 'search-term', 'cur-1', '10');
    expect(mockService.listBundles).toHaveBeenCalledWith(orgId, {
      workspaceId: 'ws-1',
      search: 'search-term',
      cursor: 'cur-1',
      limit: 10,
    });
  });

  it('3. evaluateRules evaluates quote and returns financial breakdown', async () => {
    const body: any = {
      lineItems: [{ id: 'li-1', name: 'Item', quantity: 1, unitPrice: 1000 }],
      dealAttributes: {},
    };
    const res = await controller.evaluateRules(req, body, 'ws-1');
    expect(mockService.evaluateRules).toHaveBeenCalledWith(orgId, body, 'ws-1');
    expect(res.totalAfterDiscount).toBe('900.00');
  });

  it('4. executePlaybook calls service executePlaybook', async () => {
    const res = await controller.executePlaybook(req, 'pb-1', {
      dealAttributes: { industry: 'tech' },
    });
    expect(mockService.executePlaybook).toHaveBeenCalledWith(orgId, 'pb-1', {
      dealAttributes: { industry: 'tech' },
    });
    expect(res.playbookId).toBe('pb-1');
  });

  it('5. getCrmEmbedData parses dealAttributes JSON and calls service', async () => {
    const res = await controller.getCrmEmbedData(req, 'ws-1', '{"dealSize":50000}');
    expect(mockService.getCrmEmbedData).toHaveBeenCalledWith(orgId, 'ws-1', { dealSize: 50000 });
    expect(res.embeddedSyncProtocol).toBe('postMessage');
  });
});
