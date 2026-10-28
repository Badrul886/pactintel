import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DealRoomRepository } from './deal-room.repository';
import { CreateDealRoomMessageDto, DealRoomMessageVisibility } from '@pactintel/shared-types';

@Injectable()
export class DealRoomMessageService {
  constructor(private readonly repository: DealRoomRepository) {}

  /**
   * Posts a message in the deal room.
   * If caller is an external buyer guest, visibility is strictly forced to 'external'.
   */
  async postMessage(
    orgId: string,
    dealRoomId: string,
    author: {
      userId?: string;
      name?: string;
      email?: string;
      isExternalGuest?: boolean;
    },
    dto: CreateDealRoomMessageDto,
  ) {
    if (!dto.body || !dto.body.trim()) {
      throw new BadRequestException('Message body cannot be empty');
    }

    // External buyer guests can ONLY post external messages visible to both parties
    const visibility: DealRoomMessageVisibility = author.isExternalGuest
      ? 'external'
      : dto.visibility || 'external';

    // If parentId provided, verify it exists and is in the same room
    if (dto.parentId) {
      const parent = await this.repository.findMessageById(orgId, dto.parentId);
      if (!parent || parent.dealRoomId !== dealRoomId) {
        throw new NotFoundException(`Parent message ${dto.parentId} not found`);
      }
      // If external guest, parent message MUST be external
      if (author.isExternalGuest && parent.visibility === 'internal') {
        throw new ForbiddenException('Cannot reply to internal message');
      }
    }

    return this.repository.createMessage(orgId, dealRoomId, {
      authorUserId: author.userId || null,
      authorName: author.name || dto.authorName || 'Guest',
      authorEmail: author.email || dto.authorEmail || null,
      body: dto.body.trim(),
      visibility,
      parentId: dto.parentId || null,
    });
  }

  /**
   * Retrieves messages for a deal room.
   * If isExternalGuest is true, STRICTLY filters to 'external' messages at the SQL layer.
   */
  async getMessages(
    orgId: string,
    dealRoomId: string,
    options: {
      isExternalGuest?: boolean;
      visibilityFilter?: 'external' | 'all';
    },
  ) {
    const filter: 'external' | 'all' = options.isExternalGuest
      ? 'external'
      : options.visibilityFilter || 'all';

    return this.repository.findMessages(orgId, dealRoomId, filter);
  }

  async updateMessage(
    orgId: string,
    messageId: string,
    userId: string,
    body: string,
    isAdminOrManager = false,
  ) {
    const message = await this.repository.findMessageById(orgId, messageId);
    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (!isAdminOrManager && message.authorUserId !== userId) {
      throw new ForbiddenException('Cannot edit another user message');
    }

    return this.repository.updateMessage(orgId, messageId, body.trim());
  }

  async deleteMessage(orgId: string, messageId: string, userId: string, isAdminOrManager = false) {
    const message = await this.repository.findMessageById(orgId, messageId);
    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (!isAdminOrManager && message.authorUserId !== userId) {
      throw new ForbiddenException('Cannot delete another user message');
    }

    return this.repository.deleteMessage(orgId, messageId);
  }
}
