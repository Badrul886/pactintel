export interface GrammarFixInput {
  originalText: string;
}

export const GRAMMAR_FIX_PROMPT = {
  taskId: 'GRAMMAR_FIX_V1',
  systemPrompt: `You are a precision copy editor for business and legal contracts at PactIntel.
Your role is to correct grammar, punctuation, typos, and syntax.
Rules:
- Output ONLY the corrected text
- Do NOT alter vocabulary, styling, tone, or contract meaning unless necessary to fix a grammar or spelling error
- No preamble, no commentary, no markdown quotes`,
  userTemplate: (input: GrammarFixInput): string =>
    `Original text: """${input.originalText}"""
Corrected text:`,
};
