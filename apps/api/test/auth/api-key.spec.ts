import { ApiKeyService } from '../../src/modules/auth/api-key.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256 } from '@pactintel/shared-utils';

describe('RULE AUTH-002: API Key Security and Validation', () => {
  let apiKeyService: ApiKeyService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      apiKey: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    apiKeyService = new ApiKeyService(mockPrisma as PrismaService);
  });

  it('returns plaintext key ONCE upon creation and stores only SHA-256 hash in DB', async () => {
    const orgId = '11111111-1111-7111-8111-111111111111';
    const userId = '22222222-2222-7222-8222-222222222222';

    mockPrisma.apiKey.create.mockImplementation(({ data }: any) => {
      return Promise.resolve({
        ...data,
        createdAt: new Date(),
      });
    });

    const result = await apiKeyService.createApiKey(orgId, userId, 'Test Key', ['documents:read']);

    expect(result.apiKey).toBeDefined();
    expect(result.apiKey.startsWith('pk_live_')).toBe(true);

    // Verify what was stored in the database
    expect(mockPrisma.apiKey.create).toHaveBeenCalled();
    const storedData = mockPrisma.apiKey.create.mock.calls[0][0].data;

    // RULE AUTH-002: Plaintext key MUST NOT be stored in the database!
    expect(storedData.keyHash).toEqual(sha256(result.apiKey));
    expect(storedData.keyHash).not.toEqual(result.apiKey);
    expect(storedData.keyPrefix).toEqual(result.apiKey.slice(0, 8));
  });

  it('validates active key via SHA-256 hash index lookup (D-13, X-21)', async () => {
    const plaintext = 'pk_live_1234567890abcdef1234567890abcdef12345678';
    const expectedHash = sha256(plaintext);

    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      keyHash: expectedHash,
      revokedAt: null,
      expiresAt: null,
    });
    mockPrisma.apiKey.update.mockResolvedValue({});

    const validated = await apiKeyService.validateApiKey(plaintext);

    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: expectedHash },
    });
    expect(validated).toBeDefined();
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects revoked or expired API keys', async () => {
    const plaintext = 'pk_live_1234567890abcdef1234567890abcdef12345678';

    // Revoked key
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-1',
      revokedAt: new Date(),
    });
    let result = await apiKeyService.validateApiKey(plaintext);
    expect(result).toBeNull();

    // Expired key
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: 'key-2',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 10000), // Past
    });
    result = await apiKeyService.validateApiKey(plaintext);
    expect(result).toBeNull();
  });
});
