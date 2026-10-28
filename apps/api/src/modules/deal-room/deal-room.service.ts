import { Injectable, NotFoundException } from '@nestjs/common';
import { DealRoomRepository } from './deal-room.repository';
import {
  CreateDealRoomDto,
  UpdateDealRoomDto,
  DealRoomStatus,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';
import { generateId } from '@pactintel/shared-utils';

@Injectable()
export class DealRoomService {
  constructor(private readonly repository: DealRoomRepository) {}

  /**
   * Generates a slug from room title, avoiding collisions within the organization.
   */
  async generateUniqueSlug(orgId: string, title: string, preferredSlug?: string): Promise<string> {
    const baseSlug =
      (preferredSlug || title)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'deal-room';

    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.repository.findDealRoomBySlug(slug, orgId);
      if (!existing) {
        return slug;
      }
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }
  }

  /**
   * Provides default milestones for a newly created Deal Room.
   */
  getDefaultMilestones(): MutualActionPlanMilestone[] {
    const now = new Date();
    const addDays = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

    return [
      {
        id: generateId(),
        title: 'Initial Discovery & Scope Alignment',
        description: 'Align business requirements, scope, and technical roadmap.',
        owner: 'internal',
        dueDate: addDays(5),
        status: 'complete',
        order: 1,
        completedAt: now.toISOString(),
      },
      {
        id: generateId(),
        title: 'Security & Compliance Review',
        description: 'Review SOC2 report, infosec questionnaire, and compliance terms.',
        owner: 'external',
        dueDate: addDays(12),
        status: 'in_progress',
        order: 2,
      },
      {
        id: generateId(),
        title: 'Commercial Proposal & Quotation Approval',
        description: 'Finalize multi-year pricing, discounts, and custom terms.',
        owner: 'external',
        dueDate: addDays(18),
        status: 'pending',
        order: 3,
      },
      {
        id: generateId(),
        title: 'Contract Execution & Signatures',
        description: 'Complete electronic signing by authorized signatories.',
        owner: 'external',
        dueDate: addDays(25),
        status: 'pending',
        order: 4,
      },
      {
        id: generateId(),
        title: 'Implementation & Kickoff Meeting',
        description: 'Kick off workspace provisioning, SSO setup, and onboarding.',
        owner: 'internal',
        dueDate: addDays(30),
        status: 'pending',
        order: 5,
      },
    ];
  }

  async createDealRoom(
    orgId: string,
    userId: string,
    userName: string,
    userEmail: string,
    dto: CreateDealRoomDto,
  ) {
    const slug = await this.generateUniqueSlug(orgId, dto.title, dto.slug);
    const milestones: MutualActionPlanMilestone[] = dto.mutualActionPlan?.length
      ? dto.mutualActionPlan.map((m, idx) => ({
          ...m,
          status: m.status || 'pending',
          order: m.order ?? idx + 1,
        }))
      : this.getDefaultMilestones();

    return this.repository.createDealRoom(orgId, userId, userName, userEmail, {
      workspaceId: dto.workspaceId,
      title: dto.title,
      slug,
      brandKitId: dto.brandKitId,
      mutualActionPlan: milestones,
      initialDocumentId: dto.initialDocumentId,
    });
  }

  async getDealRooms(
    orgId: string,
    params: {
      cursor?: string;
      limit?: number;
      status?: DealRoomStatus;
      search?: string;
    },
  ) {
    return this.repository.findDealRooms(orgId, params);
  }

  async getDealRoomById(orgId: string, id: string) {
    const room = await this.repository.findDealRoomById(orgId, id);
    if (!room) {
      throw new NotFoundException(`Deal room ${id} not found`);
    }

    const map = (room.mutualActionPlan as unknown as MutualActionPlanMilestone[]) || [];
    const completedCount = map.filter((m) => m.status === 'complete').length;
    const progressPercent = map.length > 0 ? Math.round((completedCount / map.length) * 100) : 0;

    return {
      ...room,
      progressPercent,
      mutualActionPlan: map,
    };
  }

  async getDealRoomBySlug(slug: string, orgId?: string) {
    const room = await this.repository.findDealRoomBySlug(slug, orgId);
    if (!room) {
      throw new NotFoundException(`Deal room with slug '${slug}' not found`);
    }

    const map = (room.mutualActionPlan as unknown as MutualActionPlanMilestone[]) || [];
    const completedCount = map.filter((m) => m.status === 'complete').length;
    const progressPercent = map.length > 0 ? Math.round((completedCount / map.length) * 100) : 0;

    return {
      ...room,
      progressPercent,
      mutualActionPlan: map,
    };
  }

  async updateDealRoom(orgId: string, id: string, dto: UpdateDealRoomDto) {
    const existing = await this.repository.findDealRoomById(orgId, id);
    if (!existing) {
      throw new NotFoundException(`Deal room ${id} not found`);
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.brandKitId !== undefined) updateData.brandKitId = dto.brandKitId;
    if (dto.mutualActionPlan !== undefined) updateData.mutualActionPlan = dto.mutualActionPlan;

    return this.repository.updateDealRoom(orgId, id, updateData);
  }

  async updateMap(
    orgId: string,
    dealRoomId: string,
    milestones: MutualActionPlanMilestone[],
    actorId: string,
  ) {
    const room = await this.repository.findDealRoomById(orgId, dealRoomId);
    if (!room) {
      throw new NotFoundException(`Deal room ${dealRoomId} not found`);
    }

    return this.repository.updateMutualActionPlan(orgId, dealRoomId, milestones, actorId);
  }

  async softDeleteDealRoom(orgId: string, id: string) {
    const existing = await this.repository.findDealRoomById(orgId, id);
    if (!existing) {
      throw new NotFoundException(`Deal room ${id} not found`);
    }

    return this.repository.softDeleteDealRoom(orgId, id);
  }
}
