import { ApiKeyService } from '../../src/modules/auth/api-key.service';
import { ApiKeyController } from '../../src/modules/auth/api-key.controller';
import { ClsService } from 'nestjs-cls';
import { ForbiddenException } from '@nestjs/common';
import { sha256 } from '@pactintel/shared-utils';

describe('API Key Management & Developer Platform (Sprint 3.12)', () => {
  let service: ApiKeyService;
  let controller: ApiKeyController;
  let mockPrisma: any;
  let cls: jest.Mocked<ClsService>;

  const orgId = '01948df9-8123-7020-9bc1-df837261a9bc';
  const userId = '01948df9-8123-7020-9bc1-df837261a9bd';

  beforeEach(() => {
    mockPrisma = {
      apiKey: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            createdAt: new Date(),
          }),
        ),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'key_1',
            name: 'Production Server Key',
            keyPrefix: 'pi_live_9d8f37',
            scopes: ['read:documents'],
            lastUsedAt: null,
            createdAt: new Date(),
          },
        ]),
        update: jest
          .fn()
          .mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
      },
    };

    cls = {
      get: jest.fn((key: string) => (key === 'organizationId' ? orgId : userId)),
    } as any;

    service = new ApiKeyService(mockPrisma);
    controller = new ApiKeyController(service, cls);
  });

  it('creates API key, returns plaintext once, and stores SHA-256 hash (RULE AUTH-002)', async () => {
    const result = await service.createApiKey(orgId, userId, 'Test Key', ['read:documents']);

    expect(result.apiKey).toBeDefined();
    expect(result.apiKey.startsWith('pk_live_')).toBe(true);
    expect(result.prefix).toBe(result.apiKey.slice(0, 8));

    const storedHash = mockPrisma.apiKey.create.mock.calls[0][0].data.keyHash;
    expect(storedHash).toBe(sha256(result.apiKey));
  });

  it('validates active API key via SHA-256 index lookup', async () => {
    const plaintext = 'pi_live_secret_key_1234567890';
    const keyHash = sha256(plaintext);

    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_valid',
      organizationId: orgId,
      keyHash,
      revokedAt: null,
      expiresAt: null,
    });

    const key = await service.validateApiKey(plaintext);
    expect(key).toBeDefined();
    expect(key?.id).toBe('key_valid');
    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({ where: { keyHash } });
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key_valid' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects revoked or expired API keys', async () => {
    const plaintext = 'pi_live_expired_key';
    const keyHash = sha256(plaintext);

    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: 'key_expired',
      organizationId: orgId,
      keyHash,
      revokedAt: new Date(Date.now() - 3600000),
      expiresAt: null,
    });

    const key = await service.validateApiKey(plaintext);
    expect(key).toBeNull();
  });

  it('enforces admin MFA requirement on API key creation via controller', async () => {
    await expect(controller.createApiKey('Unauthorized Key', ['*'], 30, false)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lists API keys without returning plaintext key or hash', async () => {
    const keys = await controller.listApiKeys();
    expect(keys.length).toBe(1);
    expect((keys[0] as any).keyHash).toBeUndefined();
    expect((keys[0] as any).apiKey).toBeUndefined();
    expect(keys[0].keyPrefix).toBe('pi_live_9d8f37');
  });
});
