import { BrandKitService } from '../brand-kit.service';
import { BrandKitRepository } from '../brand-kit.repository';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('BrandKit Module & Transactional Defaults (Sprint 3.3)', () => {
  let service: BrandKitService;
  let repository: BrandKitRepository;

  const mockOrgId = '11111111-1111-7111-8111-111111111111';

  let mockKits: any[] = [];

  beforeEach(() => {
    mockKits = [
      {
        id: 'bk-1',
        organizationId: mockOrgId,
        name: 'Default Corporate Brand Kit',
        primaryColor: '#2563EB',
        isDefault: true,
        removeBadge: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      {
        id: 'bk-2',
        organizationId: mockOrgId,
        name: 'Secondary Brand Kit',
        primaryColor: '#10B981',
        isDefault: false,
        removeBadge: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    repository = new BrandKitRepository();

    jest.spyOn(repository, 'findById').mockImplementation(async (...args: unknown[]) => {
      const id = args[0] as string;
      const orgId = args[1] as string | undefined;
      return (
        mockKits.find(
          (k) => k.id === id && (!orgId || k.organizationId === orgId) && !k.deletedAt,
        ) || null
      );
    });

    jest.spyOn(repository, 'setDefault').mockImplementation(async (...args: unknown[]) => {
      const id = args[0] as string;
      const orgId = args[1] as string;
      const target = mockKits.find((k) => k.id === id && k.organizationId === orgId);
      if (!target) throw new NotFoundException();

      // Transactional effect: unsets previous default, sets target to true
      mockKits.forEach((k) => {
        if (k.organizationId === orgId) {
          k.isDefault = k.id === id;
        }
      });
      return target;
    });

    jest.spyOn(repository, 'delete').mockImplementation(async (...args: unknown[]) => {
      const id = args[0] as string;
      const orgId = args[1] as string;
      const target = mockKits.find((k) => k.id === id && k.organizationId === orgId);
      if (!target) throw new NotFoundException();
      target.deletedAt = new Date();
      return target;
    });

    service = new BrandKitService(repository);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should unset old default brand kit when a new default is set in the same transaction', async () => {
    // Initial state: bk-1 is default, bk-2 is not
    expect(mockKits.find((k) => k.id === 'bk-1').isDefault).toBe(true);
    expect(mockKits.find((k) => k.id === 'bk-2').isDefault).toBe(false);

    // Set bk-2 as default
    await service.setDefault('bk-2', mockOrgId);

    // Verify transactional update
    expect(mockKits.find((k) => k.id === 'bk-1').isDefault).toBe(false);
    expect(mockKits.find((k) => k.id === 'bk-2').isDefault).toBe(true);
  });

  it('should refuse to delete the default brand kit with 409 Conflict', async () => {
    // Attempt to delete bk-1 (which isDefault = true)
    await expect(service.delete('bk-1', mockOrgId)).rejects.toThrow(ConflictException);

    // Verify bk-1 was NOT deleted
    expect(mockKits.find((k) => k.id === 'bk-1').deletedAt).toBeNull();
  });

  it('should successfully delete non-default brand kit', async () => {
    // Delete bk-2 (which isDefault = false)
    const result = await service.delete('bk-2', mockOrgId);
    expect(result.deletedAt).toBeDefined();
    expect(mockKits.find((k) => k.id === 'bk-2').deletedAt).not.toBeNull();
  });

  it('should upload and store Cloud Storage public-media logo URL', async () => {
    jest.spyOn(repository, 'updateLogoUrl').mockImplementation(async (...args: unknown[]) => {
      const id = args[0] as string;
      const orgId = args[1] as string;
      const url = args[2] as string;
      const target = mockKits.find((k) => k.id === id && k.organizationId === orgId);
      target.logoUrl = url;
      return target;
    });

    const updated = await service.uploadLogo(
      'bk-1',
      mockOrgId,
      'acme-logo.svg',
      Buffer.from('<svg></svg>'),
    );

    expect(updated.logoUrl).toContain(
      'https://storage.googleapis.com/pactintel-prod-public-media/brand-kits/bk-1/acme-logo.svg',
    );
  });
});
