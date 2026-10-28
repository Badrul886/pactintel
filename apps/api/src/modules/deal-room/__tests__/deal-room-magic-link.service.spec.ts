import { Test, TestingModule } from '@nestjs/testing';
import { DealRoomMagicLinkService } from '../deal-room-magic-link.service';
import { DealRoomRepository } from '../deal-room.repository';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('DealRoomMagicLinkService', () => {
  let service: DealRoomMagicLinkService;
  let repository: jest.Mocked<DealRoomRepository>;

  const mockOrgId = '00000000-0000-7000-8000-000000000001';
  const mockRoomId = '22222222-2222-7222-8222-222222222222';
  const mockMemberId = '33333333-3333-7333-8333-333333333333';

  beforeEach(async () => {
    const mockRepo = {
      findDealRoomById: jest.fn(),
      findMemberById: jest.fn(),
      createMagicLink: jest.fn(),
      findMagicLinkByHash: jest.fn(),
      recordMagicLinkUse: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealRoomMagicLinkService,
        {
          provide: DealRoomRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<DealRoomMagicLinkService>(DealRoomMagicLinkService);
    repository = module.get(DealRoomRepository);
  });

  describe('hashToken', () => {
    it('produces deterministic 64-char hex SHA-256 hash', () => {
      const raw = 'test-token-value';
      const expected = crypto.createHash('sha256').update(raw).digest('hex');
      expect(service.hashToken(raw)).toBe(expected);
      expect(service.hashToken(raw)).toHaveLength(64);
    });
  });

  describe('generateMagicLink', () => {
    it('generates a 32-byte hex token and stores only the SHA-256 hash at rest', async () => {
      repository.findDealRoomById.mockResolvedValueOnce({
        id: mockRoomId,
        slug: 'acme-corp-deal',
      } as any);

      repository.findMemberById.mockResolvedValueOnce({
        id: mockMemberId,
        externalEmail: 'buyer@acme.com',
      } as any);

      repository.createMagicLink.mockImplementationOnce(
        async (orgId, dealRoomId, memberId, tokenHash, expiresAt) =>
          ({
            id: 'link-1',
            dealRoomId,
            organizationId: orgId,
            memberId,
            tokenHash,
            expiresAt,
            usedAt: null,
            createdAt: new Date(),
          }) as any,
      );

      const link = await service.generateMagicLink(mockOrgId, mockRoomId, mockMemberId, {
        baseUrl: 'https://app.pactintel.com',
      });

      expect(link.rawToken).toHaveLength(64); // 32 bytes in hex = 64 hex chars
      expect(link.url).toBe(`https://app.pactintel.com/r/acme-corp-deal?token=${link.rawToken}`);

      // Verify the hash stored in DB matches the raw token
      const expectedHash = service.hashToken(link.rawToken);
      expect(repository.createMagicLink).toHaveBeenCalledWith(
        mockOrgId,
        mockRoomId,
        mockMemberId,
        expectedHash,
        expect.any(Date),
      );
    });
  });

  describe('verifyMagicLink', () => {
    it('verifies valid magic link and returns guest session context', async () => {
      const rawToken = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const tokenHash = service.hashToken(rawToken);

      repository.findMagicLinkByHash.mockResolvedValueOnce({
        id: 'link-1',
        dealRoomId: mockRoomId,
        organizationId: mockOrgId,
        memberId: mockMemberId,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000), // 1 day in future
        member: {
          id: mockMemberId,
          externalEmail: 'buyer@acme.com',
          externalName: 'Alice Buyer',
          role: 'viewer',
        },
        dealRoom: {
          id: mockRoomId,
          status: 'active',
          deletedAt: null,
        },
      } as any);

      const session = await service.verifyMagicLink(rawToken);

      expect(session.isExternalGuest).toBe(true);
      expect(session.dealRoomId).toBe(mockRoomId);
      expect(session.organizationId).toBe(mockOrgId);
      expect(session.email).toBe('buyer@acme.com');
      expect(session.name).toBe('Alice Buyer');
      expect(session.role).toBe('viewer');
      expect(repository.recordMagicLinkUse).toHaveBeenCalledWith('link-1');
    });

    it('rejects expired magic link with UnauthorizedException', async () => {
      const rawToken = 'expired-token';
      const tokenHash = service.hashToken(rawToken);

      repository.findMagicLinkByHash.mockResolvedValueOnce({
        id: 'link-1',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        dealRoom: { status: 'active', deletedAt: null },
      } as any);

      await expect(service.verifyMagicLink(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects invalid or unknown magic link token', async () => {
      repository.findMagicLinkByHash.mockResolvedValueOnce(null);

      await expect(service.verifyMagicLink('non-existent-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects access if deal room is archived or deleted', async () => {
      const rawToken = 'valid-token';
      const tokenHash = service.hashToken(rawToken);

      repository.findMagicLinkByHash.mockResolvedValueOnce({
        id: 'link-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
        dealRoom: { status: 'archived', deletedAt: new Date() },
      } as any);

      await expect(service.verifyMagicLink(rawToken)).rejects.toThrow(NotFoundException);
    });
  });
});
