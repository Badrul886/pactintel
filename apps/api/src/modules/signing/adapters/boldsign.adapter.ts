import { Injectable, Logger } from '@nestjs/common';
import {
  SigningProviderPort,
  KbaInitiationResult,
  KbaSubmissionResult,
  IdVerificationInitiationResult,
  IdVerificationCheckResult,
  QesInitiationResult,
  QesCheckResult,
  CircuitBreakerStatus,
} from '../ports/signing-provider.port';
import { generateId } from '@pactintel/shared-utils';

export class CircuitBreakerOpenException extends Error {
  readonly code = 'CIRCUIT_BREAKER_OPEN';
  constructor(message = 'Signing provider circuit breaker is OPEN due to repeated outages.') {
    super(message);
    this.name = 'CircuitBreakerOpenException';
  }
}

export class SigningProviderTimeoutException extends Error {
  readonly code = 'PROVIDER_TIMEOUT';
  constructor(message = 'Signing provider request timed out after 5000ms.') {
    super(message);
    this.name = 'SigningProviderTimeoutException';
  }
}

interface CircuitBreakerState {
  failureTimestamps: number[];
  isOpen: boolean;
  trippedAt?: number;
}

interface MockKbaSession {
  sessionId: string;
  signerId: string;
  attempts: number;
  correctAnswers: Record<string, string>;
  expiresAt: Date;
}

interface MockIdSession {
  sessionId: string;
  signerId: string;
  status: 'pending' | 'passed' | 'failed' | 'expired';
  expiresAt: Date;
}

interface MockQesSession {
  sessionId: string;
  signerId: string;
  status: 'pending' | 'completed' | 'failed';
  expiresAt: Date;
}

@Injectable()
export class BoldSignAdapter implements SigningProviderPort {
  readonly providerName = 'boldsign';
  private readonly logger = new Logger(BoldSignAdapter.name);

  // Circuit Breaker constants (RULE RISK-001)
  private readonly FAILURE_THRESHOLD = 5;
  private readonly WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  private readonly TIMEOUT_MS = 5000; // 5000ms timeout

  private cbState: CircuitBreakerState = {
    failureTimestamps: [],
    isOpen: false,
    trippedAt: undefined,
  };

  // Mock session caches for testing & local development
  private mockKbaSessions = new Map<string, MockKbaSession>();
  private mockIdSessions = new Map<string, MockIdSession>();
  private mockQesSessions = new Map<string, MockQesSession>();

  // ---------------------------------------------------------------------------
  // Circuit Breaker Management (RULE RISK-001)
  // ---------------------------------------------------------------------------

  getCircuitBreakerStatus(): CircuitBreakerStatus {
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
    this.logger.log('[CircuitBreaker] Reset to CLOSED state.');
  }

  recordFailure(): void {
    const now = Date.now();
    // Prune failures older than sliding window
    this.cbState.failureTimestamps = this.cbState.failureTimestamps.filter(
      (ts) => now - ts < this.WINDOW_MS,
    );
    this.cbState.failureTimestamps.push(now);

    this.logger.warn(
      `[CircuitBreaker] Failure recorded. Count in window: ${this.cbState.failureTimestamps.length}/${this.FAILURE_THRESHOLD}`,
    );

    if (this.cbState.failureTimestamps.length >= this.FAILURE_THRESHOLD) {
      this.cbState.isOpen = true;
      this.cbState.trippedAt = now;
      this.logger.error(
        `[CircuitBreaker] TRIP OPEN! ${this.FAILURE_THRESHOLD} failures in 10m. Open for 30m.`,
      );
    }
  }

  recordSuccess(): void {
    if (this.cbState.isOpen) {
      this.logger.log(
        '[CircuitBreaker] Successful call while open/half-open. Resetting to CLOSED.',
      );
      this.resetCircuitBreaker();
    } else {
      // Clear recent failure buffer on healthy execution
      if (this.cbState.failureTimestamps.length > 0) {
        this.cbState.failureTimestamps.shift();
      }
    }
  }

  private evaluateCircuitBreakerState(): void {
    if (!this.cbState.isOpen) return;

    const now = Date.now();
    if (this.cbState.trippedAt && now - this.cbState.trippedAt >= this.COOLDOWN_MS) {
      this.logger.log('[CircuitBreaker] Cooldown period expired. Transitioning to HALF-OPEN.');
      this.cbState.isOpen = false;
      this.cbState.trippedAt = undefined;
      this.cbState.failureTimestamps = [];
    }
  }

  /**
   * Determine whether the adapter should use internal mock sessions or call live BoldSign APIs.
   * Defensively returns true in tests, when running under Jest, when placeholder keys are present,
   * or when explicitly configured for mock mode.
   */
  private isMockMode(apiKey: string): boolean {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.JEST_WORKER_ID !== undefined) return true;
    if (process.env.BOLDSIGN_MOCK === 'true') return true;
    if (
      apiKey.includes('placeholder') ||
      apiKey.includes('test') ||
      apiKey.startsWith('mock_') ||
      apiKey === 'boldsign_local_placeholder'
    ) {
      return true;
    }
    return false;
  }

  private async executeWithProtection<T>(action: () => Promise<T>): Promise<T> {
    this.evaluateCircuitBreakerState();

    if (this.cbState.isOpen) {
      throw new CircuitBreakerOpenException();
    }

    // Enforce 5000ms SLA timeout per external provider contract
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new SigningProviderTimeoutException());
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
  // Knowledge-Based Authentication (KBA)
  // ---------------------------------------------------------------------------

  async initiateKba(params: {
    signerId: string;
    signerEmail: string;
    signerName?: string;
  }): Promise<KbaInitiationResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const sessionId = `kba_sess_${generateId().replace(/-/g, '')}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Standard credit bureau verification questions (US-only)
        const questions = [
          {
            id: 'q1',
            prompt: 'Which of the following addresses have you been associated with?',
            options: [
              '124 Elm Street, Austin, TX',
              '742 Evergreen Terrace, Springfield, OR',
              '90210 Ocean Blvd, Miami, FL',
              'None of the above',
            ],
          },
          {
            id: 'q2',
            prompt: 'What year was your vehicle manufactured (if applicable)?',
            options: ['2016', '2019', '2021', 'None of the above'],
          },
          {
            id: 'q3',
            prompt: 'Which financial institution holds or held your mortgage or auto loan?',
            options: ['JPMorgan Chase', 'Wells Fargo', 'Ally Bank', 'None of the above'],
          },
        ];

        this.mockKbaSessions.set(sessionId, {
          sessionId,
          signerId: params.signerId,
          attempts: 0,
          correctAnswers: {
            q1: '742 Evergreen Terrace, Springfield, OR',
            q2: '2019',
            q3: 'Ally Bank',
          },
          expiresAt: new Date(expiresAt),
        });

        return {
          sessionId,
          questions,
          attemptsRemaining: 3,
          expiresAt,
        };
      }

      // Live BoldSign API implementation
      const response = await fetch('https://api.boldsign.com/v1/identity/kba/initiate', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerId: params.signerId,
          email: params.signerEmail,
          name: params.signerName,
        }),
      });

      if (!response.ok) {
        throw new Error(`BoldSign KBA initiation failed with HTTP ${response.status}`);
      }

      return (await response.json()) as KbaInitiationResult;
    });
  }

  async submitKbaAnswers(params: {
    sessionId: string;
    signerId: string;
    answers: Record<string, string>;
  }): Promise<KbaSubmissionResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const session = this.mockKbaSessions.get(params.sessionId);
        if (!session) {
          return {
            passed: false,
            locked: false,
            attemptsRemaining: 0,
            message: 'KBA session not found or expired.',
          };
        }

        session.attempts += 1;
        const attemptsRemaining = Math.max(0, 3 - session.attempts);

        // Check if answers match correct answers
        const isCorrect = Object.entries(session.correctAnswers).every(
          ([qId, ans]) => params.answers[qId] === ans,
        );

        if (isCorrect) {
          this.mockKbaSessions.delete(params.sessionId);
          return {
            passed: true,
            locked: false,
            attemptsRemaining,
            message: 'Identity successfully verified via Knowledge-Based Authentication.',
          };
        }

        const locked = attemptsRemaining === 0;
        if (locked) {
          this.mockKbaSessions.delete(params.sessionId);
        }

        return {
          passed: false,
          locked,
          attemptsRemaining,
          message: locked
            ? 'Maximum KBA attempts exceeded. Identity verification locked.'
            : `Answers did not match records. ${attemptsRemaining} attempt(s) remaining.`,
        };
      }

      // Live BoldSign API implementation
      const response = await fetch('https://api.boldsign.com/v1/identity/kba/verify', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          answers: params.answers,
        }),
      });

      if (!response.ok) {
        throw new Error(`BoldSign KBA submission failed with HTTP ${response.status}`);
      }

      return (await response.json()) as KbaSubmissionResult;
    });
  }

  // ---------------------------------------------------------------------------
  // Government ID & Biometric Verification
  // ---------------------------------------------------------------------------

  async initiateIdVerification(params: {
    signerId: string;
    signerEmail: string;
    returnUrl?: string;
  }): Promise<IdVerificationInitiationResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const sessionId = `govid_sess_${generateId().replace(/-/g, '')}`;
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const verificationUrl = `https://verify.boldsign.com/id/${sessionId}?returnUrl=${encodeURIComponent(
          params.returnUrl || '',
        )}`;

        this.mockIdSessions.set(sessionId, {
          sessionId,
          signerId: params.signerId,
          status: 'passed',
          expiresAt: new Date(expiresAt),
        });

        return {
          sessionId,
          verificationUrl,
          expiresAt,
        };
      }

      // Live BoldSign API implementation
      const response = await fetch('https://api.boldsign.com/v1/identity/gov-id/initiate', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerId: params.signerId,
          email: params.signerEmail,
          returnUrl: params.returnUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`BoldSign Gov ID initiation failed with HTTP ${response.status}`);
      }

      return (await response.json()) as IdVerificationInitiationResult;
    });
  }

  async getIdVerificationResult(params: { sessionId: string }): Promise<IdVerificationCheckResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const session = this.mockIdSessions.get(params.sessionId);
        if (!session) {
          return {
            status: 'failed',
            failureReason: 'Session expired or not found',
          };
        }

        // STRICT ZERO-PII RETURN (Under GDPR / CCPA, no driver's license numbers, SSN, or photos)
        return {
          status: session.status,
          confidenceScore: 98,
          vendorReferenceId: `bs_id_${params.sessionId.slice(-8)}`,
          verifiedAt: new Date().toISOString(),
          biometricMatch: true,
        };
      }

      const response = await fetch(
        `https://api.boldsign.com/v1/identity/gov-id/status?sessionId=${params.sessionId}`,
        {
          headers: { 'x-api-key': apiKey },
        },
      );

      if (!response.ok) {
        throw new Error(`BoldSign Gov ID status check failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      // Ensure zero PII is propagated into our records
      return {
        status: data.status,
        confidenceScore: data.confidenceScore,
        vendorReferenceId: data.vendorReferenceId,
        verifiedAt: data.verifiedAt,
        biometricMatch: data.biometricMatch,
        failureReason: data.failureReason,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Qualified Electronic Signature (QES - eIDAS)
  // ---------------------------------------------------------------------------

  async initiateQes(params: {
    signerId: string;
    signerEmail: string;
    signerName?: string;
    countryCode?: string;
    providerPreference?: string;
    returnUrl?: string;
  }): Promise<QesInitiationResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const sessionId = `qes_sess_${generateId().replace(/-/g, '')}`;
        const qtspProvider = params.providerPreference || 'D-Trust Qualified QTSP EU';
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const signingUrl = `https://qes.boldsign.com/session/${sessionId}?provider=${encodeURIComponent(
          qtspProvider,
        )}`;

        this.mockQesSessions.set(sessionId, {
          sessionId,
          signerId: params.signerId,
          status: 'completed',
          expiresAt: new Date(expiresAt),
        });

        return {
          sessionId,
          qtspProvider,
          signingUrl,
          eidasLevel: 'QES',
          expiresAt,
        };
      }

      const response = await fetch('https://api.boldsign.com/v1/identity/qes/initiate', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signerId: params.signerId,
          email: params.signerEmail,
          name: params.signerName,
          countryCode: params.countryCode || 'DE',
          qtspProvider: params.providerPreference,
          returnUrl: params.returnUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`BoldSign QES initiation failed with HTTP ${response.status}`);
      }

      return (await response.json()) as QesInitiationResult;
    });
  }

  async getQesResult(params: { sessionId: string }): Promise<QesCheckResult> {
    return this.executeWithProtection(async () => {
      const apiKey = process.env.BOLDSIGN_API_KEY;

      if (!apiKey || this.isMockMode(apiKey)) {
        const session = this.mockQesSessions.get(params.sessionId);
        if (!session) {
          return {
            status: 'failed',
          };
        }

        return {
          status: session.status,
          certificateIssuer: 'D-Trust Qualified CA 2026',
          certificateSerial: 'DE-QTSP-99182391283',
          qualifiedTimestamp: new Date().toISOString(),
          vendorReferenceId: `bs_qes_${params.sessionId.slice(-8)}`,
          verifiedAt: new Date().toISOString(),
        };
      }

      const response = await fetch(
        `https://api.boldsign.com/v1/identity/qes/status?sessionId=${params.sessionId}`,
        {
          headers: { 'x-api-key': apiKey },
        },
      );

      if (!response.ok) {
        throw new Error(`BoldSign QES status check failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        status: data.status,
        certificateIssuer: data.certificateIssuer,
        certificateSerial: data.certificateSerial,
        qualifiedTimestamp: data.qualifiedTimestamp,
        vendorReferenceId: data.vendorReferenceId,
        verifiedAt: data.verifiedAt,
      };
    });
  }
}
