import { Test, TestingModule } from '@nestjs/testing';
import { DealRoomController } from '../deal-room.controller';
import { DealRoomService } from '../deal-room.service';
import { DealRoomMemberService } from '../deal-room-member.service';
import { DealRoomDocumentService } from '../deal-room-document.service';
import { DealRoomMessageService } from '../deal-room-message.service';
import { DealRoomMagicLinkService } from '../deal-room-magic-link.service';
import { DealRoomActivityService } from '../deal-room-activity.service';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { CaslGuard } from '../../../common/guards/casl.guard';
import { Reflector } from '@nestjs/core';

describe('DealRoomController', () => {
  let controller: DealRoomController;
  let roomService: jest.Mocked<DealRoomService>;
  let messageService: jest.Mocked<DealRoomMessageService>;
  let magicLinkService: jest.Mocked<DealRoomMagicLinkService>;
  let activityService: jest.Mocked<DealRoomActivityService>;

  beforeEach(async () => {
    const mockRoomService = {
      createDealRoom: jest.fn(),
      getDealRooms: jest.fn(),
      getDealRoomById: jest.fn(),
      getDealRoomBySlug: jest.fn(),
      updateDealRoom: jest.fn(),
      updateMap: jest.fn(),
      softDeleteDealRoom: jest.fn(),
    };

    const mockMemberService = {
      inviteMember: jest.fn(),
      getMembers: jest.fn(),
      removeMember: jest.fn(),
    };

    const mockDocService = {
      addDocument: jest.fn(),
      getDocuments: jest.fn(),
      removeDocument: jest.fn(),
    };

    const mockMsgService = {
      postMessage: jest.fn(),
      getMessages: jest.fn(),
      updateMessage: jest.fn(),
      deleteMessage: jest.fn(),
    };

    const mockMagicLinkService = {
      verifyMagicLink: jest.fn(),
      generateMagicLink: jest.fn(),
    };

    const mockActivityService = {
      getActivityFeed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DealRoomController],
      providers: [
        { provide: DealRoomService, useValue: mockRoomService },
        { provide: DealRoomMemberService, useValue: mockMemberService },
        { provide: DealRoomDocumentService, useValue: mockDocService },
        { provide: DealRoomMessageService, useValue: mockMsgService },
        { provide: DealRoomMagicLinkService, useValue: mockMagicLinkService },
        { provide: DealRoomActivityService, useValue: mockActivityService },
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaslGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DealRoomController>(DealRoomController);
    roomService = module.get(DealRoomService);
    messageService = module.get(DealRoomMessageService);
    magicLinkService = module.get(DealRoomMagicLinkService);
    activityService = module.get(DealRoomActivityService);
  });

  describe('verifyMagicLinkAndAccess (Public)', () => {
    it('verifies token and returns guest session, room, filtered messages and activities', async () => {
      magicLinkService.verifyMagicLink.mockResolvedValueOnce({
        dealRoomId: 'room-1',
        organizationId: 'org-1',
        memberId: 'mem-1',
        email: 'buyer@acme.com',
        name: 'Alice',
        role: 'viewer',
        isExternalGuest: true,
        tokenHash: 'hash-1',
      });

      roomService.getDealRoomById.mockResolvedValueOnce({
        id: 'room-1',
        title: 'Acme Room',
        slug: 'acme-room',
        progressPercent: 40,
        mutualActionPlan: [],
      } as any);

      messageService.getMessages.mockResolvedValueOnce([
        { id: 'm-1', body: 'Hello', visibility: 'external' } as any,
      ]);

      activityService.getActivityFeed.mockResolvedValueOnce([
        {
          id: 'a-1',
          dealRoomId: 'room-1',
          type: 'room_created',
          title: 'Created',
          actor: 'Seller',
          timestamp: new Date().toISOString(),
        },
      ]);

      const res = await controller.verifyMagicLinkAndAccess('valid-token');

      expect(res.session.email).toBe('buyer@acme.com');
      expect(res.room.title).toBe('Acme Room');
      expect(res.messages).toHaveLength(1);
      expect(res.activities).toHaveLength(1);
      expect(messageService.getMessages).toHaveBeenCalledWith('org-1', 'room-1', {
        isExternalGuest: true,
        visibilityFilter: 'external',
      });
    });
  });

  describe('createDealRoom (Authenticated)', () => {
    it('delegates to DealRoomService with req.user context', async () => {
      const mockReq = {
        user: {
          id: 'usr-1',
          organizationId: 'org-1',
          name: 'Sales Rep',
          email: 'sales@pactintel.com',
          role: 'manager',
        },
      };

      roomService.createDealRoom.mockResolvedValueOnce({
        id: 'new-room',
        title: 'Enterprise Deal',
      } as any);

      const res = await controller.createDealRoom(mockReq, {
        workspaceId: 'ws-1',
        title: 'Enterprise Deal',
      });

      expect(res.id).toBe('new-room');
      expect(roomService.createDealRoom).toHaveBeenCalledWith(
        'org-1',
        'usr-1',
        'Sales Rep',
        'sales@pactintel.com',
        { workspaceId: 'ws-1', title: 'Enterprise Deal' },
      );
    });
  });
});
