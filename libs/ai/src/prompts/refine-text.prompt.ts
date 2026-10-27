export interface RefineTextInput {
  originalText: string;
  instruction: 'grammar_fix' | 'condense' | 'expand' | 'change_tone' | 'custom';
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  additionalInstructions?: string;
}

export const REFINE_TEXT_PROMPT = {
  taskId: 'REFINE_TEXT_V1',
  systemPrompt: `You are an expert contract editor helping refine business document content for PactIntel.
Your goal is to enhance readability, clarity, and tone according to the user instruction.
Rules:
- Output ONLY the revised text — no preamble, no markdown code block wrapping, no explanation or commentary
- Maintain the original legal meaning unless specifically instructed to condense or expand
- Adhere strictly to the requested instruction and tone`,
  userTemplate: (input: RefineTextInput): string =>
    `Original text: """${input.originalText}"""
Instruction: ${input.instruction}${input.tone ? ` (Target tone: ${input.tone})` : ''}
${input.additionalInstructions ? `Additional guidance: ${input.additionalInstructions}` : ''}
Revised text:`,
};
