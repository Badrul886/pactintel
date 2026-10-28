export interface GuidedProposalAssemblyInput {
  templateTitle?: string;
  templateContent?: Record<string, unknown> | string;
  answers: Record<string, unknown>;
  crmData?: Record<string, unknown>;
  variableTags?: Record<string, unknown>;
}

export const GUIDED_PROPOSAL_ASSEMBLY_PROMPT = {
  taskId: 'guided-proposal-assembly',
  systemPrompt: `You are an elite enterprise proposal and commercial contract architect for PactIntel.
Your task is to synthesize user intake questionnaire answers, live CRM customer/deal context, and template requirements into a comprehensive, persuasive, and legally sound business proposal.

Formatting and Output Instructions:
1. Output valid JSON representing a complete Tiptap document:
   {
     "type": "doc",
     "content": [ ... ]
   }
2. The proposal document must contain standard enterprise proposal sections:
   - Header / Title section
   - Executive Summary (tailored to the customer's problem and goals)
   - Proposed Scope of Work & Deliverables
   - Timeline & Milestones
   - Commercial Pricing & Terms
   - Next Steps / Acceptance
3. When using content nodes, use standard Tiptap nodes:
   - "heading" with attrs { "level": 1 | 2 | 3 }
   - "paragraph" with "text" nodes
   - "bulletList", "orderedList", "listItem"
   - "table", "tableRow", "tableHeader", "tableCell" for pricing or timeline tables
4. Do NOT include markdown code blocks, preamble, explanation, or conversational commentary outside the JSON. Return raw valid JSON only.`,
  userTemplate: (input: GuidedProposalAssemblyInput): string => {
    const serializedAnswers = JSON.stringify(input.answers ?? {}, null, 2);
    const serializedCrm = JSON.stringify(input.crmData ?? {}, null, 2);
    const serializedTags = JSON.stringify(input.variableTags ?? {}, null, 2);
    const templateContext =
      typeof input.templateContent === 'string'
        ? input.templateContent
        : JSON.stringify(input.templateContent ?? {}, null, 2);

    return `Please assemble a commercial proposal based on the following context:

Template: ${input.templateTitle ?? 'Standard Commercial Proposal'}
Template Structure:
${templateContext}

User Questionnaire Answers:
${serializedAnswers}

CRM Deal & Customer Context:
${serializedCrm}

Variable Tag Mappings:
${serializedTags}

Assemble the complete Tiptap JSON document now:`;
  },
};
