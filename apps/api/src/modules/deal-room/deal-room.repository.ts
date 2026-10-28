import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import {
  DealRoomMemberRole,
  DealRoomStatus,
  DealRoomMessageVisibility,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

@Injectable()
export class DealRoomRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════
  // 1. DEAL ROOMS (CRUD & QUERIES)
  // ═══════════════════════════════════════════════════════════════════════

  async createDealRoom(
    orgId: string,
    createdBy: string,
    creatorName: string,
    creatorEmail: string,
    data: {
      workspaceId: string;
      title: string;
      slug: string;
      brandKitId?: string | null;
      mutualActionPlan?: MutualActionPlanMilestone[];
      initialDocumentId?: string;
    },
  ) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.dealRoom.create({
        data: {
          id,
          organizationId: orgId,
          workspaceId: data.workspaceId,
          title: data.title,
          slug: data.slug,
          brandKitId: data.brandKitId || null,
          mutualActionPlan: (data.mutualActionPlan || []) as unknown as Prisma.InputJsonValue,
          status: 'active',
        },
      });

      // Automatically add creator as owner member
      await tx.dealRoomMember.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          dealRoomId: id,
          userId: createdBy,
          externalEmail: creatorEmail,
          externalName: creatorName,
          role: 'owner',
          joinedAt: new Date(),
        },
      });

      // If initial document provided, link it
      if (data.initialDocumentId) {
        await tx.dealRoomDocument.create({
          data: {
            id: generateId(),
            organizationId: orgId,
            dealRoomId: id,
            documentId: data.initialDocumentId,
            addedBy: createdBy,
          },
        });
      }

      // Transactional Outbox Event (Invariant I-06)
      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'deal_room.created',
          aggregateType: 'deal_room',
          aggregateId: id,
          payload: {
            dealRoomId: id,
            title: room.title,
            slug: room.slug,
            createdBy,
          },
        },
      });

      return room;
    });
  }

  async findDealRooms(
    orgId: string,
    params: {
      cursor?: string;
      limit?: number;
      status?: DealRoomStatus;
      search?: string;
    },
  ) {
    const limit = Math.min(params.limit || 20, 100);
    const where: Prisma.DealRoomWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.dealRoom.findMany({
      where,
      take: limit + 1,
      skip: params.cursor ? 1 : 0,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
            documents: true,
            messages: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      items,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  async findDealRoomById(orgId: string, id: string) {
    return this.prisma.dealRoom.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        brandKit: true,
        members: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        documents: {
          orderBy: { createdAt: 'asc' },
          include: {
            document: {
              select: {
                id: true,
                title: true,
                status: true,
                totalValue: true,
                currency: true,
                updatedAt: true,
              },
            },
          },
        },
        magicLinks: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
  }

  async findDealRoomBySlug(slug: string, orgId?: string) {
    const where: Prisma.DealRoomWhereInput = {
      slug,
      deletedAt: null,
    };
    if (orgId) {
      where.organizationId = orgId;
    }

    return this.prisma.dealRoom.findFirst({
      where,
      include: {
        brandKit: true,
        members: {
          orderBy: { createdAt: 'asc' },
        },
        documents: {
          orderBy: { createdAt: 'asc' },
          include: {
            document: {
              select: {
                id: true,
                title: true,
                status: true,
                totalValue: true,
                currency: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
  }

  async updateDealRoom(_orgId: string, id: string, data: Prisma.DealRoomUpdateInput) {
    return this.prisma.dealRoom.update({
      where: { id },
      data,
    });
  }

  async updateMutualActionPlan(
    orgId: string,
    id: string,
    map: MutualActionPlanMilestone[],
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dealRoom.update({
        where: { id },
        data: {
          mutualActionPlan: map as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'deal_room.map_updated',
          aggregateType: 'deal_room',
          aggregateId: id,
          payload: {
            dealRoomId: id,
            actorId,
            milestonesCount: map.length,
          },
        },
      });

      return updated;
    });
  }

  async softDeleteDealRoom(_orgId: string, id: string) {
    return this.prisma.dealRoom.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'archived',
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. MEMBERS
  // ═══════════════════════════════════════════════════════════════════════

  async addMember(
    orgId: string,
    dealRoomId: string,
    data: {
      userId?: string;
      externalEmail?: string;
      externalName?: string;
      role: DealRoomMemberRole;
    },
  ) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.dealRoomMember.create({
        data: {
          id,
          organizationId: orgId,
          dealRoomId,
          userId: data.userId || null,
          externalEmail: data.externalEmail ? data.externalEmail.toLowerCase().trim() : null,
          externalName: data.externalName || null,
          role: data.role,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'deal_room.member_invited',
          aggregateType: 'deal_room_member',
          aggregateId: id,
          payload: {
            dealRoomId,
            memberId: id,
            email: member.externalEmail,
            role: member.role,
          },
        },
      });

      return member;
    });
  }

  async findMembers(orgId: string, dealRoomId: string) {
    return this.prisma.dealRoomMember.findMany({
      where: {
        dealRoomId,
        organizationId: orgId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findMemberByEmail(orgId: string, dealRoomId: string, email: string) {
    return this.prisma.dealRoomMember.findFirst({
      where: {
        dealRoomId,
        organizationId: orgId,
        externalEmail: email.toLowerCase().trim(),
      },
    });
  }

  async findMemberById(orgId: string, dealRoomId: string, memberId: string) {
    return this.prisma.dealRoomMember.findFirst({
      where: {
        id: memberId,
        dealRoomId,
        organizationId: orgId,
      },
    });
  }

  async removeMember(orgId: string, dealRoomId: string, memberId: string) {
    return this.prisma.dealRoomMember.deleteMany({
      where: {
        id: memberId,
        dealRoomId,
        organizationId: orgId,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════

  async addDocument(orgId: string, dealRoomId: string, documentId: string, addedBy: string) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.dealRoomDocument.create({
        data: {
          id,
          organizationId: orgId,
          dealRoomId,
          documentId,
          addedBy,
        },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              status: true,
              totalValue: true,
              currency: true,
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'deal_room.document_added',
          aggregateType: 'deal_room_document',
          aggregateId: id,
          payload: {
            dealRoomId,
            documentId,
            addedBy,
          },
        },
      });

      return doc;
    });
  }

  async findDocuments(orgId: string, dealRoomId: string) {
    return this.prisma.dealRoomDocument.findMany({
      where: {
        dealRoomId,
        organizationId: orgId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            status: true,
            totalValue: true,
            currency: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async removeDocument(orgId: string, dealRoomId: string, docId: string) {
    return this.prisma.dealRoomDocument.deleteMany({
      where: {
        id: docId,
        dealRoomId,
        organizationId: orgId,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. MESSAGES (INTERNAL & EXTERNAL PARTITIONING)
  // ═══════════════════════════════════════════════════════════════════════

  async createMessage(
    orgId: string,
    dealRoomId: string,
    data: {
      authorUserId?: string | null;
      authorName?: string | null;
      authorEmail?: string | null;
      body: string;
      visibility: DealRoomMessageVisibility;
      parentId?: string | null;
    },
  ) {
    const id = generateId();

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.dealRoomMessage.create({
        data: {
          id,
          organizationId: orgId,
          dealRoomId,
          authorUserId: data.authorUserId || null,
          authorName: data.authorName || null,
          authorEmail: data.authorEmail || null,
          body: data.body,
          visibility: data.visibility,
          parentId: data.parentId || null,
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId: orgId,
          eventType: 'deal_room.message_posted',
          aggregateType: 'deal_room_message',
          aggregateId: id,
          payload: {
            dealRoomId,
            messageId: id,
            visibility: data.visibility,
            authorName: data.authorName,
          },
        },
      });

      return message;
    });
  }

  /**
   * Strict SQL-level partitioning: external buyers must NEVER be able to query internal notes.
   */
  async findMessages(orgId: string, dealRoomId: string, visibilityFilter?: 'external' | 'all') {
    const where: Prisma.DealRoomMessageWhereInput = {
      dealRoomId,
      organizationId: orgId,
      deletedAt: null,
    };

    if (visibilityFilter === 'external') {
      where.visibility = 'external';
    }

    return this.prisma.dealRoomMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        replies: {
          where: {
            deletedAt: null,
            ...(visibilityFilter === 'external' ? { visibility: 'external' } : {}),
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findMessageById(orgId: string, id: string) {
    return this.prisma.dealRoomMessage.findFirst({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  async updateMessage(orgId: string, id: string, body: string) {
    return this.prisma.dealRoomMessage.updateMany({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        body,
      },
    });
  }

  async deleteMessage(orgId: string, id: string) {
    return this.prisma.dealRoomMessage.updateMany({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. MAGIC LINKS
  // ═══════════════════════════════════════════════════════════════════════

  async createMagicLink(
    orgId: string,
    dealRoomId: string,
    memberId: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const id = generateId();

    return this.prisma.dealRoomMagicLink.create({
      data: {
        id,
        organizationId: orgId,
        dealRoomId,
        memberId,
        tokenHash,
        expiresAt,
      },
      include: {
        member: true,
      },
    });
  }

  async findMagicLinkByHash(tokenHash: string) {
    return this.prisma.dealRoomMagicLink.findFirst({
      where: {
        tokenHash,
      },
      include: {
        member: true,
        dealRoom: {
          select: {
            id: true,
            title: true,
            slug: true,
            organizationId: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  async recordMagicLinkUse(id: string) {
    return this.prisma.dealRoomMagicLink.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }
}
