import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from './session.service';
import { DocumentOutboxService } from '../document/outbox/document-outbox.service';
import {
  ScimUserResource,
  ScimCreateUserDto,
  ScimPatchUserDto,
  ScimListResponse,
} from '@pactintel/shared-types';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class ScimService {
  private readonly logger = new Logger(ScimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly outbox: DocumentOutboxService,
  ) {}

  /**
   * Lists users in SCIM 2.0 format with RFC 7644 1-based pagination.
   */
  async listUsers(
    organizationId: string,
    startIndex: number = 1,
    count: number = 20,
    filter?: string,
  ): Promise<ScimListResponse<ScimUserResource>> {
    const skip = Math.max(0, startIndex - 1);
    const take = Math.min(100, Math.max(1, count));

    let emailFilter: string | undefined;
    if (filter) {
      // Basic RFC 7644 filter parsing: userName eq "user@example.com"
      const match = filter.match(/userName\s+eq\s+["']?([^"']+)["']?/i);
      if (match && match[1]) {
        emailFilter = match[1];
      }
    }

    const whereClause: any = {
      organizationId,
      deletedAt: null,
      ...(emailFilter ? { email: { equals: emailFilter, mode: 'insensitive' } } : {}),
    };

    const [totalResults, users] = await Promise.all([
      this.prisma.user.count({ where: whereClause }),
      this.prisma.user.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const resources = users.map((u) => this.mapToScimUser(u));

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults,
      itemsPerPage: resources.length,
      startIndex,
      Resources: resources,
    };
  }

  /**
   * Retrieves single user in SCIM 2.0 format.
   */
  async getUser(organizationId: string, userId: string): Promise<ScimUserResource> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: `User with id ${userId} not found in this organization.`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapToScimUser(user);
  }

  /**
   * Provisions a new user via SCIM 2.0.
   */
  async createUser(organizationId: string, dto: ScimCreateUserDto): Promise<ScimUserResource> {
    const email = dto.userName.toLowerCase().trim();

    // Check if user already exists in organization
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email, deletedAt: null },
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new HttpException(
          {
            schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
            scimType: 'uniqueness',
            detail: `User with userName ${email} already exists.`,
            status: '409',
          },
          HttpStatus.CONFLICT,
        );
      }

      // Reactivate previously deactivated user
      const reactivated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          name: dto.name?.formatted || dto.name?.givenName || existing.name,
        },
      });

      await this.prisma.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          actorId: existing.id,
          actorType: 'user',
          action: 'scim.user_reactivated',
          resourceType: 'User',
          resourceId: existing.id,
          changes: { email, source: 'scim_sync' },
        },
      });

      return this.mapToScimUser(reactivated);
    }

    // New user provisioning
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
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: 'Organization not found.',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const defaultWorkspace = org.workspaces[0];
    const userId = generateId();
    const name =
      dto.name?.formatted ||
      [dto.name?.givenName, dto.name?.familyName].filter(Boolean).join(' ') ||
      email.split('@')[0];

    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          organizationId,
          email,
          name,
          role: 'member',
          status: dto.active === false ? 'deactivated' : 'active',
          seatType: 'full',
        },
      });

      if (defaultWorkspace) {
        await tx.workspaceMembership.create({
          data: {
            id: generateId(),
            userId: user.id,
            workspaceId: defaultWorkspace.id,
            organizationId,
            role: 'member',
          },
        });
      }

      await tx.auditLogEntry.create({
        data: {
          id: generateId(),
          organizationId,
          actorId: user.id,
          actorType: 'user',
          action: 'scim.user_created',
          resourceType: 'User',
          resourceId: user.id,
          changes: { email, source: 'scim_sync' },
        },
      });

      await this.outbox.emit(tx, organizationId, 'scim.user_provisioned', user.id, {
        userId: user.id,
        email: user.email,
        active: user.status === 'active',
      });

      return user;
    });

    this.logger.log(
      `SCIM provisioned user ${newUser.id} (${newUser.email}) for org ${organizationId}`,
    );
    return this.mapToScimUser(newUser);
  }

  /**
   * Updates an existing user via SCIM 2.0 PUT.
   */
  async updateUser(
    organizationId: string,
    userId: string,
    dto: ScimCreateUserDto,
  ): Promise<ScimUserResource> {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: `User with id ${userId} not found.`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.active === false && existing.status !== 'deactivated') {
      await this.deprovisionUser(organizationId, userId);
      const deactivated = await this.prisma.user.findUnique({ where: { id: userId } });
      return this.mapToScimUser(deactivated!);
    }

    const name =
      dto.name?.formatted ||
      [dto.name?.givenName, dto.name?.familyName].filter(Boolean).join(' ') ||
      existing.name;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        status: dto.active === false ? 'deactivated' : 'active',
      },
    });

    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: userId,
        actorType: 'user',
        action: 'scim.user_updated',
        resourceType: 'User',
        resourceId: userId,
        changes: { name, active: updated.status === 'active' },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'scim.user_updated', userId, {
        userId,
        active: updated.status === 'active',
      });
    });

    return this.mapToScimUser(updated);
  }

  /**
   * Partial update via SCIM 2.0 PATCH (RFC 7644 Section 3.5.2).
   */
  async patchUser(
    organizationId: string,
    userId: string,
    dto: ScimPatchUserDto,
  ): Promise<ScimUserResource> {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: `User with id ${userId} not found.`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    let shouldDeactivate = false;
    let shouldActivate = false;
    let newName: string | undefined;

    for (const op of dto.Operations) {
      const path = (op.path || '').toLowerCase();
      const val = op.value;

      if (path === 'active' || path === '') {
        const activeBool = typeof val === 'boolean' ? val : val?.active;
        if (activeBool === false || activeBool === 'false') {
          shouldDeactivate = true;
        } else if (activeBool === true || activeBool === 'true') {
          shouldActivate = true;
        }
      }

      if (path === 'name.formatted' || path === 'name') {
        newName = typeof val === 'string' ? val : val?.formatted;
      }
    }

    if (shouldDeactivate) {
      await this.deprovisionUser(organizationId, userId);
      const deactivated = await this.prisma.user.findUnique({ where: { id: userId } });
      return this.mapToScimUser(deactivated!);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(shouldActivate ? { status: 'active' } : {}),
        ...(newName ? { name: newName } : {}),
      },
    });

    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: userId,
        actorType: 'user',
        action: 'scim.user_patched',
        resourceType: 'User',
        resourceId: userId,
        changes: { operations: dto.Operations },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'scim.user_updated', userId, {
        userId,
        patchOperations: dto.Operations,
      });
    });

    return this.mapToScimUser(updated);
  }

  /**
   * Deprovisions user via SCIM DELETE (RFC 7644).
   * Soft-deactivates, destroys all sessions immediately (RULE AUTH-001), preserves all audit/contracts.
   */
  async deprovisionUser(organizationId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
    });

    if (!user) {
      throw new HttpException(
        {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '404',
          detail: `User with id ${userId} not found.`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 1. Soft-deactivate user status (do NOT delete historical contract/audit data)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'deactivated',
      },
    });

    // 2. RULE AUTH-001: Immediately destroy all active Redis sessions
    await this.sessionService.destroyAllUserSessions(userId);

    // 3. Write append-only audit log entry
    await this.prisma.auditLogEntry.create({
      data: {
        id: generateId(),
        organizationId,
        actorId: userId,
        actorType: 'user',
        action: 'scim.user_deactivated',
        resourceType: 'User',
        resourceId: userId,
        changes: {
          email: user.email,
          previousStatus: user.status,
          source: 'scim_deprovisioning',
        },
      },
    });

    // 4. Emit transactional outbox event (Invariant I-06)
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx, organizationId, 'scim.user_deactivated', userId, {
        userId,
        email: user.email,
        organizationId,
      });
    });

    this.logger.log(`SCIM deprovisioned user ${userId} (${user.email}) for org ${organizationId}`);
  }

  /**
   * Transforms internal User entity to RFC 7643 SCIM User representation.
   */
  private mapToScimUser(user: any): ScimUserResource {
    const parts = (user.name || '').split(' ');
    const givenName = parts[0] || '';
    const familyName = parts.slice(1).join(' ') || '';

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      userName: user.email,
      name: {
        formatted: user.name || user.email,
        givenName,
        familyName,
      },
      emails: [
        {
          value: user.email,
          type: 'work',
          primary: true,
        },
      ],
      active: user.status === 'active',
      roles: [user.role],
      meta: {
        resourceType: 'User',
        created: user.createdAt,
        lastModified: user.updatedAt,
      },
    };
  }
}
