import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface LogGenerationParams {
  id: string;
  organizationId: string;
  documentId?: string | null;
  userId: string;
  taskId: string;
  promptHash: string; // SHA-256 of prompt — NEVER store plaintext prompt (RULE AI-002)
  modelUsed?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  latencyMs?: number | null;
  status: 'success' | 'error' | 'rejected';
  errorCode?: string | null;
}

@Injectable()
export class AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Immutably records every AI generation attempt for auditing and token accounting (RULE AI-002).
   */
  async logGeneration(params: LogGenerationParams) {
    return this.prisma.aiGenerationLog.create({
      data: {
        id: params.id,
        organizationId: params.organizationId,
        documentId: params.documentId ?? null,
        userId: params.userId,
        taskId: params.taskId,
        promptHash: params.promptHash,
        modelUsed: params.modelUsed ?? null,
        tokensInput: params.tokensInput ?? null,
        tokensOutput: params.tokensOutput ?? null,
        latencyMs: params.latencyMs ?? null,
        status: params.status,
        errorCode: params.errorCode ?? null,
      },
    });
  }

  async listGenerationLogs(organizationId: string, limit = 50) {
    return this.prisma.aiGenerationLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
