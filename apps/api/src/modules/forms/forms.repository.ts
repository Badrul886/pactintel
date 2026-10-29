import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId, buildCursorPage, decodeCursor } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import { FormRoleDefinition } from '@pactintel/shared-types';

export interface ListFormsOptions {
  workspaceId?: string;
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ListSubmissionsOptions {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class FormsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // 1. Form CRUD
  // ===========================================================================

  async createForm(params: {
    organizationId: string;
    workspaceId: string;
    createdBy: string;
    name: string;
    slug: string;
    definition: Record<string, unknown>;
    settings: Record<string, unknown>;
    customDomain?: string;
    roles?: FormRoleDefinition[];
  }) {
    const formId = generateId();
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          id: formId,
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          createdBy: params.createdBy,
          name: params.name,
          slug: params.slug,
          status: 'draft',
          definition: params.definition as Prisma.InputJsonValue,
          settings: params.settings as Prisma.InputJsonValue,
          version: 1,
          customDomain: params.customDomain ?? null,
        },
      });

      if (params.roles && params.roles.length > 0) {
        for (const role of params.roles) {
          await tx.formRole.create({
            data: {
              id: generateId(),
              organizationId: params.organizationId,
              formId,
              roleName: role.roleName,
              sortOrder: role.sortOrder,
              fields: role.fields as Prisma.InputJsonValue,
              routingEmail: role.routingEmail ?? null,
            },
          });
        }
      }

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: params.organizationId,
          eventType: 'form.created',
          aggregateType: 'form',
          aggregateId: form.id,
          payload: {
            formId: form.id,
            name: form.name,
            slug: form.slug,
            version: form.version,
            status: form.status,
          },
        },
      });

      return tx.form.findUnique({
        where: { id: formId },
        include: { roles: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async findFormById(organizationId: string, formId: string) {
    return this.prisma.form.findFirst({
      where: {
        id: formId,
        organizationId,
        deletedAt: null,
      },
      include: {
        roles: { orderBy: { sortOrder: 'asc' } },
        workspace: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async findFormBySlug(orgSlug: string, formSlug: string) {
    return this.prisma.form.findFirst({
      where: {
        slug: formSlug,
        deletedAt: null,
        organization: {
          slug: orgSlug,
          deletedAt: null,
        },
      },
      include: {
        roles: { orderBy: { sortOrder: 'asc' } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async findFormByOrgAndSlug(organizationId: string, slug: string) {
    return this.prisma.form.findFirst({
      where: {
        organizationId,
        slug,
        deletedAt: null,
      },
    });
  }

  async listForms(organizationId: string, options: ListFormsOptions = {}) {
    const { workspaceId, status, search, cursor, limit = 20 } = options;
    const decoded = decodeCursor(cursor);

    const forms = await this.prisma.form.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(workspaceId ? { workspaceId } : {}),
        ...(status ? { status } : {}),
        ...(search
          ? {
              name: { contains: search, mode: 'insensitive' as Prisma.QueryMode },
            }
          : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
      include: {
        roles: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { submissions: true } },
      },
    });

    return buildCursorPage(forms, limit);
  }

  async updateForm(
    organizationId: string,
    formId: string,
    data: {
      name?: string;
      workspaceId?: string;
      definition?: Record<string, unknown>;
      settings?: Record<string, unknown>;
      customDomain?: string | null;
      status?: string;
      version?: number;
      roles?: FormRoleDefinition[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.form.findFirst({
        where: { id: formId, organizationId, deletedAt: null },
      });

      if (!existing) {
        return null;
      }

      const updateData: Prisma.FormUpdateInput = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.workspaceId !== undefined) {
        updateData.workspace = { connect: { id: data.workspaceId } };
      }
      if (data.definition !== undefined) {
        updateData.definition = data.definition as Prisma.InputJsonValue;
      }
      if (data.settings !== undefined) {
        updateData.settings = data.settings as Prisma.InputJsonValue;
      }
      if (data.customDomain !== undefined) updateData.customDomain = data.customDomain;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.version !== undefined) updateData.version = data.version;

      const updated = await tx.form.update({
        where: { id: formId },
        data: updateData,
      });

      if (data.roles !== undefined) {
        // Replace roles atomically
        await tx.formRole.deleteMany({ where: { formId, organizationId } });
        for (const role of data.roles) {
          await tx.formRole.create({
            data: {
              id: generateId(),
              organizationId,
              formId,
              roleName: role.roleName,
              sortOrder: role.sortOrder,
              fields: role.fields as Prisma.InputJsonValue,
              routingEmail: role.routingEmail ?? null,
            },
          });
        }
      }

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'form.updated',
          aggregateType: 'form',
          aggregateId: formId,
          payload: {
            formId,
            version: updated.version,
            status: updated.status,
          },
        },
      });

      return tx.form.findUnique({
        where: { id: formId },
        include: { roles: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  async softDeleteForm(organizationId: string, formId: string) {
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.findFirst({
        where: { id: formId, organizationId, deletedAt: null },
      });

      if (!form) return null;

      const deleted = await tx.form.update({
        where: { id: formId },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'form.voided',
          aggregateType: 'form',
          aggregateId: formId,
          payload: { formId, reason: 'soft_delete' },
        },
      });

      return deleted;
    });
  }

  // ===========================================================================
  // 2. Form Submissions
  // ===========================================================================

  async createSubmission(params: {
    organizationId: string;
    formId: string;
    formVersion: number;
    submitterEmail?: string | null;
    submitterIp?: string | null;
    data: Record<string, unknown>;
    status: 'partial' | 'complete';
    currentRole?: string | null;
    submittedAt?: Date | null;
  }) {
    const submissionId = generateId();
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.create({
        data: {
          id: submissionId,
          organizationId: params.organizationId,
          formId: params.formId,
          formVersion: params.formVersion,
          submitterEmail: params.submitterEmail ? params.submitterEmail.toLowerCase().trim() : null,
          submitterIp: params.submitterIp ?? null,
          data: params.data as Prisma.InputJsonValue,
          status: params.status,
          currentRole: params.currentRole ?? null,
          submittedAt: params.submittedAt ?? (params.status === 'complete' ? new Date() : null),
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: params.organizationId,
          eventType: 'form.submitted',
          aggregateType: 'form_submission',
          aggregateId: submission.id,
          payload: {
            submissionId: submission.id,
            formId: params.formId,
            status: submission.status,
            submitterEmail: submission.submitterEmail,
          },
        },
      });

      if (params.status === 'complete') {
        await tx.outboxEvent.create({
          data: {
            id: generateId(),
            organizationId: params.organizationId,
            eventType: 'form.completed',
            aggregateType: 'form_submission',
            aggregateId: submission.id,
            payload: {
              submissionId: submission.id,
              formId: params.formId,
            },
          },
        });
      }

      return submission;
    });
  }

  async findSubmissionById(organizationId: string, formId: string, submissionId: string) {
    return this.prisma.formSubmission.findFirst({
      where: {
        id: submissionId,
        formId,
        organizationId,
      },
    });
  }

  async findSubmissionByEmail(formId: string, email: string) {
    const normalized = email.toLowerCase().trim();
    return this.prisma.formSubmission.findFirst({
      where: {
        formId,
        submitterEmail: normalized,
        status: { in: ['partial', 'complete'] },
      },
    });
  }

  async countCompletedSubmissions(formId: string): Promise<number> {
    return this.prisma.formSubmission.count({
      where: {
        formId,
        status: 'complete',
      },
    });
  }

  async listSubmissions(
    organizationId: string,
    formId: string,
    options: ListSubmissionsOptions = {},
  ) {
    const { status, search, cursor, limit = 20 } = options;
    const decoded = decodeCursor(cursor);

    const submissions = await this.prisma.formSubmission.findMany({
      where: {
        organizationId,
        formId,
        ...(status && status !== 'all' ? { status } : {}),
        ...(search
          ? {
              submitterEmail: { contains: search, mode: 'insensitive' as Prisma.QueryMode },
            }
          : {}),
        ...(decoded?.id ? { id: { gt: decoded.id } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });

    return buildCursorPage(submissions, limit);
  }

  async updateSubmission(
    organizationId: string,
    submissionId: string,
    data: {
      data?: Record<string, unknown>;
      status?: 'partial' | 'complete' | 'voided';
      currentRole?: string | null;
      submittedAt?: Date | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.FormSubmissionUpdateInput = {
        updatedAt: new Date(),
      };

      if (data.data !== undefined) {
        updateData.data = data.data as Prisma.InputJsonValue;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.currentRole !== undefined) {
        updateData.currentRole = data.currentRole;
      }
      if (data.submittedAt !== undefined) {
        updateData.submittedAt = data.submittedAt;
      }

      const updated = await tx.formSubmission.update({
        where: { id: submissionId },
        data: updateData,
      });

      if (data.status === 'complete') {
        await tx.outboxEvent.create({
          data: {
            id: generateId(),
            organizationId,
            eventType: 'form.completed',
            aggregateType: 'form_submission',
            aggregateId: submissionId,
            payload: {
              submissionId,
              formId: updated.formId,
            },
          },
        });
      }

      return updated;
    });
  }

  // ===========================================================================
  // 3. Form Magic Links
  // ===========================================================================

  async createMagicLink(params: {
    organizationId: string;
    formId: string;
    submissionId: string;
    roleName: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.formMagicLink.create({
      data: {
        id: generateId(),
        organizationId: params.organizationId,
        formId: params.formId,
        submissionId: params.submissionId,
        roleName: params.roleName,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
      },
    });
  }

  async findMagicLinkByHash(tokenHash: string) {
    return this.prisma.formMagicLink.findUnique({
      where: { tokenHash },
      include: {
        form: {
          include: {
            roles: { orderBy: { sortOrder: 'asc' } },
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
        submission: true,
      },
    });
  }

  async markMagicLinkUsed(id: string) {
    return this.prisma.formMagicLink.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async findRolesByFormId(organizationId: string, formId: string) {
    return this.prisma.formRole.findMany({
      where: { organizationId, formId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
