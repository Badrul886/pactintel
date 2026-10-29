import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CaslGuard, CheckPolicies } from '../../common/guards/casl.guard';
import { ClsService } from 'nestjs-cls';

@Controller('api/v1/api-keys')
@UseGuards(AuthGuard, CaslGuard)
export class ApiKeyController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly cls: ClsService,
  ) {}

  /**
   * List API keys for the current organization.
   * Never returns plaintext keys (RULE AUTH-002).
   */
  @Get()
  @CheckPolicies({ action: 'read', subject: 'Organization' })
  async listApiKeys() {
    const orgId = this.cls.get<string>('organizationId');
    return this.apiKeyService.listApiKeys(orgId);
  }

  /**
   * Create an API key.
   * Plaintext key is returned ONCE to the caller (RULE AUTH-002).
   */
  @Post()
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async createApiKey(
    @Body('name') name: string,
    @Body('scopes') scopes?: string[],
    @Body('expiresInDays') expiresInDays?: number,
    @Body('mfaVerified') mfaVerified?: boolean,
  ) {
    const orgId = this.cls.get<string>('organizationId');
    const userId = this.cls.get<string>('userId');

    // Admin MFA verification check per Sprint 3.12 DoD
    if (mfaVerified === false) {
      throw new ForbiddenException({
        code: 'MFA_REQUIRED',
        message: 'Admin multi-factor authentication is required to create an API key.',
      });
    }

    return this.apiKeyService.createApiKey(orgId, userId, name, scopes || ['*'], expiresInDays);
  }

  /**
   * Revoke an API key.
   */
  @Delete(':id')
  @CheckPolicies({ action: 'manage', subject: 'Organization' })
  async revokeApiKey(@Param('id') apiKeyId: string) {
    const orgId = this.cls.get<string>('organizationId');
    return this.apiKeyService.revokeApiKey(orgId, apiKeyId);
  }
}
