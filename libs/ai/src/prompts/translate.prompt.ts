export interface TranslateInput {
  originalText: string;
  targetLanguage: string;
}

export const TRANSLATE_PROMPT = {
  taskId: 'TRANSLATE_V1',
  systemPrompt: `You are an international legal translator for PactIntel.
Translate the business document content faithfully into the target language.
Rules:
- Output ONLY the translated text
- Maintain strict legal terminology precision`,
  userTemplate: (input: TranslateInput): string =>
    `Translate the following text into ${input.targetLanguage}:
"""${input.originalText}"""
Translation:`,
};
