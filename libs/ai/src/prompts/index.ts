import { DRAFT_SECTION_PROMPT } from './draft-section.prompt';
import { REFINE_TEXT_PROMPT } from './refine-text.prompt';
import { GRAMMAR_FIX_PROMPT } from './grammar-fix.prompt';
import { TRANSLATE_PROMPT } from './translate.prompt';

export * from './draft-section.prompt';
export * from './refine-text.prompt';
export * from './grammar-fix.prompt';
export * from './translate.prompt';

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
};
