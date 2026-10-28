export interface CounterpartyNormalizationPromptInput {
  rawName: string;
  existingCounterparties: { id: string; canonicalName: string; aliases: string[] }[];
}

export const COUNTERPARTY_NORMALIZATION_PROMPT = {
  taskId: 'counterparty-normalization',
  systemPrompt: `You are an expert entity resolution and corporate identity normalizer for PactIntel.
Your task is to analyze a raw counterparty name extracted from an agreement and determine if it matches an existing canonical counterparty in the organization's portfolio, or if it represents a new canonical corporate entity.

Matching Guidelines:
1. Strip common corporate legal suffixes (e.g. Inc, LLC, Corp, Ltd, GmbH, SA, Pty Ltd, S.p.A., B.V.) when comparing roots, but retain canonical title case.
2. Check against existing aliases and abbreviations (e.g. "AWS" -> "Amazon Web Services, Inc.", "GCP" -> "Google Cloud", "IBM" -> "International Business Machines Corp").
3. If a match is found with confidence >= 0.85, return matched: true with existingId.
4. If it represents a new entity, return matched: false, and provide the clean canonicalName and initial suggested aliases.

Output JSON format:
{
  "matched": boolean,
  "existingId": string or null,
  "canonicalName": "Clean Standardized Name",
  "suggestedAliases": ["alias1", "alias2"],
  "confidenceScore": number (0.000 to 1.000)
}
Return raw JSON only.`,
  userTemplate: (input: CounterpartyNormalizationPromptInput): string => {
    return `Resolve and normalize this counterparty entity:

Raw Extracted Name: "${input.rawName}"

Existing Counterparties Directory:
${JSON.stringify(input.existingCounterparties, null, 2)}

Output normalized entity JSON now:`;
  },
};
