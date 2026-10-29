import { FormsMagicLinkService } from '../forms-magic-link.service';
import { FormsRepository } from '../forms.repository';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { sha256 } from '@pactintel/shared-utils';

describe('FormsMagicLinkService Unit Tests (Sprint 3.11, EC-FORM-12)', () => {
  let service: FormsMagicLinkService;
  let mockRepo: jest.Mocked<FormsRepository>;

  const orgId = 'org-uuid-1';
  const formId = 'form-uuid-1';
  const submissionId = 'sub-uuid-1';
  const roleName = 'Manager';

  beforeEach(() => {
    mockRepo = {
      createMagicLink: jest.fn(),
      findMagicLinkByHash: jest.fn(),
      markMagicLinkUsed: jest.fn(),
    } as unknown as jest.Mocked<FormsRepository>;

    service = new FormsMagicLinkService(mockRepo);
  });

  it('generates 32-byte hex token and persists SHA-256 hash with 7-day TTL', async () => {
    mockRepo.createMagicLink.mockResolvedValue({ id: 'link-1' } as any);

    const { token, expiresAt } = await service.createMagicLink({
      organizationId: orgId,
      formId,
      submissionId,
      roleName,
    });

    expect(token).toHaveLength(64); // 32 bytes in hex = 64 chars
    expect(mockRepo.createMagicLink).toHaveBeenCalledWith({
      organizationId: orgId,
      formId,
      submissionId,
      roleName,
      tokenHash: sha256(token),
      expiresAt: expect.any(Date),
    });

    // Check ~7 days in future
    const diffDays = (expiresAt.getTime() - Date.now()) / (1000 * 3600 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it('validates active token successfully', async () => {
    const rawToken = 'a'.repeat(64);
    const tokenHash = sha256(rawToken);
    const futureDate = new Date(Date.now() + 86400000);

    mockRepo.findMagicLinkByHash.mockResolvedValue({
      id: 'link-1',
      tokenHash,
      expiresAt: futureDate,
      usedAt: null,
      roleName,
    } as any);

    const result = await service.validateMagicLink(rawToken);
    expect(result.id).toBe('link-1');
    expect(mockRepo.findMagicLinkByHash).toHaveBeenCalledWith(tokenHash);
  });

  it('throws NotFoundException for nonexistent token', async () => {
    mockRepo.findMagicLinkByHash.mockResolvedValue(null);
    await expect(service.validateMagicLink('invalid-token')).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException (TOKEN_EXPIRED) if token is expired', async () => {
    const rawToken = 'b'.repeat(64);
    const pastDate = new Date(Date.now() - 3600000); // 1 hour ago

    mockRepo.findMagicLinkByHash.mockResolvedValue({
      id: 'link-2',
      tokenHash: sha256(rawToken),
      expiresAt: pastDate,
      usedAt: null,
    } as any);

    await expect(service.validateMagicLink(rawToken)).rejects.toThrow(UnauthorizedException);
    try {
      await service.validateMagicLink(rawToken);
    } catch (err: any) {
      expect(err.response.code).toBe('TOKEN_EXPIRED');
    }
  });

  it('throws UnauthorizedException (TOKEN_ALREADY_USED) if token was already used', async () => {
    const rawToken = 'c'.repeat(64);
    const futureDate = new Date(Date.now() + 86400000);

    mockRepo.findMagicLinkByHash.mockResolvedValue({
      id: 'link-3',
      tokenHash: sha256(rawToken),
      expiresAt: futureDate,
      usedAt: new Date(Date.now() - 60000), // already used
    } as any);

    await expect(service.validateMagicLink(rawToken)).rejects.toThrow(UnauthorizedException);
    try {
      await service.validateMagicLink(rawToken);
    } catch (err: any) {
      expect(err.response.code).toBe('TOKEN_ALREADY_USED');
    }
  });

  it('marks magic link as used', async () => {
    mockRepo.markMagicLinkUsed.mockResolvedValue({ id: 'link-1', usedAt: new Date() } as any);
    await service.markUsed('link-1');
    expect(mockRepo.markMagicLinkUsed).toHaveBeenCalledWith('link-1');
  });
});
