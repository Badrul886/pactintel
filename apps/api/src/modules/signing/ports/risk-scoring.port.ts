import { RiskContext, RiskScoreResult } from '@pactintel/shared-types';

export const RISK_SCORING_PORT = Symbol('RISK_SCORING_PORT');

export interface RiskCircuitBreakerStatus {
  isOpen: boolean;
  failureCount: number;
  lastFailureAt?: Date;
  trippedAt?: Date;
  cooldownRemainingMs: number;
}

export interface RiskScoringPort {
  readonly providerName: string;

  /**
   * Evaluates fraud and identity spoofing risk for a signer in a transaction context.
   * Calculates a score between 0.0 (low) and 1.0 (high) mapped to verification tiers.
   */
  computeRiskScore(context: RiskContext): Promise<RiskScoreResult>;

  /**
   * RULE RISK-001 Circuit Breaker management for the risk scoring provider.
   */
  getCircuitBreakerStatus(): RiskCircuitBreakerStatus;
  resetCircuitBreaker(): void;
  recordFailure(): void;
  recordSuccess(): void;
}
