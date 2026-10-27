import { CommentService } from '../comment.service';
import { CommentRepository } from '../comment.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('CommentService Unit Tests (Rules EC-COMMENT-01..06 & COLLAB-002)', () => {
  let service: CommentService;
  let mockRepo: Partial<Record<keyof CommentRepository, jest.Mock>>;
  let mockPrisma: any;

  const orgId = '11111111-1111-7111-8111-111111111111';
  const userId = '22222222-2222-7222-8222-222222222222';
  const otherUserId = '33333333-3333-7333-8333-333333333333';
  const documentId = '44444444-4444-7444-8444-444444444444';
  const rootCommentId = '55555555-5555-7555-8555-555555555555';
  const replyCommentId = '66666666-6666-7666-8666-666666666666';

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByDocumentId: jest.fn(),
      countByDocumentId: jest.fn(),
      countActiveReplies: jest.fn(),
      updateContent: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      resolveThread: jest.fn(),
      reopenThread: jest.fn(),
    };

    mockPrisma = {
      document: {
        findFirst: jest.fn().mockResolvedValue({
          id: documentId,
          title: 'Master Services Agreement',
          ownerId: userId,
        }),
      },
    };

    service = new CommentService(
      mockRepo as unknown as CommentRepository,
      mockPrisma as PrismaService,
    );
  });

  describe('createComment', () => {
    it('Test 1: adds comment anchored to block -> comment created with blockId', async () => {
      const dto = { content: 'Please review payment terms', blockId: 'block-pricing-1' };
      mockRepo.create!.mockResolvedValue({
        id: rootCommentId,
        documentId,
        authorId: userId,
        blockId: 'block-pricing-1',
        content: dto.content,
        parentId: null,
      });

      const result = await service.createComment(orgId, userId, documentId, dto);

      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
        where: { id: documentId, organizationId: orgId, deletedAt: null },
        select: { id: true, title: true, ownerId: true },
      });
      expect(mockRepo.create).toHaveBeenCalledWith(orgId, documentId, userId, dto);
      expect(result.blockId).toBe('block-pricing-1');
    });

    it('Test 2: adds general document comment without block -> blockId is null', async () => {
      const dto = { content: 'General contract feedback', blockId: null };
      mockRepo.create!.mockResolvedValue({
        id: rootCommentId,
        documentId,
        authorId: userId,
        blockId: null,
        content: dto.content,
        parentId: null,
      });

      const result = await service.createComment(orgId, userId, documentId, dto);

      expect(mockRepo.create).toHaveBeenCalledWith(orgId, documentId, userId, dto);
      expect(result.blockId).toBeNull();
    });

    it('Test 3: replies to an existing root comment -> parentId set correctly', async () => {
      const dto = { content: 'I updated the indemnity clause', parentId: rootCommentId };
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        documentId,
        organizationId: orgId,
        authorId: otherUserId,
      });
      mockRepo.create!.mockResolvedValue({
        id: replyCommentId,
        documentId,
        authorId: userId,
        parentId: rootCommentId,
        content: dto.content,
      });

      const result = await service.createComment(orgId, userId, documentId, dto);

      expect(mockRepo.findById).toHaveBeenCalledWith(rootCommentId, orgId);
      expect(mockRepo.create).toHaveBeenCalledWith(orgId, documentId, userId, dto);
      expect(result.parentId).toBe(rootCommentId);
    });

    it('Test 6: rejects cross-document reply with 400 PARENT_DOCUMENT_MISMATCH (EC-COMMENT-03)', async () => {
      const dto = { content: 'Malicious cross-doc injection', parentId: rootCommentId };
      const otherDocumentId = '77777777-7777-7777-8777-777777777777';

      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        documentId: otherDocumentId, // Different document!
        organizationId: orgId,
        authorId: otherUserId,
      });

      await expect(service.createComment(orgId, userId, documentId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteComment', () => {
    it('Test 4: soft deletes comment with replies preserving thread continuity (EC-COMMENT-01)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        authorId: userId,
        deletedAt: null,
      });
      mockRepo.countActiveReplies!.mockResolvedValue(2); // 2 replies exist
      mockRepo.softDelete!.mockResolvedValue({
        id: rootCommentId,
        content: '[deleted]',
        deletedAt: new Date(),
      });

      const result = await service.deleteComment(orgId, userId, 'member', rootCommentId);

      expect(mockRepo.countActiveReplies).toHaveBeenCalledWith(rootCommentId);
      expect(mockRepo.softDelete).toHaveBeenCalledWith(rootCommentId);
      expect(mockRepo.hardDelete).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, softDeleted: true });
    });

    it('Test 5: hard deletes leaf comment with 0 active replies (EC-COMMENT-02)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: replyCommentId,
        authorId: userId,
        deletedAt: null,
      });
      mockRepo.countActiveReplies!.mockResolvedValue(0); // 0 replies
      mockRepo.hardDelete!.mockResolvedValue({ id: replyCommentId });

      const result = await service.deleteComment(orgId, userId, 'member', replyCommentId);

      expect(mockRepo.countActiveReplies).toHaveBeenCalledWith(replyCommentId);
      expect(mockRepo.hardDelete).toHaveBeenCalledWith(replyCommentId);
      expect(mockRepo.softDelete).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, softDeleted: false });
    });

    it('Test 11: non-author cannot delete comment without admin/owner role (403 Forbidden)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        authorId: otherUserId, // Not current user
        deletedAt: null,
      });

      await expect(service.deleteComment(orgId, userId, 'member', rootCommentId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows admin/owner to delete comment authored by another user', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        authorId: otherUserId,
        deletedAt: null,
      });
      mockRepo.countActiveReplies!.mockResolvedValue(0);
      mockRepo.hardDelete!.mockResolvedValue({ id: rootCommentId });

      const result = await service.deleteComment(orgId, userId, 'admin', rootCommentId);

      expect(mockRepo.hardDelete).toHaveBeenCalledWith(rootCommentId);
      expect(result.success).toBe(true);
    });
  });

  describe('resolveThread and reopenThread', () => {
    it('Test 7: resolves root comment thread -> sets isResolved: true (EC-COMMENT-03..06)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        parentId: null,
        isResolved: false,
      });
      mockRepo.resolveThread!.mockResolvedValue({
        id: rootCommentId,
        isResolved: true,
        resolvedById: userId,
        resolvedAt: new Date(),
      });

      const result = await service.resolveThread(orgId, userId, rootCommentId);

      expect(mockRepo.resolveThread).toHaveBeenCalledWith(rootCommentId, orgId, userId);
      expect(result.isResolved).toBe(true);
    });

    it('Test 8: reopens resolved thread -> sets isResolved: false', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        parentId: null,
        isResolved: true,
      });
      mockRepo.reopenThread!.mockResolvedValue({
        id: rootCommentId,
        isResolved: false,
        resolvedById: null,
        resolvedAt: null,
      });

      const result = await service.reopenThread(orgId, rootCommentId);

      expect(mockRepo.reopenThread).toHaveBeenCalledWith(rootCommentId, orgId);
      expect(result.isResolved).toBe(false);
    });

    it('Test 9: rejects resolving a child reply with 400 CANNOT_RESOLVE_REPLY (EC-COMMENT-03)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: replyCommentId,
        parentId: rootCommentId, // Reply!
        isResolved: false,
      });

      await expect(service.resolveThread(orgId, userId, replyCommentId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Test 10: idempotent resolution -> resolving already resolved thread returns existing comment', async () => {
      const alreadyResolvedComment = {
        id: rootCommentId,
        parentId: null,
        isResolved: true,
        resolvedById: otherUserId,
      };
      mockRepo.findById!.mockResolvedValue(alreadyResolvedComment);

      const result = await service.resolveThread(orgId, userId, rootCommentId);

      expect(mockRepo.resolveThread).not.toHaveBeenCalled();
      expect(result).toBe(alreadyResolvedComment);
    });
  });

  describe('updateComment', () => {
    it('updates comment content when user is author', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        authorId: userId,
        deletedAt: null,
      });
      mockRepo.updateContent!.mockResolvedValue({
        id: rootCommentId,
        content: 'Updated content',
      });

      const result = await service.updateComment(orgId, userId, 'member', rootCommentId, {
        content: 'Updated content',
      });

      expect(mockRepo.updateContent).toHaveBeenCalledWith(rootCommentId, 'Updated content');
      expect(result.content).toBe('Updated content');
    });

    it('Test 12: rejects editing a soft-deleted comment (400 COMMENT_DELETED)', async () => {
      mockRepo.findById!.mockResolvedValue({
        id: rootCommentId,
        authorId: userId,
        deletedAt: new Date(),
      });

      await expect(
        service.updateComment(orgId, userId, 'member', rootCommentId, {
          content: 'Cannot edit deleted',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
