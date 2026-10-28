import { Injectable, NotFoundException } from '@nestjs/common';
import { DealRoomRepository } from './deal-room.repository';
import { DealRoomActivityDto, MutualActionPlanMilestone } from '@pactintel/shared-types';

@Injectable()
export class DealRoomActivityService {
  constructor(private readonly repository: DealRoomRepository) {}

  async getActivityFeed(
    orgId: string,
    dealRoomId: string,
    options?: { isExternalGuest?: boolean },
  ): Promise<DealRoomActivityDto[]> {
    const room = await this.repository.findDealRoomById(orgId, dealRoomId);
    if (!room) {
      throw new NotFoundException(`Deal room ${dealRoomId} not found`);
    }

    const activities: DealRoomActivityDto[] = [];

    // 1. Room Creation
    activities.push({
      id: `act-create-${room.id}`,
      dealRoomId: room.id,
      type: 'room_created',
      title: 'Deal Room Created',
      actor: 'System / Owner',
      timestamp: room.createdAt.toISOString(),
      metadata: { slug: room.slug, title: room.title },
    });

    // 2. Members Joined
    for (const member of room.members) {
      const name = member.externalName || member.externalEmail || member.user?.name || 'Member';
      activities.push({
        id: `act-member-${member.id}`,
        dealRoomId: room.id,
        type: 'member_joined',
        title: 'Member Added',
        actor: name,
        timestamp: member.createdAt.toISOString(),
        metadata: { role: member.role, email: member.externalEmail || member.user?.email },
      });
    }

    // 3. Documents Linked
    for (const doc of room.documents) {
      activities.push({
        id: `act-doc-${doc.id}`,
        dealRoomId: room.id,
        type: 'document_added',
        title: 'Document Added',
        actor: 'Seller Team',
        timestamp: doc.createdAt.toISOString(),
        metadata: {
          documentId: doc.documentId,
          title: doc.document.title,
        },
      });
    }

    // 4. Milestone completions
    const map = (room.mutualActionPlan as unknown as MutualActionPlanMilestone[]) || [];
    for (const ms of map) {
      if (ms.status === 'complete' && ms.completedAt) {
        activities.push({
          id: `act-ms-${ms.id}`,
          dealRoomId: room.id,
          type: 'milestone_completed',
          title: 'Milestone Completed',
          actor: ms.assigneeName || 'Team',
          timestamp: ms.completedAt,
          metadata: { milestoneId: ms.id, title: ms.title },
        });
      }
    }

    // 5. Messages
    const messages = await this.repository.findMessages(
      orgId,
      dealRoomId,
      options?.isExternalGuest ? 'external' : 'all',
    );
    for (const msg of messages) {
      if (options?.isExternalGuest && msg.visibility === 'internal') {
        continue;
      }
      activities.push({
        id: `act-msg-${msg.id}`,
        dealRoomId: room.id,
        type: 'message_posted',
        title: msg.visibility === 'internal' ? 'Internal Note Added' : 'Message Posted',
        actor: msg.authorName || 'Guest',
        timestamp: msg.createdAt.toISOString(),
        metadata: { visibility: msg.visibility, bodyPreview: msg.body.substring(0, 100) },
      });
    }

    // Sort descending by timestamp
    return activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }
}
