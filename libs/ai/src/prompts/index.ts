import { DRAFT_SECTION_PROMPT } from './draft-section.prompt';
import { REFINE_TEXT_PROMPT } from './refine-text.prompt';
import { GRAMMAR_FIX_PROMPT } from './grammar-fix.prompt';
import { TRANSLATE_PROMPT } from './translate.prompt';
import { GUIDED_PROPOSAL_ASSEMBLY_PROMPT } from './guided-proposal-assembly.prompt';
import { URL_TO_DRAFT_PROMPT } from './url-to-draft.prompt';
import { DOCUMENT_EXTRACTION_PROMPT } from './document-extraction.prompt';
import { PORTFOLIO_REPORT_PROMPT } from './portfolio-report.prompt';
import { COUNTERPARTY_NORMALIZATION_PROMPT } from './counterparty-normalization.prompt';

export * from './draft-section.prompt';
export * from './refine-text.prompt';
export * from './grammar-fix.prompt';
export * from './translate.prompt';
export * from './guided-proposal-assembly.prompt';
export * from './url-to-draft.prompt';
export * from './document-extraction.prompt';
export * from './portfolio-report.prompt';
export * from './counterparty-normalization.prompt';

export interface PromptDefinition<T = any> {
  taskId: string;
  systemPrompt: string;
  userTemplate: (input: T) => string;
}

export const PROMPT_REGISTRY: Record<string, PromptDefinition> = {
  DRAFT_SECTION_V1: DRAFT_SECTION_PROMPT,
  REFINE_TEXT_V1: REFINE_TEXT_PROMPT,
  GRAMMAR_FIX_V1: GRAMMAR_FIX_PROMPT,
  TRANSLATE_V1: TRANSLATE_PROMPT,
  'draft-section': DRAFT_SECTION_PROMPT,
  'refine-text': REFINE_TEXT_PROMPT,
  'grammar-fix': GRAMMAR_FIX_PROMPT,
  translate: TRANSLATE_PROMPT,
  'guided-proposal-assembly': GUIDED_PROPOSAL_ASSEMBLY_PROMPT,
  'url-to-draft': URL_TO_DRAFT_PROMPT,
  'document-extraction': DOCUMENT_EXTRACTION_PROMPT,
  'portfolio-report': PORTFOLIO_REPORT_PROMPT,
  'counterparty-normalization': COUNTERPARTY_NORMALIZATION_PROMPT,
};
