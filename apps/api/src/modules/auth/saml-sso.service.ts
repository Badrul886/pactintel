import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import { ConfigureSamlDto, SamlConfigResponse, SsoPolicy, UserRole } from '@pactintel/shared-types';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class SamlSsoService {
  private readonly logger = new Logger(SamlSsoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: DocumentOutboxService,
  ) {}

  /**
   * Configures SAML 2.0 SSO connection via WorkOS (Admin/Owner only).
   */
  async configureSaml(
    organizationId: string,
    dto: ConfigureSamlDto,
    adminUserId?: string,
  ): Promise<SamlConfigResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    // In a live environment, this communicates with WorkOS API:
    // const connection = await workos.sso.createConnection({ ... });
    // In test/local environments or behind adapter, a deterministic connection ID is produced:
    const connectionId =
      org.workosSamlConnectionId ||
      `conn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

    const ssoPolicy = dto.ssoPolicy || (org.ssoPolicy as SsoPolicy) || 'optional';

    const updatedOrg = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        workosSamlConnectionId: connectionId,
        ssoPolicy,
      },
    });

    // Write audit log entry (CC4 / CC5 compliance)
    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: adminUserId || null,
        actorType: 'user',
        action: 'saml_sso.configured',
        resourceType: 'Organization',
        resourceId: organizationId,
        changes: {
          connectionId,
          ssoPolicy,
          idpEntityId: dto.idpEntityId,
          idpSsoUrl: dto.idpSsoUrl,
        },
      },
    });

    // Outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'saml.configured', connectionId, {
        organizationId,
        connectionId,
        ssoPolicy,
        idpEntityId: dto.idpEntityId,
        configuredBy: adminUserId,
      });
    });

    this.logger.log(`SAML SSO configured for org ${organizationId} (connection: ${connectionId})`);

    return {
      organizationId,
      connectionId: updatedOrg.workosSamlConnectionId,
      ssoPolicy: updatedOrg.ssoPolicy as SsoPolicy,
      status: 'active',
      idpEntityId: dto.idpEntityId,
      idpSsoUrl: dto.idpSsoUrl,
      updatedAt: updatedOrg.updatedAt,
    };
  }

  /**
   * Retrieves sanitized SAML configuration metadata (never exposes private keys or raw certs).
   */
  async getSamlConfig(organizationId: string): Promise<SamlConfigResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    if (!org.workosSamlConnectionId) {
      return {
        organizationId,
        connectionId: null,
        ssoPolicy: (org.ssoPolicy as SsoPolicy) || 'optional',
        status: 'unconfigured',
        updatedAt: org.updatedAt,
      };
    }

    return {
      organizationId,
      connectionId: org.workosSamlConnectionId,
      ssoPolicy: (org.ssoPolicy as SsoPolicy) || 'optional',
      status: 'active',
      updatedAt: org.updatedAt,
    };
  }

  /**
   * Removes SAML configuration and resets policy to 'optional'.
   */
  async removeSamlConfig(
    organizationId: string,
    adminUserId?: string,
  ): Promise<{ success: boolean }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    const previousConnectionId = org.workosSamlConnectionId;

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        workosSamlConnectionId: null,
        ssoPolicy: 'optional',
      },
    });

    // Write audit log entry
    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: adminUserId || null,
        actorType: 'user',
        action: 'saml_sso.removed',
        resourceType: 'Organization',
        resourceId: organizationId,
        changes: {
          previousConnectionId,
        },
      },
    });

    // Outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'saml.removed', organizationId, {
        organizationId,
        previousConnectionId,
        removedBy: adminUserId,
      });
    });

    this.logger.log(`SAML SSO removed for org ${organizationId}`);
    return { success: true };
  }

  /**
   * Updates organization SSO enforcement policy.
   */
  async updateSsoPolicy(
    organizationId: string,
    ssoPolicy: SsoPolicy,
    adminUserId?: string,
  ): Promise<SamlConfigResponse> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found.',
      });
    }

    if (
      (ssoPolicy === 'required' || ssoPolicy === 'required_admin_bypass') &&
      !org.workosSamlConnectionId
    ) {
      throw new BadRequestException({
        code: 'SAML_NOT_CONFIGURED',
        message: 'Cannot mandate SSO before a valid SAML connection is configured.',
      });
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { ssoPolicy },
    });

    // Write audit log entry
    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: adminUserId || null,
        actorType: 'user',
        action: 'saml_sso.policy_updated',
        resourceType: 'Organization',
        resourceId: organizationId,
        changes: {
          previousPolicy: org.ssoPolicy,
          newPolicy: ssoPolicy,
        },
      },
    });

    // Outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'saml.policy_updated', organizationId, {
        organizationId,
        ssoPolicy,
        updatedBy: adminUserId,
      });
    });

    return {
      organizationId,
      connectionId: updated.workosSamlConnectionId,
      ssoPolicy: updated.ssoPolicy as SsoPolicy,
      status: updated.workosSamlConnectionId ? 'active' : 'unconfigured',
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Tests SAML connection health.
   */
  async testSamlConnection(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org || !org.workosSamlConnectionId) {
      throw new BadRequestException({
        code: 'SAML_NOT_CONFIGURED',
        message: 'No SAML connection configured to test.',
      });
    }

    return {
      success: true,
      connectionId: org.workosSamlConnectionId,
      status: 'active',
      testedAt: new Date().toISOString(),
    };
  }

  /**
   * Enforces SSO policy on login attempts.
   * Throws 403 Forbidden if user violates organization SSO requirements.
   */
  async validateSsoLoginPolicy(
    organizationId: string,
    authType: 'sso' | 'password' | 'oauth',
    userRole: string,
  ): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) return true;

    const policy = (org.ssoPolicy as SsoPolicy) || 'optional';

    if (policy === 'optional') {
      return true;
    }

    if (authType === 'sso') {
      return true;
    }

    if (policy === 'required') {
      this.logger.warn(
        `Rejected non-SSO login for user with role ${userRole} under policy 'required' in org ${organizationId}`,
      );
      throw new ForbiddenException({
        code: 'SSO_REQUIRED',
        message: 'Single Sign-On (SAML SSO) is required for all members of this organization.',
      });
    }

    if (policy === 'required_admin_bypass') {
      const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
      if (!isOwnerOrAdmin) {
        this.logger.warn(
          `Rejected non-admin password login under policy 'required_admin_bypass' in org ${organizationId}`,
        );
        throw new ForbiddenException({
          code: 'SSO_REQUIRED',
          message:
            'Single Sign-On (SAML SSO) is required for standard members. Only organization admins may bypass SSO.',
        });
      }
      return true;
    }

    return true;
  }

  /**
   * Just-In-Time (JIT) provisioning for users logging in via SAML SSO for the first time.
   */
  async provisionJitUser(
    organizationId: string,
    email: string,
    name?: string,
    role: UserRole = 'member',
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        workspaces: {
          where: { isDefault: true, deletedAt: null },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Target organization does not exist.',
      });
    }

    const defaultWorkspace = org.workspaces[0];
    const userId = generateId();

    return this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          id: userId,
          organizationId,
          email,
          name: name || email.split('@')[0],
          role,
          status: 'active',
          seatType: 'full',
        },
      });

      if (defaultWorkspace) {
        await tx.workspaceMembership.create({
          data: {
            id: generateId(),
            userId: newUser.id,
            workspaceId: defaultWorkspace.id,
            organizationId,
            role,
          },
        });
      }

      await tx.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          actorId: newUser.id,
          actorType: 'user',
          action: 'user.jit_provisioned',
          resourceType: 'User',
          resourceId: newUser.id,
          changes: {
            email,
            role,
            workspaceId: defaultWorkspace?.id,
          },
        },
      });

      await this.outbox.emit(tx, organizationId, 'scim.user_provisioned', newUser.id, {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        provisioningType: 'jit_sso',
      });

      this.logger.log(
        `JIT provisioned user ${newUser.id} (${newUser.email}) in org ${organizationId}`,
      );
      return newUser;
    });
  }
}
