import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DealRoomRepository } from './deal-room.repository';
import { DealRoomMemberRole } from '@pactintel/shared-types';

export interface VerifiedGuestSession {
  dealRoomId: string;
  organizationId: string;
  memberId: string;
  email: string;
  name: string;
  role: DealRoomMemberRole;
  isExternalGuest: boolean;
  tokenHash: string;
}

@Injectable()
export class DealRoomMagicLinkService {
  constructor(private readonly repository: DealRoomRepository) {}

  /**
   * Hashes a raw CSPRNG token using SHA-256.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates a 32-byte cryptographically secure magic link for a member.
   * Only the SHA-256 hash is persisted at rest.
   */
  async generateMagicLink(
    orgId: string,
    dealRoomId: string,
    memberId: string,
    options?: {
      expiresInDays?: number;
      baseUrl?: string;
    },
  ) {
    const room = await this.repository.findDealRoomById(orgId, dealRoomId);
    if (!room) {
      throw new NotFoundException(`Deal room ${dealRoomId} not found`);
    }

    const member = await this.repository.findMemberById(orgId, dealRoomId, memberId);
    if (!member) {
      throw new NotFoundException(`Member ${memberId} not found in deal room`);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const days = options?.expiresInDays ?? 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const record = await this.repository.createMagicLink(
      orgId,
      dealRoomId,
      memberId,
      tokenHash,
      expiresAt,
    );

    const baseUrl = options?.baseUrl || process.env.APP_BASE_URL || 'http://localhost:3000';
    const linkUrl = `${baseUrl}/r/${room.slug}?token=${rawToken}`;

    return {
      id: record.id,
      memberId: record.memberId,
      expiresAt: record.expiresAt,
      rawToken,
      url: linkUrl,
    };
  }

  /**
   * Verifies an incoming magic link raw token and establishes a guest session.
   */
  async verifyMagicLink(rawToken: string): Promise<VerifiedGuestSession> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new BadRequestException('Magic link token is required');
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const link = await this.repository.findMagicLinkByHash(tokenHash);

    if (!link) {
      throw new UnauthorizedException('Invalid or revoked magic link');
    }

    if (link.expiresAt < new Date()) {
      throw new UnauthorizedException('Magic link has expired');
    }

    if (link.dealRoom.deletedAt || link.dealRoom.status === 'archived') {
      throw new NotFoundException('Deal room is archived or no longer available');
    }

    // Record use (timestamp)
    await this.repository.recordMagicLinkUse(link.id);

    return {
      dealRoomId: link.dealRoomId,
      organizationId: link.organizationId,
      memberId: link.memberId,
      email: link.member.externalEmail || '',
      name: link.member.externalName || link.member.externalEmail?.split('@')[0] || 'Guest',
      role: link.member.role as DealRoomMemberRole,
      isExternalGuest: true,
      tokenHash,
    };
  }
}
