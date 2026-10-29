import { Injectable, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { sha256 } from '@pactintel/shared-utils';
import { FormsRepository } from './forms.repository';

@Injectable()
export class FormsMagicLinkService {
  private readonly logger = new Logger(FormsMagicLinkService.name);
  private static readonly TTL_DAYS = 7;

  constructor(private readonly formsRepo: FormsRepository) {}

  /**
   * Generates a 32-byte CSPRNG token, persists its SHA-256 hash with 7-day TTL,
   * and returns the raw token to be delivered via email.
   */
  async createMagicLink(params: {
    organizationId: string;
    formId: string;
    submissionId: string;
    roleName: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + FormsMagicLinkService.TTL_DAYS);

    await this.formsRepo.createMagicLink({
      organizationId: params.organizationId,
      formId: params.formId,
      submissionId: params.submissionId,
      roleName: params.roleName,
      tokenHash,
      expiresAt,
    });

    this.logger.log(
      `Created magic link for submission ${params.submissionId}, role: ${params.roleName}`,
    );

    return { token: rawToken, expiresAt };
  }

  /**
   * Validates a raw magic link token against the database.
   * Throws 401 if expired or already used, 404 if not found.
   */
  async validateMagicLink(rawToken: string) {
    const tokenHash = sha256(rawToken);
    const magicLink = await this.formsRepo.findMagicLinkByHash(tokenHash);

    if (!magicLink) {
      throw new NotFoundException({
        code: 'TOKEN_NOT_FOUND',
        message: 'Magic link does not exist or is invalid.',
      });
    }

    const now = new Date();
    if (magicLink.expiresAt < now) {
      throw new UnauthorizedException({
        code: 'TOKEN_EXPIRED',
        message: 'Magic link has expired.',
      });
    }

    if (magicLink.usedAt !== null) {
      throw new UnauthorizedException({
        code: 'TOKEN_ALREADY_USED',
        message: 'Magic link has already been used.',
      });
    }

    return magicLink;
  }

  /**
   * Marks the magic link as used to prevent replay attacks.
   */
  async markUsed(id: string) {
    return this.formsRepo.markMagicLinkUsed(id);
  }
}
