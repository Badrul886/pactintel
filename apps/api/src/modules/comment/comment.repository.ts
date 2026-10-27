import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { generateId } from '@pactintel/shared-utils';
import { Prisma } from '@prisma/client';
import { CreateCommentDto, CommentThreadDto } from '@pactintel/shared-types';

export interface FindCommentsOptions {
  cursor?: string;
  limit: number;
  blockId?: string;
  isResolved?: boolean;
}

@Injectable()
export class CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a comment and transactional outbox event in a single database transaction.
   * Invariant I-06: Outbox pattern for all side-effects.
   */
  async create(
    organizationId: string,
    documentId: string,
    authorId: string,
    dto: CreateCommentDto,
    id: string = generateId(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.documentComment.create({
        data: {
          id,
          organizationId,
          documentId,
          documentVersionId: dto.documentVersionId ?? null,
          authorId,
          parentId: dto.parentId ?? null,
          blockId: dto.blockId ?? null,
          content: dto.content,
          isResolved: false,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'comment.created',
          aggregateType: 'Comment',
          aggregateId: comment.id,
          payload: {
            commentId: comment.id,
            documentId: comment.documentId,
            authorId: comment.authorId,
            parentId: comment.parentId,
            blockId: comment.blockId,
            content: comment.content,
            createdAt: comment.createdAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return comment;
    });
  }

  async findById(id: string, organizationId?: string) {
    return this.prisma.documentComment.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        author: {
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

  /**
   * Keyset cursor pagination for document comment threads.
   * Fetches root comments (parentId = null) with their replies ordered chronologically.
   */
  async findByDocumentId(
    organizationId: string,
    documentId: string,
    options: FindCommentsOptions,
  ): Promise<{ items: CommentThreadDto[]; nextCursor: string | null }> {
    const limit = options.limit || 20;

    const where: Prisma.DocumentCommentWhereInput = {
      organizationId,
      documentId,
      parentId: null,
      ...(options.blockId !== undefined ? { blockId: options.blockId } : {}),
      ...(options.isResolved !== undefined ? { isResolved: options.isResolved } : {}),
    };

    // Keyset pagination using cursor id
    let cursorObj: Prisma.DocumentCommentWhereUniqueInput | undefined;
    if (options.cursor) {
      cursorObj = { id: options.cursor };
    }

    const records = await this.prisma.documentComment.findMany({
      where,
      take: limit + 1,
      skip: cursorObj ? 1 : 0,
      cursor: cursorObj,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    let nextCursor: string | null = null;
    let items = records;

    if (records.length > limit) {
      const nextItem = records[limit];
      nextCursor = nextItem.id;
      items = records.slice(0, limit);
    }

    const mappedItems: CommentThreadDto[] = items.map((root) => ({
      id: root.id,
      documentId: root.documentId,
      authorId: root.authorId,
      author: {
        id: root.author.id,
        name: root.author.name,
        email: root.author.email,
        avatarUrl: root.author.avatarUrl,
      },
      parentId: null,
      blockId: root.blockId,
      content: root.content,
      isResolved: root.isResolved,
      resolvedById: root.resolvedById,
      resolvedAt: root.resolvedAt ? root.resolvedAt.toISOString() : null,
      createdAt: root.createdAt.toISOString(),
      updatedAt: root.updatedAt.toISOString(),
      deletedAt: root.deletedAt ? root.deletedAt.toISOString() : null,
      replies: root.replies.map((reply) => ({
        id: reply.id,
        documentId: reply.documentId,
        authorId: reply.authorId,
        author: {
          id: reply.author.id,
          name: reply.author.name,
          email: reply.author.email,
          avatarUrl: reply.author.avatarUrl,
        },
        parentId: reply.parentId as string,
        blockId: reply.blockId,
        content: reply.content,
        isResolved: reply.isResolved,
        createdAt: reply.createdAt.toISOString(),
        updatedAt: reply.updatedAt.toISOString(),
        deletedAt: reply.deletedAt ? reply.deletedAt.toISOString() : null,
      })),
    }));

    return { items: mappedItems, nextCursor };
  }

  async countByDocumentId(
    organizationId: string,
    documentId: string,
    blockId?: string,
    isResolved?: boolean,
  ): Promise<number> {
    return this.prisma.documentComment.count({
      where: {
        organizationId,
        documentId,
        parentId: null,
        ...(blockId !== undefined ? { blockId } : {}),
        ...(isResolved !== undefined ? { isResolved } : {}),
      },
    });
  }

  async countActiveReplies(commentId: string): Promise<number> {
    return this.prisma.documentComment.count({
      where: {
        parentId: commentId,
        deletedAt: null,
      },
    });
  }

  async updateContent(id: string, content: string) {
    return this.prisma.documentComment.update({
      where: { id },
      data: {
        content,
        updatedAt: new Date(),
      },
      include: {
        author: {
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

  /**
   * Soft delete preserving thread continuity (EC-COMMENT-01).
   */
  async softDelete(id: string) {
    return this.prisma.documentComment.update({
      where: { id },
      data: {
        content: '[deleted]',
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Hard delete for leaf comments with 0 active replies (EC-COMMENT-02).
   */
  async hardDelete(id: string) {
    return this.prisma.documentComment.delete({
      where: { id },
    });
  }

  /**
   * Resolves a comment thread and writes transactional outbox event (EC-COMMENT-03..06).
   */
  async resolveThread(id: string, organizationId: string, resolvedById: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.documentComment.update({
        where: { id },
        data: {
          isResolved: true,
          resolvedById,
          resolvedAt: new Date(),
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'comment.resolved',
          aggregateType: 'Comment',
          aggregateId: id,
          payload: {
            commentId: id,
            documentId: updated.documentId,
            resolvedById,
            resolvedAt: updated.resolvedAt?.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  /**
   * Reopens a resolved thread and writes transactional outbox event.
   */
  async reopenThread(id: string, organizationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.documentComment.update({
        where: { id },
        data: {
          isResolved: false,
          resolvedById: null,
          resolvedAt: null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          id: generateId(),
          organizationId,
          eventType: 'comment.reopened',
          aggregateType: 'Comment',
          aggregateId: id,
          payload: {
            commentId: id,
            documentId: updated.documentId,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }
}
