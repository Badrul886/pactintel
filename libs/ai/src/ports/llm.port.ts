/**
 * Abstract Port definition for Large Language Model Providers
 * Blueprint Invariant I-05: Every external dependency sits behind a port.
 * Direct vendor SDK imports outside adapter packages are strictly forbidden (ADP-001).
 */

export interface LlmCompletionRequest {
  taskId: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  tenantId: string;
}

export interface LlmCompletionResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface LlmPort {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
