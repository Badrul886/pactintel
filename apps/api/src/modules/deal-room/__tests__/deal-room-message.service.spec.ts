import { Test, TestingModule } from '@nestjs/testing';
import { DealRoomMessageService } from '../deal-room-message.service';
import { DealRoomRepository } from '../deal-room.repository';
import { ForbiddenException } from '@nestjs/common';

describe('DealRoomMessageService', () => {
  let service: DealRoomMessageService;
  let repository: jest.Mocked<DealRoomRepository>;

  const mockOrgId = '00000000-0000-7000-8000-000000000001';
  const mockRoomId = '22222222-2222-7222-8222-222222222222';

  beforeEach(async () => {
    const mockRepo = {
      createMessage: jest.fn(),
      findMessages: jest.fn(),
      findMessageById: jest.fn(),
      updateMessage: jest.fn(),
      deleteMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealRoomMessageService,
        {
          provide: DealRoomRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<DealRoomMessageService>(DealRoomMessageService);
    repository = module.get(DealRoomRepository);
  });

  describe('postMessage', () => {
    it('forces visibility to external when caller is external buyer guest', async () => {
      repository.createMessage.mockResolvedValueOnce({
        id: 'msg-1',
        visibility: 'external',
      } as any);

      await service.postMessage(
        mockOrgId,
        mockRoomId,
        {
          name: 'Buyer Alice',
          email: 'alice@buyer.com',
          isExternalGuest: true,
        },
        {
          body: 'Hello seller team!',
          visibility: 'internal', // Attempting to post as internal
        },
      );

      // Visibility is forced to external
      expect(repository.createMessage).toHaveBeenCalledWith(
        mockOrgId,
        mockRoomId,
        expect.objectContaining({
          visibility: 'external',
          authorName: 'Buyer Alice',
          body: 'Hello seller team!',
        }),
      );
    });

    it('prevents external buyer guest from replying to an internal seller note', async () => {
      repository.findMessageById.mockResolvedValueOnce({
        id: 'internal-msg-1',
        dealRoomId: mockRoomId,
        visibility: 'internal',
      } as any);

      await expect(
        service.postMessage(
          mockOrgId,
          mockRoomId,
          {
            name: 'Buyer Bob',
            isExternalGuest: true,
          },
          {
            body: 'I see this note',
            parentId: 'internal-msg-1',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMessages (SQL Partitioning)', () => {
    it('passes visibilityFilter: external to repository when caller is an external buyer guest', async () => {
      repository.findMessages.mockResolvedValueOnce([]);

      await service.getMessages(mockOrgId, mockRoomId, {
        isExternalGuest: true,
        visibilityFilter: 'all', // Attempting to request all
      });

      // Strict SQL filtering is enforced
      expect(repository.findMessages).toHaveBeenCalledWith(mockOrgId, mockRoomId, 'external');
    });

    it('allows internal seller team to view all messages (internal notes + external chat)', async () => {
      repository.findMessages.mockResolvedValueOnce([]);

      await service.getMessages(mockOrgId, mockRoomId, {
        isExternalGuest: false,
        visibilityFilter: 'all',
      });

      expect(repository.findMessages).toHaveBeenCalledWith(mockOrgId, mockRoomId, 'all');
    });
  });

  describe('updateMessage & deleteMessage', () => {
    it('allows author to edit their own message', async () => {
      repository.findMessageById.mockResolvedValueOnce({
        id: 'msg-1',
        authorUserId: 'user-1',
        body: 'Original',
      } as any);
      repository.updateMessage.mockResolvedValueOnce({ count: 1 } as any);

      await service.updateMessage(mockOrgId, 'msg-1', 'user-1', 'Updated body', false);
      expect(repository.updateMessage).toHaveBeenCalledWith(mockOrgId, 'msg-1', 'Updated body');
    });

    it('forbids a regular user from editing another user message', async () => {
      repository.findMessageById.mockResolvedValueOnce({
        id: 'msg-1',
        authorUserId: 'user-author',
      } as any);

      await expect(
        service.updateMessage(mockOrgId, 'msg-1', 'user-other', 'Hacked', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin/manager to moderate and delete any message', async () => {
      repository.findMessageById.mockResolvedValueOnce({
        id: 'msg-1',
        authorUserId: 'user-author',
      } as any);
      repository.deleteMessage.mockResolvedValueOnce({ count: 1 } as any);

      await service.deleteMessage(mockOrgId, 'msg-1', 'admin-user', true);
      expect(repository.deleteMessage).toHaveBeenCalledWith(mockOrgId, 'msg-1');
    });
  });
});
