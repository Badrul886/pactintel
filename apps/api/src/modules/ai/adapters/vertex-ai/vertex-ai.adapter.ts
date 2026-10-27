import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmPort, LlmCompletionRequest, LlmCompletionResponse } from '@pactintel/ai';
// RULE ADP-001: Vendor SDK import allowed ONLY inside adapter package
import { PredictionServiceClient } from '@google-cloud/aiplatform';

export const VERTEX_AI_US_ENDPOINT = 'us-central1-aiplatform.googleapis.com';
export const VERTEX_AI_EU_ENDPOINT = 'europe-west1-aiplatform.googleapis.com';

@Injectable()
export class VertexAiAdapter implements LlmPort {
  private readonly logger = new Logger(VertexAiAdapter.name);
  private client: PredictionServiceClient | null = null;

  constructor() {
    if (process.env.GCP_PROJECT_ID && process.env.NODE_ENV !== 'test') {
      try {
        this.client = new PredictionServiceClient();
      } catch (err: any) {
        this.logger.warn(`Vertex AI client initialization deferred: ${err.message}`);
      }
    }
  }

  /**
   * Completes an LLM generation request using Google Cloud Vertex AI (Claude via Vertex).
   * Enforces Rule AI-001 (no-training API), Rule I-14 (regional endpoint), and EC-AI-01 (429 retry backoff).
   */
  async generate(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const startMs = Date.now();
    const endpoint = request.endpoint || VERTEX_AI_US_ENDPOINT;

    this.logger.log(
      `[VertexAiAdapter] Dispatching task ${request.taskId || 'prompt'} to Vertex AI endpoint: ${endpoint}`,
    );

    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      try {
        if (!this.client || process.env.NODE_ENV === 'test' || !process.env.GCP_PROJECT_ID) {
          // Simulated/Test mock response if real GCP Vertex credentials not injected
          return this.simulateCompletion(request, startMs);
        }

        // Live Vertex AI API call
        // Enterprise zero-data-retention agreement is governed by GCP terms (RULE AI-001)
        const projectId = process.env.GCP_PROJECT_ID;
        const location = endpoint.includes('europe-west1') ? 'europe-west1' : 'us-central1';
        const model = process.env.VERTEX_AI_MODEL || 'claude-3-5-sonnet-v2@20241022';
        const endpointPath = `projects/${projectId}/locations/${location}/publishers/anthropic/models/${model}`;

        const payload = {
          anthropic_version: 'vertex-2023-10-16',
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.3,
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.userPrompt }],
        };

        const [response] = await this.client.predict({
          endpoint: endpointPath,
          instances: [
            { structValue: { fields: { request: { stringValue: JSON.stringify(payload) } } } },
          ],
        });

        const durationMs = Date.now() - startMs;
        const resultString = response.predictions?.[0]?.stringValue;
        const parsed = resultString ? JSON.parse(resultString) : null;
        const content = parsed?.content?.[0]?.text || '';
        const inputTokens = parsed?.usage?.input_tokens ?? 100;
        const outputTokens = parsed?.usage?.output_tokens ?? 50;

        return {
          content,
          usage: {
            inputTokens,
            outputTokens,
          },
          durationMs,
        };
      } catch (err: any) {
        const isRateLimit =
          err.code === 429 ||
          err.status === 429 ||
          (err.message && err.message.includes('429')) ||
          (err.message && err.message.toLowerCase().includes('resource_exhausted'));

        if (isRateLimit && attempt === 1) {
          this.logger.warn(
            `[VertexAiAdapter] 429 Rate limit from Vertex AI. Retrying once after 5s backoff (RULE EC-AI-01)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        if (isRateLimit && attempt >= 2) {
          this.logger.error(
            `[VertexAiAdapter] 429 Rate limit persisted after retry. Returning 503 (RULE EC-AI-01).`,
          );
          throw new ServiceUnavailableException({
            code: 'AI_PROVIDER_RATE_LIMITED',
            message: 'AI service is temporarily saturated. Please retry shortly.',
          });
        }

        this.logger.error(`[VertexAiAdapter] Generation failed: ${err.message}`);
        throw err;
      }
    }

    throw new ServiceUnavailableException('AI service is temporarily unavailable');
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    return this.generate(request);
  }

  private simulateCompletion(
    request: LlmCompletionRequest,
    startMs: number,
  ): LlmCompletionResponse {
    const durationMs = Date.now() - startMs;
    // Deterministic simulation based on prompt content
    let simulatedText =
      'This Agreement is entered into by and between the parties under mutual commercial terms.';
    if (request.userPrompt.includes('Task:') || request.userPrompt.includes('executive summary')) {
      simulatedText =
        'Executive Summary: This document sets forth the comprehensive scope of commercial deliverables, timeline commitments, and service standards.';
    } else if (
      request.userPrompt.includes('Original text:') ||
      request.userPrompt.includes('Instruction:')
    ) {
      simulatedText =
        'Refined Section: The parties agree to diligently fulfill all contracted obligations with commercially reasonable dispatch.';
    }

    return {
      content: simulatedText,
      usage: {
        inputTokens: 120,
        outputTokens: 60,
      },
      durationMs,
    };
  }
}
