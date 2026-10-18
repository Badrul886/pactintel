import { tenantIsolationHook } from '../../src/prisma/prisma-tenant.extension';
import { ClsService } from 'nestjs-cls';

describe('RULE MT-002: Tenant Context Enforcement', () => {
  let mockCls: Partial<ClsService>;

  beforeEach(() => {
    mockCls = {
      get: jest.fn(),
    };
  });

  it('strictly throws TenantContextError if organizationId is missing on tenant-scoped operations', async () => {
    (mockCls.get as jest.Mock).mockReturnValue(undefined);

    await expect(
      tenantIsolationHook(
        mockCls as ClsService,
        'Document',
        'findMany',
        {},
        jest.fn().mockResolvedValue([]),
      ),
    ).rejects.toThrow(
      "TenantContextError (RULE MT-002): An active organizationId is strictly required in ClsContext for operation on 'Document'.",
    );
  });

  it('allows operations on root Organization entity when organizationId is null (e.g. initial onboarding)', async () => {
    (mockCls.get as jest.Mock).mockReturnValue(undefined);

    const mockQuery = jest.fn().mockResolvedValue({ id: 'new-org', name: 'Acme Corp' });

    const result = await tenantIsolationHook(
      mockCls as ClsService,
      'Organization',
      'create',
      { data: { name: 'Acme Corp' } },
      mockQuery,
    );

    expect(result).toEqual({ id: 'new-org', name: 'Acme Corp' });
    expect(mockQuery).toHaveBeenCalled();
  });

  it('proceeds with query when active organizationId is present in CLS context', async () => {
    const orgId = '11111111-1111-7111-8111-111111111111';
    (mockCls.get as jest.Mock).mockReturnValue(orgId);

    const mockQuery = jest.fn().mockResolvedValue([{ id: 'doc-1', title: 'Proposal' }]);

    const result = await tenantIsolationHook(
      mockCls as ClsService,
      'Document',
      'findMany',
      {},
      mockQuery,
    );

    expect(result).toEqual([{ id: 'doc-1', title: 'Proposal' }]);
    expect(mockQuery).toHaveBeenCalled();
  });
});
