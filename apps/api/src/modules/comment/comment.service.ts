import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { CommentRepository, FindCommentsOptions } from './comment.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateCommentDto,
  UpdateCommentDto,
  ListCommentsQuery,
  CommentsListResponseDto,
  UserRole,
} from '@pactintel/shared-types';

@Injectable()
export class CommentService {
  constructor(
    private readonly repo: CommentRepository,
    private readonly prisma: PrismaService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Verifies that the document exists and belongs to the given tenant.
   */
  private async ensureDocumentExists(organizationId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId, deletedAt: null },
      select: { id: true, title: true, ownerId: true },
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return doc;
  }

  /**
   * Creates a comment or threaded reply.
   * Enforces cross-document threading defense (EC-COMMENT-03).
   */
  async createComment(
    organizationId: string,
    userId: string,
    documentId: string,
    dto: CreateCommentDto,
  ) {
    const doc = await this.ensureDocumentExists(organizationId, documentId);

    // EC-COMMENT-03: Cross-document threading defense
    if (dto.parentId) {
      const parent = await this.repo.findById(dto.parentId, organizationId);
      if (!parent) {
        throw new NotFoundException(`Parent comment ${dto.parentId} not found`);
      }
      if (parent.documentId !== documentId) {
        throw new BadRequestException({
          code: 'PARENT_DOCUMENT_MISMATCH',
          message: 'Parent comment belongs to a different document',
        });
      }
    }

    const comment = await this.repo.create(organizationId, documentId, userId, dto);

    // Asynchronously dispatch notification if recipient exists
    if (this.notificationService) {
      try {
        if (dto.parentId) {
          const parent = await this.repo.findById(dto.parentId, organizationId);
          if (parent && parent.authorId !== userId) {
            await this.notificationService.notifyUser(parent.authorId, organizationId, {
              eventType: 'comment.created',
              title: 'New Reply to Your Comment',
              body: `Someone replied to your comment on "${doc.title}": "${comment.content.slice(0, 100)}"`,
              resourceType: 'Document',
              resourceId: documentId,
            });
          }
        } else if (doc.ownerId && doc.ownerId !== userId) {
          await this.notificationService.notifyUser(doc.ownerId, organizationId, {
            eventType: 'comment.created',
            title: 'New Comment on Document',
            body: `A new comment was added to "${doc.title}": "${comment.content.slice(0, 100)}"`,
            resourceType: 'Document',
            resourceId: documentId,
          });
        }
      } catch {
        // Notifications are non-critical background side effects
      }
    }

    return comment;
  }

  /**
   * Retrieves comment threads for a document with keyset pagination.
   */
  async listComments(
    organizationId: string,
    documentId: string,
    query: ListCommentsQuery,
  ): Promise<CommentsListResponseDto> {
    await this.ensureDocumentExists(organizationId, documentId);

    const options: FindCommentsOptions = {
      cursor: query.cursor,
      limit: query.limit || 20,
      blockId: query.blockId,
      isResolved: query.isResolved,
    };

    const [{ items, nextCursor }, totalCount] = await Promise.all([
      this.repo.findByDocumentId(organizationId, documentId, options),
      this.repo.countByDocumentId(organizationId, documentId, query.blockId, query.isResolved),
    ]);

    return {
      items,
      nextCursor,
      totalCount,
    };
  }

  /**
   * Updates comment content. Only comment author or org admin/owner can edit.
   */
  async updateComment(
    organizationId: string,
    userId: string,
    userRole: UserRole,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    const comment = await this.repo.findById(commentId, organizationId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    if (comment.deletedAt !== null) {
      throw new BadRequestException({
        code: 'COMMENT_DELETED',
        message: 'Cannot edit a deleted comment',
      });
    }

    const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
    if (comment.authorId !== userId && !isAdminOrOwner) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    return this.repo.updateContent(commentId, dto.content);
  }

  /**
   * Deletes a comment adhering to EC-COMMENT-01 & EC-COMMENT-02.
   * If comment has active replies -> soft delete with content = '[deleted]'.
   * If comment has 0 active replies -> hard delete row.
   */
  async deleteComment(
    organizationId: string,
    userId: string,
    userRole: UserRole,
    commentId: string,
  ) {
    const comment = await this.repo.findById(commentId, organizationId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    if (comment.deletedAt !== null) {
      return { success: true, softDeleted: true, message: 'Comment already deleted' };
    }

    const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
    if (comment.authorId !== userId && !isAdminOrOwner) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const activeReplyCount = await this.repo.countActiveReplies(commentId);

    if (activeReplyCount > 0) {
      // EC-COMMENT-01: Soft delete preserving thread structure
      await this.repo.softDelete(commentId);
      return { success: true, softDeleted: true };
    } else {
      // EC-COMMENT-02: Hard delete leaf comment
      await this.repo.hardDelete(commentId);
      return { success: true, softDeleted: false };
    }
  }

  /**
   * Resolves a comment thread (EC-COMMENT-03..06).
   * Resolving is only allowed on root comments.
   */
  async resolveThread(organizationId: string, userId: string, commentId: string) {
    const comment = await this.repo.findById(commentId, organizationId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    // EC-COMMENT-03: Root comment only
    if (comment.parentId !== null) {
      throw new BadRequestException({
        code: 'CANNOT_RESOLVE_REPLY',
        message: 'Only root comment threads can be resolved',
      });
    }

    // EC-COMMENT-06: Idempotent resolution
    if (comment.isResolved) {
      return comment;
    }

    return this.repo.resolveThread(commentId, organizationId, userId);
  }

  /**
   * Reopens a resolved comment thread.
   */
  async reopenThread(organizationId: string, commentId: string) {
    const comment = await this.repo.findById(commentId, organizationId);
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    if (comment.parentId !== null) {
      throw new BadRequestException({
        code: 'CANNOT_RESOLVE_REPLY',
        message: 'Only root comment threads can be reopened',
      });
    }

    // Idempotent reopen
    if (!comment.isResolved) {
      return comment;
    }

    return this.repo.reopenThread(commentId, organizationId);
  }
}
