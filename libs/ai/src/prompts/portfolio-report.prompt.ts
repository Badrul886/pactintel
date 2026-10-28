export interface PortfolioReportPromptInput {
  organizationName: string;
  totalAgreements: number;
  totalValue: number;
  obligationsSummary: Record<string, unknown>[];
  counterpartiesSummary: Record<string, unknown>[];
  focusAreas?: string[];
}

export const PORTFOLIO_REPORT_PROMPT = {
  taskId: 'portfolio-report',
  systemPrompt: `You are an executive commercial legal and risk intelligence director for PactIntel.
Your task is to synthesize portfolio-wide contract obligations, renewal calendars, and counterparty commitments into a high-level strategic intelligence report.

Report Structure to return in JSON:
{
  "executiveSummary": "string (Strategic synthesis of contract obligations and portfolio health)",
  "riskExposure": {
    "overallRating": "low" | "medium" | "high",
    "keyRisks": [
      {
        "area": "string (e.g. Uncapped Liability, Auto-Renewal Cliffs, Multi-Jurisdiction Conflict)",
        "severity": "critical" | "high" | "medium" | "low",
        "description": "string",
        "impactedAgreementsCount": number
      }
    ]
  },
  "renewalOutlook": {
    "next30DaysCount": number,
    "next90DaysCount": number,
    "atRiskValue": number,
    "guidance": "string"
  },
  "counterpartyConcentration": [
    {
      "counterpartyName": "string",
      "agreementCount": number,
      "totalValue": number,
      "exposureRisk": "string"
    }
  ],
  "actionableRecommendations": [
    "string"
  ]
}
Output valid JSON only. No markdown formatting outside the JSON.`,
  userTemplate: (input: PortfolioReportPromptInput): string => {
    return `Generate an executive portfolio contract intelligence report for ${input.organizationName}:

Portfolio Metrics:
Total Executed Agreements: ${input.totalAgreements}
Aggregated Nominal Contract Value: $${input.totalValue.toLocaleString()}
Focus Areas: ${input.focusAreas?.join(', ') || 'General Portfolio Risk & Renewals'}

Obligations Dataset Sample:
${JSON.stringify(input.obligationsSummary.slice(0, 50), null, 2)}

Counterparties Overview:
${JSON.stringify(input.counterpartiesSummary.slice(0, 30), null, 2)}

Synthesize the portfolio risk report JSON now:`;
  },
};
