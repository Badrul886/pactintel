import { LlmPort, LlmCompletionRequest, LlmCompletionResponse } from './ports/llm.port';

/**
 * AiGateway
 * Central gateway for all AI tasks in the platform.
 * Application code calls this gateway using Task IDs only — never model or provider names (AI-004).
 */
export class AiGateway {
  constructor(private readonly llmAdapter: LlmPort) {}

  async executeTask(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!request.tenantId) {
      throw new Error('AiGateway: tenantId is strictly required for isolation (A6.8, AI-014)');
    }
    if (this.llmAdapter.complete) {
      return this.llmAdapter.complete(request);
    }
    return this.llmAdapter.generate(request);
  }
}
