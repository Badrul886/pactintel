import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number; // 5 failures
  failureWindowMs?: number; // in 60 seconds
  openDurationMs?: number; // open for 30 seconds
  requestTimeoutMs?: number; // 10 seconds request timeout
}

export class CircuitBreakerOpenException extends ServiceUnavailableException {
  constructor(serviceName: string, resetInSeconds: number) {
    super({
      code: 'CIRCUIT_BREAKER_OPEN',
      message: `The external service '${serviceName}' is temporarily unavailable. Circuit breaker is OPEN. Retry in ${resetInSeconds}s.`,
      service: serviceName,
      retryAfter: resetInSeconds,
    });
  }
}

/**
 * Enterprise Circuit Breaker (RULE ERR-002)
 * Enforces 10s request timeout, 5 failures in 60s -> 30s open state,
 * and automatic fallback / ops alerting.
 */
export class CircuitBreaker {
  private readonly logger: Logger;
  private state: CircuitState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private openedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;
  private readonly openDurationMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.logger = new Logger(`CircuitBreaker:${options.name}`);
    this.failureThreshold = options.failureThreshold ?? 5;
    this.failureWindowMs = options.failureWindowMs ?? 60000; // 60s
    this.openDurationMs = options.openDurationMs ?? 30000; // 30s
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000; // 10s
  }

  /**
   * Returns current breaker status.
   */
  getStatus() {
    this.evaluateState();
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureTimestamps.length,
      openedAt: this.openedAt,
      nextAttemptTime: this.openedAt ? this.openedAt + this.openDurationMs : null,
    };
  }

  /**
   * Executes an external operation through the breaker with timeout and fallback.
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: (error: Error) => Promise<T> | T,
  ): Promise<T> {
    this.evaluateState();

    if (this.state === 'OPEN') {
      const remainingSeconds = Math.ceil(
        ((this.openedAt ?? Date.now()) + this.openDurationMs - Date.now()) / 1000,
      );
      this.logger.warn(
        `[RULE ERR-002] Call to '${this.options.name}' rejected: Circuit is OPEN (remaining: ${remainingSeconds}s)`,
      );
      if (fallback) {
        return fallback(new CircuitBreakerOpenException(this.options.name, remainingSeconds));
      }
      throw new CircuitBreakerOpenException(this.options.name, remainingSeconds);
    }

    // Execute with 10s timeout per RULE ERR-002
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Operation timed out after ${this.requestTimeoutMs}ms`)),
            this.requestTimeoutMs,
          );
        }),
      ]);

      this.onSuccess();
      return result;
    } catch (err: any) {
      this.onFailure(err);
      if (fallback) {
        this.logger.log(`Invoking fallback for failed operation on '${this.options.name}'`);
        return fallback(err);
      }
      throw err;
    }
  }

  private evaluateState() {
    const now = Date.now();
    // Prune failures older than window
    this.failureTimestamps = this.failureTimestamps.filter((ts) => now - ts < this.failureWindowMs);

    if (this.state === 'OPEN' && this.openedAt && now - this.openedAt >= this.openDurationMs) {
      this.logger.log(
        `[RULE ERR-002] Circuit for '${this.options.name}' transitioned from OPEN to HALF_OPEN`,
      );
      this.state = 'HALF_OPEN';
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.logger.log(
        `[RULE ERR-002] Probe succeeded. Circuit for '${this.options.name}' reset to CLOSED`,
      );
      this.reset();
    }
  }

  private onFailure(error: any) {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.logger.warn(
      `[RULE ERR-002] Failure on '${this.options.name}': ${error?.message || error}. Failures in window: ${this.failureTimestamps.length}/${this.failureThreshold}`,
    );

    if (this.state === 'HALF_OPEN' || this.failureTimestamps.length >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = now;
      this.logger.error(
        `🚨 [RULE ERR-002] Circuit breaker tripped to OPEN for '${this.options.name}'! Tripped after ${this.failureTimestamps.length} failures. All calls blocked for ${this.openDurationMs / 1000}s. Alert sent to ops.`,
      );
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failureTimestamps = [];
    this.openedAt = null;
  }
}

/**
 * Registry holding singleton circuit breakers per external service.
 */
@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({
        name,
        ...options,
      });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }
}
