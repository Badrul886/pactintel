import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { LlmPort, PROMPT_REGISTRY, LlmCompletionResponse } from '@pactintel/ai';
import { AiRepository } from '../ai.repository';
import { OrganizationService } from '../../organization/organization.service';
import { generateId } from '@pactintel/shared-utils';
import * as crypto from 'crypto';
import {
  VERTEX_AI_EU_ENDPOINT,
  VERTEX_AI_US_ENDPOINT,
} from '../adapters/vertex-ai/vertex-ai.adapter';

export interface AiGatewayContext {
  userId: string;
  organizationId: string;
  workspaceId?: string;
  documentId?: string;
  crmFieldsAccessed?: string[];
  contentVariationType?: string;
}

export interface AiGatewayResult {
  content: string;
  taskId: string;
  tokensUsed: number;
}

@Injectable()
export class AiGateway {
  private readonly logger = new Logger(AiGateway.name);

  constructor(
    @Inject('LLM_PORT') private readonly llmPort: LlmPort,
    private readonly aiRepository: AiRepository,
    private readonly orgService: OrganizationService,
  ) {}

  /**
   * Central gateway for all AI tasks in the platform.
   * Enforces server-side guardrails (AI-003), regional data residency (I-14),
   * prompt registry lookup (A6.7), and immutable token accounting/logging (AI-002).
   */
  async generate(
    taskId: string,
    input: Record<string, unknown>,
    context: AiGatewayContext,
  ): Promise<AiGatewayResult> {
    // 1. RULE AI-003: Server-side guardrail checks
    const guardrails = await this.orgService.getAiGuardrails(context.organizationId);

    // a. Kill switch
    if (guardrails.killSwitch || guardrails.disabled) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        violated_rule: 'kill_switch',
        message: 'AI features are disabled for your organization',
      });
    }

    // b. Workspace restriction
    if (context.workspaceId && guardrails.excludedWorkspaceIds?.includes(context.workspaceId)) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        violated_rule: 'workspace_restriction',
        message: `AI features are restricted in workspace '${context.workspaceId}'`,
      });
    }

    // c. Data source restriction (CRM fields)
    if (context.crmFieldsAccessed && context.crmFieldsAccessed.length > 0) {
      const disallowed = context.crmFieldsAccessed.filter((field) => {
        if (guardrails.disallowedCrmFields?.includes(field)) return true;
        if (
          guardrails.allowedCrmFields &&
          guardrails.allowedCrmFields.length > 0 &&
          !guardrails.allowedCrmFields.includes(field)
        ) {
          return true;
        }
        return false;
      });
      if (disallowed.length > 0) {
        throw new ForbiddenException({
          code: 'AI_GUARDRAIL_VIOLATION',
          violated_rule: 'data_source_restriction',
          message: `AI cannot access restricted CRM fields: ${disallowed.join(', ')}`,
        });
      }
    }

    // d. Content variation restriction
    if (
      context.contentVariationType &&
      guardrails.allowedContentVariationTypes &&
      guardrails.allowedContentVariationTypes.length > 0
    ) {
      if (!guardrails.allowedContentVariationTypes.includes(context.contentVariationType)) {
        throw new ForbiddenException({
          code: 'AI_GUARDRAIL_VIOLATION',
          violated_rule: 'content_variation_restriction',
          message: `AI content variation type '${context.contentVariationType}' is restricted by organization policy`,
        });
      }
    }

    // e. Document restriction
    if (context.documentId && guardrails.excludedDocumentIds?.includes(context.documentId)) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        violated_rule: 'document_exclusion',
        message: 'AI is not permitted for this document',
      });
    }

    // 2. RULE I-14 & EC-AI-02: Route to correct regional endpoint
    const region = await this.orgService.getCellRegion(context.organizationId);
    const endpoint = region === 'eu' ? VERTEX_AI_EU_ENDPOINT : VERTEX_AI_US_ENDPOINT;

    // 3. RULE A6.7: Build prompt from prompt registry (NEVER inline in application code)
    const promptDef = PROMPT_REGISTRY[taskId];
    if (!promptDef) {
      throw new BadRequestException(`Unknown AI task: ${taskId}`);
    }

    const prompt = promptDef.userTemplate(input);
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex');

    const startMs = Date.now();
    let result: LlmCompletionResponse | undefined;
    let status: 'success' | 'error' | 'rejected' = 'success';
    let errorCode: string | undefined;

    try {
      result = await this.llmPort.generate({
        taskId,
        systemPrompt: promptDef.systemPrompt,
        userPrompt: prompt,
        endpoint,
        maxTokens: 2048,
        temperature: 0.3,
        tenantId: context.organizationId,
      });

      return {
        content: result.content,
        taskId,
        tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      };
    } catch (err: any) {
      status = 'error';
      errorCode = err.code || err.name || 'UNKNOWN';
      this.logger.error(`[AiGateway] Generation error for task ${taskId}: ${err.message}`);
      throw err;
    } finally {
      // 4. RULE AI-002: Log every generation attempt with SHA-256 promptHash (NEVER plaintext)
      const latencyMs = Date.now() - startMs;
      try {
        await this.aiRepository.logGeneration({
          id: generateId(),
          organizationId: context.organizationId,
          documentId: context.documentId,
          userId: context.userId,
          taskId,
          promptHash,
          tokensInput: result?.usage?.inputTokens,
          tokensOutput: result?.usage?.outputTokens,
          latencyMs,
          status,
          errorCode,
        });
      } catch (logErr: any) {
        this.logger.error(`[AiGateway] Failed to write AI generation audit log: ${logErr.message}`);
      }
    }
  }

  /**
   * Generates public/unauthenticated AI tasks (e.g. URL-to-Draft) strictly without database writes (ephemeral).
   * RULE A6.7: Uses PROMPT_REGISTRY.
   */
  async generatePublic(taskId: string, input: Record<string, unknown>): Promise<AiGatewayResult> {
    const promptDef = PROMPT_REGISTRY[taskId];
    if (!promptDef) {
      throw new BadRequestException(`Unknown AI task: ${taskId}`);
    }

    const prompt = promptDef.userTemplate(input);
    const endpoint =
      process.env.CELL_REGION === 'eu' ? VERTEX_AI_EU_ENDPOINT : VERTEX_AI_US_ENDPOINT;

    const result = await this.llmPort.generate({
      taskId,
      systemPrompt: promptDef.systemPrompt,
      userPrompt: prompt,
      endpoint,
      maxTokens: 2048,
      temperature: 0.3,
      tenantId: 'public',
    });

    return {
      content: result.content,
      taskId,
      tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    };
  }
}
