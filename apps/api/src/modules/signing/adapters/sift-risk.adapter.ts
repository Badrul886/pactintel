import { Injectable, Logger } from '@nestjs/common';
import { RiskScoringPort, RiskCircuitBreakerStatus } from '../ports/risk-scoring.port';
import { RiskContext, RiskScoreResult } from '@pactintel/shared-types';

export class RiskCircuitBreakerOpenException extends Error {
  readonly code = 'RISK_CIRCUIT_BREAKER_OPEN';
  constructor(message = 'Risk scoring circuit breaker is OPEN due to repeated outages.') {
    super(message);
    this.name = 'RiskCircuitBreakerOpenException';
  }
}

export class RiskScoringTimeoutException extends Error {
  readonly code = 'RISK_PROVIDER_TIMEOUT';
  constructor(message = 'Risk scoring vendor request timed out after 5000ms.') {
    super(message);
    this.name = 'RiskScoringTimeoutException';
  }
}

interface CircuitBreakerState {
  failureTimestamps: number[];
  isOpen: boolean;
  trippedAt?: number;
}

@Injectable()
export class SiftRiskScoringAdapter implements RiskScoringPort {
  readonly providerName = 'sift';
  private readonly logger = new Logger(SiftRiskScoringAdapter.name);

  // Circuit Breaker constants per RULE RISK-001
  private readonly FAILURE_THRESHOLD = 5;
  private readonly WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  private readonly TIMEOUT_MS = 5000; // 5000ms SLA timeout

  private cbState: CircuitBreakerState = {
    failureTimestamps: [],
    isOpen: false,
    trippedAt: undefined,
  };

  // Known disposable / suspicious email domains for anti-fraud heuristic
  private readonly disposableDomains = new Set([
    'tempmail.com',
    'mailinator.com',
    'guerrillamail.com',
    '10minutemail.com',
    'throwawaymail.com',
    'disposable.com',
    'fakeinbox.com',
    'sharklasers.com',
  ]);

  // ---------------------------------------------------------------------------
  // Circuit Breaker Management (RULE RISK-001)
  // ---------------------------------------------------------------------------

  getCircuitBreakerStatus(): RiskCircuitBreakerStatus {
    this.evaluateCircuitBreakerState();
    const now = Date.now();
    let cooldownRemainingMs = 0;

    if (this.cbState.isOpen && this.cbState.trippedAt) {
      cooldownRemainingMs = Math.max(0, this.cbState.trippedAt + this.COOLDOWN_MS - now);
    }

    return {
      isOpen: this.cbState.isOpen,
      failureCount: this.cbState.failureTimestamps.length,
      lastFailureAt: this.cbState.failureTimestamps.length
        ? new Date(this.cbState.failureTimestamps[this.cbState.failureTimestamps.length - 1])
        : undefined,
      trippedAt: this.cbState.trippedAt ? new Date(this.cbState.trippedAt) : undefined,
      cooldownRemainingMs,
    };
  }

  resetCircuitBreaker(): void {
    this.cbState = {
      failureTimestamps: [],
      isOpen: false,
      trippedAt: undefined,
    };
    this.logger.log('[RiskCircuitBreaker] Reset to CLOSED state.');
  }

  recordFailure(): void {
    const now = Date.now();
    this.cbState.failureTimestamps = this.cbState.failureTimestamps.filter(
      (ts) => now - ts < this.WINDOW_MS,
    );
    this.cbState.failureTimestamps.push(now);

    this.logger.warn(
      `[RiskCircuitBreaker] Failure recorded. Count in window: ${this.cbState.failureTimestamps.length}/${this.FAILURE_THRESHOLD}`,
    );

    if (this.cbState.failureTimestamps.length >= this.FAILURE_THRESHOLD) {
      this.cbState.isOpen = true;
      this.cbState.trippedAt = now;
      this.logger.error(
        `[RiskCircuitBreaker] TRIP OPEN! ${this.FAILURE_THRESHOLD} failures in 10m. Open for 30m.`,
      );
    }
  }

  recordSuccess(): void {
    if (this.cbState.isOpen) {
      this.logger.log('[RiskCircuitBreaker] Successful call while open. Resetting to CLOSED.');
      this.resetCircuitBreaker();
    } else if (this.cbState.failureTimestamps.length > 0) {
      this.cbState.failureTimestamps.shift();
    }
  }

  private evaluateCircuitBreakerState(): void {
    if (!this.cbState.isOpen) return;

    const now = Date.now();
    if (this.cbState.trippedAt && now - this.cbState.trippedAt >= this.COOLDOWN_MS) {
      this.logger.log('[RiskCircuitBreaker] Cooldown expired. Transitioning to HALF-OPEN.');
      this.cbState.isOpen = false;
      this.cbState.trippedAt = undefined;
      this.cbState.failureTimestamps = [];
    }
  }

  /**
   * Determine whether the adapter runs in mock simulation or live network mode.
   * Defensively returns true in tests, under Jest workers, or when placeholder keys are used.
   */
  private isMockMode(apiKey?: string): boolean {
    if (!apiKey) return true;
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.JEST_WORKER_ID !== undefined) return true;
    if (process.env.SIFT_MOCK === 'true' || process.env.RISK_SCORING_MOCK === 'true') return true;
    if (
      apiKey.includes('placeholder') ||
      apiKey.includes('test') ||
      apiKey.startsWith('mock_') ||
      apiKey === 'sift_local_placeholder'
    ) {
      return true;
    }
    return false;
  }

  private async executeWithProtection<T>(action: () => Promise<T>): Promise<T> {
    this.evaluateCircuitBreakerState();

    if (this.cbState.isOpen) {
      throw new RiskCircuitBreakerOpenException();
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new RiskScoringTimeoutException());
      }, this.TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([action(), timeoutPromise]);
      if (timer) clearTimeout(timer);
      this.recordSuccess();
      return result;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      this.recordFailure();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Risk Scoring Evaluation
  // ---------------------------------------------------------------------------

  async computeRiskScore(context: RiskContext): Promise<RiskScoreResult> {
    const apiKey = process.env.SIFT_API_KEY || process.env.RISK_SCORING_API_KEY;

    try {
      return await this.executeWithProtection(async () => {
        if (!apiKey || this.isMockMode(apiKey)) {
          return this.simulateRiskScore(context);
        }

        // Live Sift API request
        const url = `${process.env.RISK_SCORING_VENDOR_URL || 'https://api.sift.com/v205/score'}/${encodeURIComponent(
          context.signerId,
        )}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Sift API error: HTTP ${response.status}`);
        }

        const data: any = await response.json();
        const score = Number(data.score || 0.1);
        return this.formatRiskScoreResult(score, {
          ipReputationScore: Number(data.ip_score || 0.1),
          deviceTrustScore: Number(data.device_score || 0.1),
          emailDomainRisk: Number(data.email_score || 0.1),
          dealSizeMultiplier: context.dealValue && context.dealValue > 100000 ? 1.5 : 1.0,
        });
      });
    } catch (err: any) {
      // RULE RISK-001: Failure to conservative, NOT open!
      this.logger.warn(
        `[SiftRiskScoringAdapter] Vendor call failed or circuit open (${err.message}). Applying conservative fallback.`,
      );

      // Conservative fallback assigns high-assurance requirement
      return {
        score: 0.85,
        level: 'high',
        suggestedMethod: 'id_document',
        factors: {
          ipReputationScore: 0.5,
          deviceTrustScore: 0.5,
          emailDomainRisk: 0.5,
          dealSizeMultiplier: 1.0,
        },
        circuitOpen: this.cbState.isOpen,
        fallbackApplied: true,
        evaluatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Multi-factor heuristic simulation for tests, local development, and sandboxed execution.
   */
  private simulateRiskScore(context: RiskContext): RiskScoreResult {
    const email = context.email.toLowerCase().trim();
    const domain = email.split('@')[1] || '';
    const dealValue = Number(context.dealValue || 0);

    // Factor 1: Email domain risk (disposable domains = critical risk)
    let emailDomainRisk = 0.1;
    if (
      this.disposableDomains.has(domain) ||
      email.includes('fraud') ||
      email.includes('suspicious')
    ) {
      emailDomainRisk = 0.95;
    } else if (domain === 'gmail.com' || domain === 'yahoo.com' || domain === 'hotmail.com') {
      emailDomainRisk = 0.4; // Consumer email
    } else {
      emailDomainRisk = 0.1; // Corporate domain
    }

    // Factor 2: IP reputation score
    let ipReputationScore = 0.1;
    const ip = context.ipAddress || '';
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1' || ip === '::1') {
      ipReputationScore = 0.05; // Local trusted
    } else if (ip.startsWith('198.51.') || ip.startsWith('203.0.113.')) {
      ipReputationScore = 0.9; // Known proxy test ranges
    }

    // Factor 3: Device trust score
    let deviceTrustScore = 0.1;
    const ua = (context.userAgent || '').toLowerCase();
    if (ua.includes('headless') || ua.includes('phantom') || ua.includes('bot')) {
      deviceTrustScore = 0.95;
    } else if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
      deviceTrustScore = 0.15;
    }

    // Factor 4: Deal size multiplier & exposure
    let dealSizeMultiplier = 1.0;
    let dealValueFactor = 0.1;
    if (dealValue > 100000) {
      dealSizeMultiplier = 1.6;
      dealValueFactor = 0.85; // High deal value (> $100k) elevates financial risk
    } else if (dealValue > 25000) {
      dealSizeMultiplier = 1.25;
      dealValueFactor = 0.55; // Moderate deal value
    }

    // Composite score computation:
    // Critical risk triggers (high deal value > $100k, disposable domain, proxy, bot)
    // require step-up authentication. Composite blends maximum critical exposure with weighted signals.
    const maxCriticalTrigger = Math.max(
      emailDomainRisk >= 0.9 ? emailDomainRisk : 0,
      dealValueFactor >= 0.8 ? dealValueFactor : 0,
      ipReputationScore >= 0.9 ? ipReputationScore : 0,
      deviceTrustScore >= 0.9 ? deviceTrustScore : 0,
    );

    const weightedScore =
      0.35 * dealValueFactor +
      0.35 * emailDomainRisk +
      0.15 * ipReputationScore +
      0.15 * deviceTrustScore;

    const composite =
      maxCriticalTrigger > 0 ? Math.max(maxCriticalTrigger, weightedScore) : weightedScore;

    const finalScore = Math.min(1.0, Math.max(0.0, Number(composite.toFixed(3))));

    return this.formatRiskScoreResult(finalScore, {
      ipReputationScore,
      deviceTrustScore,
      emailDomainRisk,
      dealSizeMultiplier,
    });
  }

  private formatRiskScoreResult(
    score: number,
    factors: {
      ipReputationScore: number;
      deviceTrustScore: number;
      emailDomainRisk: number;
      dealSizeMultiplier: number;
    },
  ): RiskScoreResult {
    let level: 'low' | 'medium' | 'high' = 'low';
    let suggestedMethod: 'passcode' | 'sms' | 'kba' | 'id_document' | 'qes' = 'passcode';

    if (score >= 0.75) {
      level = 'high';
      suggestedMethod = 'id_document';
    } else if (score >= 0.35) {
      level = 'medium';
      suggestedMethod = 'sms';
    } else {
      level = 'low';
      suggestedMethod = 'passcode';
    }

    return {
      score,
      level,
      suggestedMethod,
      factors,
      circuitOpen: this.cbState.isOpen,
      fallbackApplied: false,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
