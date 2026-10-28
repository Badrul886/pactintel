import { Test, TestingModule } from '@nestjs/testing';
import { DealRoomService } from '../deal-room.service';
import { DealRoomRepository } from '../deal-room.repository';
import { NotFoundException } from '@nestjs/common';
import { MutualActionPlanMilestone } from '@pactintel/shared-types';

describe('DealRoomService', () => {
  let service: DealRoomService;
  let repository: jest.Mocked<DealRoomRepository>;

  const mockOrgId = '00000000-0000-7000-8000-000000000001';
  const mockUserId = '11111111-1111-7111-8111-111111111111';

  beforeEach(async () => {
    const mockRepo = {
      createDealRoom: jest.fn(),
      findDealRooms: jest.fn(),
      findDealRoomById: jest.fn(),
      findDealRoomBySlug: jest.fn(),
      updateDealRoom: jest.fn(),
      updateMutualActionPlan: jest.fn(),
      softDeleteDealRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealRoomService,
        {
          provide: DealRoomRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<DealRoomService>(DealRoomService);
    repository = module.get(DealRoomRepository);
  });

  describe('generateUniqueSlug', () => {
    it('returns base slug if not taken', async () => {
      repository.findDealRoomBySlug.mockResolvedValueOnce(null);

      const slug = await service.generateUniqueSlug(mockOrgId, 'Acme Expansion Deal');
      expect(slug).toBe('acme-expansion-deal');
      expect(repository.findDealRoomBySlug).toHaveBeenCalledWith('acme-expansion-deal', mockOrgId);
    });

    it('increments suffix if slug already exists in organization', async () => {
      repository.findDealRoomBySlug
        .mockResolvedValueOnce({ id: 'room-1' } as any) // 'acme' taken
        .mockResolvedValueOnce({ id: 'room-2' } as any) // 'acme-2' taken
        .mockResolvedValueOnce(null); // 'acme-3' available

      const slug = await service.generateUniqueSlug(mockOrgId, 'Acme');
      expect(slug).toBe('acme-3');
      expect(repository.findDealRoomBySlug).toHaveBeenCalledTimes(3);
    });
  });

  describe('getDefaultMilestones', () => {
    it('returns 5 structured milestones with internal and external owners', () => {
      const milestones = service.getDefaultMilestones();
      expect(milestones).toHaveLength(5);
      expect(milestones[0].status).toBe('complete');
      expect(milestones[1].status).toBe('in_progress');
      expect(milestones[0].owner).toBe('internal');
      expect(milestones[1].owner).toBe('external');
    });
  });

  describe('createDealRoom', () => {
    it('creates deal room with default milestones if none provided', async () => {
      repository.findDealRoomBySlug.mockResolvedValueOnce(null);
      repository.createDealRoom.mockResolvedValueOnce({
        id: 'new-room-id',
        title: 'New Deal Room',
        slug: 'new-deal-room',
      } as any);

      const result = await service.createDealRoom(
        mockOrgId,
        mockUserId,
        'Badrul Islam',
        'badrul@pactintel.com',
        {
          workspaceId: 'ws-1',
          title: 'New Deal Room',
        },
      );

      expect(result.id).toBe('new-room-id');
      expect(repository.createDealRoom).toHaveBeenCalledWith(
        mockOrgId,
        mockUserId,
        'Badrul Islam',
        'badrul@pactintel.com',
        expect.objectContaining({
          title: 'New Deal Room',
          slug: 'new-deal-room',
          mutualActionPlan: expect.arrayContaining([
            expect.objectContaining({ title: 'Initial Discovery & Scope Alignment' }),
          ]),
        }),
      );
    });
  });

  describe('getDealRoomById', () => {
    it('calculates progress percentage accurately', async () => {
      const mockMilestones: MutualActionPlanMilestone[] = [
        { id: '1', title: 'M1', owner: 'internal', status: 'complete', order: 1 },
        { id: '2', title: 'M2', owner: 'external', status: 'complete', order: 2 },
        { id: '3', title: 'M3', owner: 'internal', status: 'pending', order: 3 },
        { id: '4', title: 'M4', owner: 'external', status: 'pending', order: 4 },
      ];

      repository.findDealRoomById.mockResolvedValueOnce({
        id: 'room-1',
        title: 'Room 1',
        mutualActionPlan: mockMilestones as any,
      } as any);

      const room = await service.getDealRoomById(mockOrgId, 'room-1');
      expect(room.progressPercent).toBe(50); // 2 out of 4 = 50%
    });

    it('throws NotFoundException if room does not exist', async () => {
      repository.findDealRoomById.mockResolvedValueOnce(null);

      await expect(service.getDealRoomById(mockOrgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDeleteDealRoom', () => {
    it('soft deletes active deal room', async () => {
      repository.findDealRoomById.mockResolvedValueOnce({ id: 'room-1' } as any);
      repository.softDeleteDealRoom.mockResolvedValueOnce({
        id: 'room-1',
        status: 'archived',
      } as any);

      const res = await service.softDeleteDealRoom(mockOrgId, 'room-1');
      expect(res.status).toBe('archived');
      expect(repository.softDeleteDealRoom).toHaveBeenCalledWith(mockOrgId, 'room-1');
    });
  });
});
