import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DealRoomRepository } from './deal-room.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DealRoomDocumentService {
  constructor(
    private readonly repository: DealRoomRepository,
    private readonly prisma: PrismaService,
  ) {}

  async addDocument(orgId: string, dealRoomId: string, documentId: string, addedBy: string) {
    const room = await this.repository.findDealRoomById(orgId, dealRoomId);
    if (!room) {
      throw new NotFoundException(`Deal room ${dealRoomId} not found`);
    }

    // Verify document exists and belongs to the same organization
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        organizationId: orgId,
      },
    });

    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found in this organization`);
    }

    // Check if already linked
    const existing = await this.prisma.dealRoomDocument.findFirst({
      where: {
        dealRoomId,
        documentId,
        organizationId: orgId,
      },
    });

    if (existing) {
      throw new ConflictException(`Document ${documentId} is already linked to this deal room`);
    }

    return this.repository.addDocument(orgId, dealRoomId, documentId, addedBy);
  }

  async getDocuments(orgId: string, dealRoomId: string) {
    return this.repository.findDocuments(orgId, dealRoomId);
  }

  async removeDocument(orgId: string, dealRoomId: string, docId: string) {
    return this.repository.removeDocument(orgId, dealRoomId, docId);
  }
}
