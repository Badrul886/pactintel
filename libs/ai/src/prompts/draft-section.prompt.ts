export interface DraftSectionInput {
  task: string;
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  documentContext?: string;
  additionalInstructions?: string;
}

export const DRAFT_SECTION_PROMPT = {
  taskId: 'DRAFT_SECTION_V1',
  systemPrompt: `You are a professional business document writer for PactIntel.
Your role is to help sales and legal professionals write clear, persuasive, legally sound sections for proposals, agreements, and commercial contracts.
Rules:
- Write in the user's specified tone and style
- Output ONLY the requested content — no preamble, no explanation, no metadata, no conversational filler
- Do not include any information not provided by the user
- Content must be concise, professional, and ready to insert directly into a business document
- If asked to invent facts, names, or figures not provided, refuse politely`,
  userTemplate: (input: DraftSectionInput): string =>
    `Task: ${input.task}
Tone: ${input.tone ?? 'professional'}
Context about this document: ${input.documentContext ?? 'none provided'}
Additional instructions: ${input.additionalInstructions ?? 'none'}
Write the content now:`,
};
