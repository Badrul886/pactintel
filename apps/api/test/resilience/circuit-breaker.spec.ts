import {
  CircuitBreaker,
  CircuitBreakerOpenException,
} from '../../src/common/resilience/circuit-breaker';

describe('CircuitBreaker (RULE ERR-002 Resilience & Fail-Fast)', () => {
  it('executes successful operation in CLOSED state', async () => {
    const cb = new CircuitBreaker({ name: 'test-service' });
    const result = await cb.execute(async () => 'success_value');
    expect(result).toBe('success_value');
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  it('trips to OPEN state after 5 consecutive failures', async () => {
    const cb = new CircuitBreaker({
      name: 'flaky-service',
      failureThreshold: 5,
      openDurationMs: 1000,
    });

    for (let i = 0; i < 5; i++) {
      await expect(
        cb.execute(async () => {
          throw new Error(`Transient error ${i + 1}`);
        }),
      ).rejects.toThrow(`Transient error ${i + 1}`);
    }

    expect(cb.getStatus().state).toBe('OPEN');
    expect(cb.getStatus().failureCount).toBe(5);

    // 6th call should immediately fail with CircuitBreakerOpenException without invoking operation
    let operationInvoked = false;
    await expect(
      cb.execute(async () => {
        operationInvoked = true;
        return 'should_not_run';
      }),
    ).rejects.toThrow(CircuitBreakerOpenException);

    expect(operationInvoked).toBe(false);
  });

  it('executes fallback when circuit is OPEN or operation fails', async () => {
    const cb = new CircuitBreaker({
      name: 'fallback-service',
      failureThreshold: 1,
      openDurationMs: 5000,
    });

    // Trip the circuit
    await cb.execute(
      async () => {
        throw new Error('Immediate outage');
      },
      async () => 'handled_fallback_1',
    );

    expect(cb.getStatus().state).toBe('OPEN');

    // Subsequent call triggers fallback without executing vendor
    const fallbackResult = await cb.execute(
      async () => 'unexpected_success',
      async () => 'conservative_safe_fallback',
    );

    expect(fallbackResult).toBe('conservative_safe_fallback');
  });

  it('recovers to HALF_OPEN and resets to CLOSED upon successful probe', async () => {
    const cb = new CircuitBreaker({
      name: 'recovering-service',
      failureThreshold: 2,
      openDurationMs: 50, // 50ms cooldown for test speed
    });

    // Fail 2 times
    await expect(
      cb.execute(async () => {
        throw new Error('fail 1');
      }),
    ).rejects.toThrow();
    await expect(
      cb.execute(async () => {
        throw new Error('fail 2');
      }),
    ).rejects.toThrow();
    expect(cb.getStatus().state).toBe('OPEN');

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 60));

    // Next successful execution transitions to HALF_OPEN then CLOSED
    const result = await cb.execute(async () => 'probe_success');
    expect(result).toBe('probe_success');
    expect(cb.getStatus().state).toBe('CLOSED');
  });

  it('enforces request timeout', async () => {
    const cb = new CircuitBreaker({
      name: 'slow-service',
      requestTimeoutMs: 50,
    });

    await expect(
      cb.execute(async () => {
        await new Promise((r) => setTimeout(r, 100));
        return 'too_slow';
      }),
    ).rejects.toThrow(/timed out after 50ms/);
  });
});
