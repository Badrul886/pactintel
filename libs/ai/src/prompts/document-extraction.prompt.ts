export interface CustomFieldSpec {
  fieldName: string;
  description: string;
  fieldType: 'text' | 'numeric' | 'date' | 'boolean' | 'list';
}

export interface DocumentExtractionPromptInput {
  documentTitle: string;
  documentText: string;
  customFields?: CustomFieldSpec[];
}

export const DOCUMENT_EXTRACTION_PROMPT = {
  taskId: 'document-extraction',
  systemPrompt: `You are an elite legal-tech contract extraction intelligence engine for PactIntel.
Your task is to analyze the provided contract text and extract high-precision commercial terms, legal covenants, and operational obligations.

Rules:
1. Extract both standard contractual fields and any requested custom fields.
2. Standard fields to identify where present:
   - counterparty_name (text: canonical legal entity name of the counterparty)
   - effective_date (date: ISO YYYY-MM-DD)
   - expiration_date (date: ISO YYYY-MM-DD)
   - renewal_notice_period_days (numeric: days notice required prior to renewal)
   - auto_renewal (boolean: true/false)
   - contract_value (numeric: total nominal or annual contract value)
   - payment_terms (text: e.g. "Net 30 days upon invoice")
   - governing_law (text: jurisdiction/state/country governing the agreement)
   - limitation_of_liability_cap (text: e.g. "12 months fees paid" or numeric amount)
   - indemnification_obligations (text: summary of indemnified claims)
   - termination_for_convenience (boolean: true/false)
   - termination_notice_period_days (numeric: days notice for convenience termination)
   - confidentiality_term_years (numeric: survival duration of confidentiality)
   - audit_rights (boolean: true/false)
3. For each field, compute an objective confidence score between 0.000 and 1.000 based on text clarity.
4. Output valid JSON in the exact format:
{
  "counterparty": {
    "name": "Canonical Counterparty Name",
    "domain": "optional-domain.com",
    "aliases": ["Alternative Name 1", "DBA Name"]
  },
  "obligations": [
    {
      "fieldName": "string",
      "fieldValue": "string representation",
      "fieldValueNumeric": 12345.67 or null,
      "fieldValueDate": "2026-12-31T00:00:00.000Z" or null,
      "fieldType": "text" | "numeric" | "date" | "boolean" | "list",
      "confidenceScore": 0.950,
      "isCustomField": false
    }
  ]
}
5. Do NOT output markdown code blocks or text outside the JSON. Return raw JSON only.`,
  userTemplate: (input: DocumentExtractionPromptInput): string => {
    const customFieldsSection =
      input.customFields && input.customFields.length > 0
        ? `\nActive Custom Fields to Extract:\n${JSON.stringify(input.customFields, null, 2)}\n`
        : '';

    return `Analyze this agreement and extract all structured obligations and counterparty data:

Document Title: ${input.documentTitle}
${customFieldsSection}
Contract Text:
${input.documentText}

Extract obligations JSON now:`;
  },
};
