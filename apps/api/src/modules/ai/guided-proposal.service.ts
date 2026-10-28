import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiGateway } from './gateway/ai.gateway';
import { OrganizationService } from '../organization/organization.service';
import { IntegrationService } from '../integration/integration.service';
import {
  AssembleProposalDto,
  AssembledProposalResponseDto,
  TemplateVariableField,
} from '@pactintel/shared-types';

/**
 * Recursively tags all Tiptap block elements with createdBy: 'ai'.
 * Enforces RULE AI-002: AI content must be explicitly tagged for review and acceptance.
 */
export function tagNodesWithAiMetadata(node: any): any {
  if (!node || typeof node !== 'object') return node;
  const clone = Array.isArray(node) ? [...node] : { ...node };

  if (clone.type && clone.type !== 'doc' && clone.type !== 'text') {
    clone.attrs = {
      ...(clone.attrs || {}),
      createdBy: 'ai',
    };
    clone.metadata = {
      ...(clone.metadata || {}),
      createdBy: 'ai',
    };
  }

  if (Array.isArray(clone.content)) {
    clone.content = clone.content.map(tagNodesWithAiMetadata);
  }

  return clone;
}

@Injectable()
export class GuidedProposalService {
  private readonly logger = new Logger(GuidedProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGateway,
    private readonly orgService: OrganizationService,
    private readonly integrationService: IntegrationService,
  ) {}

  /**
   * Assembles a structured proposal document from intake questions, template, and live CRM data.
   * Strict adherence to:
   * - Invariant I-12: Graceful CRM degradation
   * - RULE AI-002: Content tagged createdBy: 'ai'
   * - RULE AI-003: Server-side guardrails
   * - RULE AI-004: Task ID 'guided-proposal-assembly' only
   */
  async assembleProposal(
    organizationId: string,
    userId: string,
    dto: AssembleProposalDto,
  ): Promise<AssembledProposalResponseDto> {
    // 1. RULE AI-003: AI guardrails check BEFORE calling LLM
    const guardrails = await this.orgService.getAiGuardrails(organizationId);
    if (guardrails.disabled) {
      throw new ForbiddenException({
        code: 'AI_GUARDRAIL_VIOLATION',
        message: 'AI features are disabled for your organization',
      });
    }

    // 2. Fetch template
    const template = await this.prisma.template.findFirst({
      where: {
        id: dto.templateId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID ${dto.templateId} not found`);
    }

    // 3. Validate answers against intake questions in template.variableFields
    const intakeQuestions = (
      Array.isArray(template.variableFields)
        ? (template.variableFields as unknown as TemplateVariableField[])
        : []
    ) as TemplateVariableField[];

    this.validateIntakeAnswers(intakeQuestions, dto.answers);

    // 4. CRM Data Pull at Build Time with Graceful Degradation (Invariant I-12)
    let crmData: Record<string, any> = {};
    let crmWarning: string | null = null;

    if (dto.crmEntityId) {
      try {
        crmData = await this.integrationService.fetchCrmEntityData(organizationId, dto.crmEntityId);
      } catch (err: any) {
        this.logger.warn(
          `[GuidedProposalService] CRM fetch failed for entity ${dto.crmEntityId}: ${err.message}. Degrading gracefully (Invariant I-12).`,
        );
        crmWarning = 'CRM data could not be retrieved. Placeholders were used instead.';
        crmData = {
          deal_name: '{{deal_name}}',
          deal_amount: '{{deal_amount}}',
          company_name: '{{company_name}}',
          contact_name: '{{contact_name}}',
          contact_email: '{{contact_email}}',
          close_date: '{{close_date}}',
          entity_id: dto.crmEntityId,
        };
      }
    }

    // 5. AI Assembly via AiGateway using Task ID (RULE AI-004)
    const aiResult = await this.aiGateway.generate(
      'guided-proposal-assembly',
      {
        templateTitle: template.title,
        templateContent: template.content as Record<string, unknown>,
        answers: dto.answers,
        crmData,
        variableTags: template.variableFields,
      },
      {
        userId,
        organizationId,
      },
    );

    // 6. Process AI Output & Tag Blocks with createdBy: 'ai' (RULE AI-002)
    const rawContent = this.parseAiOutputAsTiptap(aiResult.content, template.title);
    const taggedContent = tagNodesWithAiMetadata(rawContent);

    return {
      title: dto.title || `${template.title} - Proposal`,
      content: taggedContent,
      crmDataUsed: crmData,
      crmWarning,
      tokensUsed: aiResult.tokensUsed,
    };
  }

  private validateIntakeAnswers(
    questions: TemplateVariableField[],
    answers: Record<string, any>,
  ): void {
    for (const q of questions) {
      // Check conditional dependency
      if (q.dependsOn) {
        const dependentVal = answers[q.dependsOn.questionId];
        let conditionMet = false;
        if (q.dependsOn.operator === 'equals') {
          conditionMet = dependentVal === q.dependsOn.value;
        } else if (q.dependsOn.operator === 'not_equals') {
          conditionMet = dependentVal !== q.dependsOn.value;
        } else if (q.dependsOn.operator === 'contains') {
          conditionMet = Array.isArray(dependentVal) && dependentVal.includes(q.dependsOn.value);
        } else if (q.dependsOn.operator === 'is_truthy') {
          conditionMet = Boolean(dependentVal);
        }

        if (!conditionMet) {
          continue; // Question is hidden/not required
        }
      }

      if (q.required) {
        const val = answers[q.key] ?? answers[q.id || ''];
        if (val === undefined || val === null || val === '') {
          throw new BadRequestException(`Missing required intake answer for "${q.label || q.key}"`);
        }
      }
    }
  }

  private parseAiOutputAsTiptap(content: string, fallbackTitle: string): Record<string, unknown> {
    try {
      // Strip markdown code block if model wrapped JSON in ```json ... ```
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.type === 'doc' && Array.isArray(parsed.content)) {
        return parsed;
      }
      if (parsed && parsed.content && parsed.content.type === 'doc') {
        return parsed.content;
      }
    } catch {
      // If parsing fails, wrap the generated text as a paragraph inside a standard Tiptap doc
    }

    return {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: `${fallbackTitle} - Proposal` }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: content }],
        },
      ],
    };
  }
}
