import { Injectable, Logger, UnauthorizedException, Optional } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { SessionService, UserSessionData } from './session.service';
import { SamlSsoService } from './saml-sso.service';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeyService: ApiKeyService,
    private readonly sessionService: SessionService,
    @Optional() private readonly samlSsoService?: SamlSsoService,
  ) {}

  /**
   * Generates WorkOS AuthKit authorization redirect URL.
   */
  async getLoginUrl(redirectUri?: string): Promise<{ url: string }> {
    this.logger.log('Generating WorkOS AuthKit authorization redirect URL');
    const clientId = process.env.WORKOS_CLIENT_ID || 'client_pactintel_test';
    const redirect = encodeURIComponent(
      redirectUri || process.env.WORKOS_REDIRECT_URI || 'http://localhost:3000/callback',
    );
    return {
      url: `https://api.workos.com/user_management/authorize?client_id=${clientId}&redirect_uri=${redirect}&response_type=code`,
    };
  }

  /**
   * Exchanges authorization code for a session and provisions user/tenant if new.
   */
  async handleCallback(
    code: string,
    mockEmail?: string,
    authType: 'sso' | 'password' | 'oauth' = 'sso',
    targetOrganizationId?: string,
  ) {
    this.logger.log(
      `Processing Auth callback with authorization code: ${code.slice(0, 6)}... (authType: ${authType})`,
    );

    // In a live production environment, this calls WorkOS API:
    // const { user: workosUser } = await workos.userManagement.authenticateWithCode({ code, clientId });
    // In local dev/test or when mocking, extract email or use simulated user
    const email = mockEmail || `user-${code.slice(0, 8)}@pactintel.dev`;

    let user = await this.prisma.user.findFirst({
      where: { email },
      include: { organization: true },
    });

    if (user && this.samlSsoService) {
      // Enforce organization SSO login policy (optional, required, required_admin_bypass)
      await this.samlSsoService.validateSsoLoginPolicy(user.organizationId, authType, user.role);
    }

    if (!user && targetOrganizationId && this.samlSsoService) {
      // Just-In-Time provisioning into target enterprise organization
      const jitUser = await this.samlSsoService.provisionJitUser(targetOrganizationId, email);
      user = await this.prisma.user.findUnique({
        where: { id: jitUser.id },
        include: { organization: true },
      });
    }

    if (!user) {
      // Auto-provision initial organization and user on first login
      const orgId = generateId();
      const userId = generateId();
      const workspaceId = generateId();

      const domain = email.split('@')[1] || 'workspace';
      const orgSlug = `${domain.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${Date.now().toString(36)}`;

      await this.prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: orgId,
            name: `${domain.toUpperCase()} Team`,
            slug: orgSlug,
            cellId: process.env.CELL_ID || 'gcp-us1',
          },
        });

        await tx.workspace.create({
          data: {
            id: workspaceId,
            organizationId: orgId,
            name: 'General',
            slug: 'general',
            isDefault: true,
          },
        });

        user = await tx.user.create({
          data: {
            id: userId,
            organizationId: orgId,
            email,
            role: 'owner',
            seatType: 'full',
            status: 'active',
          },
          include: { organization: true },
        });

        await tx.workspaceMembership.create({
          data: {
            id: generateId(),
            userId,
            workspaceId,
            organizationId: orgId,
            role: 'admin',
          },
        });

        await tx.subscription.create({
          data: {
            id: generateId(),
            organizationId: orgId,
            planTier: 'free',
            status: 'active',
            fullSeatLimit: 1,
            fullSeatCount: 1,
            collabSeatLimit: 0,
            collabSeatCount: 0,
            documentLimit: 5,
          },
        });
      });
    }

    if (!user) {
      throw new UnauthorizedException('Failed to provision user session.');
    }

    // Create session in Redis
    const sessionId = await this.sessionService.createSession({
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    });

    return {
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    };
  }

  /**
   * Logs out user and destroys Redis session immediately (RULE AUTH-001).
   */
  async logout(sessionId: string): Promise<void> {
    this.logger.log(`Deleting session ${sessionId} immediately (RULE AUTH-001)`);
    await this.sessionService.destroySession(sessionId);
  }

  /**
   * Invalidate ALL user sessions on security events (RULE AUTH-001).
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    await this.sessionService.destroyAllUserSessions(userId);
  }

  /**
   * Validates active session.
   */
  async validateSession(sessionId: string): Promise<UserSessionData | null> {
    return this.sessionService.getSession(sessionId);
  }

  /**
   * Validates API Key.
   */
  async validateKey(key: string) {
    return this.apiKeyService.validateApiKey(key);
  }
}
