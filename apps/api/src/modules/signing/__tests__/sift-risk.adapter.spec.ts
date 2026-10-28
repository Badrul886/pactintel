import { SiftRiskScoringAdapter } from '../adapters/sift-risk.adapter';

describe('SiftRiskScoringAdapter (Sprint 3.7 - Risk Scoring & Circuit Breaker)', () => {
  let adapter: SiftRiskScoringAdapter;

  beforeEach(() => {
    adapter = new SiftRiskScoringAdapter();
    adapter.resetCircuitBreaker();
  });

  describe('Multi-Factor Heuristic Risk Scoring', () => {
    it('evaluates low risk for corporate email, standard IP, and routine deal value', async () => {
      const result = await adapter.computeRiskScore({
        signerId: 'signer-low-1',
        email: 'vp.sales@enterprise-corp.com',
        ipAddress: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        dealValue: 10000,
        organizationId: 'org-test-1',
      });

      expect(result.score).toBeLessThan(0.35);
      expect(result.level).toBe('low');
      expect(result.suggestedMethod).toBe('passcode');
      expect(result.fallbackApplied).toBe(false);
      expect(result.factors.emailDomainRisk).toBeLessThanOrEqual(0.3);
    });

    it('evaluates elevated medium risk for consumer email and moderate deal size', async () => {
      const result = await adapter.computeRiskScore({
        signerId: 'signer-med-1',
        email: 'freelancer.consultant@gmail.com',
        ipAddress: '192.168.1.100',
        dealValue: 40000,
        organizationId: 'org-test-1',
      });

      expect(result.score).toBeGreaterThanOrEqual(0.35);
      expect(result.score).toBeLessThanOrEqual(0.75);
      expect(result.level).toBe('medium');
      expect(result.suggestedMethod).toBe('sms');
    });

    it('evaluates high risk for disposable email domain requiring step-up Government ID', async () => {
      const result = await adapter.computeRiskScore({
        signerId: 'signer-high-1',
        email: 'temporary.user@mailinator.com',
        ipAddress: '198.51.100.22', // Proxy test range
        userAgent: 'HeadlessChrome/112.0',
        dealValue: 150000,
        organizationId: 'org-test-1',
      });

      expect(result.score).toBeGreaterThanOrEqual(0.75);
      expect(result.level).toBe('high');
      expect(result.suggestedMethod).toBe('id_document');
      expect(result.factors.emailDomainRisk).toBe(0.95);
      expect(result.factors.deviceTrustScore).toBe(0.95);
    });
  });

  describe('Circuit Breaker & Fallback Resilience (RULE RISK-001)', () => {
    it('starts in CLOSED state with 0 failures', () => {
      const status = adapter.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(false);
      expect(status.failureCount).toBe(0);
    });

    it('trips OPEN after 5 failures in 10-minute window and applies conservative fallback', async () => {
      for (let i = 0; i < 5; i++) {
        adapter.recordFailure();
      }

      const status = adapter.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(true);
      expect(status.failureCount).toBe(5);
      expect(status.trippedAt).toBeDefined();
      expect(status.cooldownRemainingMs).toBeGreaterThan(0);

      // When circuit is open, computeRiskScore must NOT throw unhandled error,
      // but must return conservative high-assurance fallback per RULE RISK-001
      const result = await adapter.computeRiskScore({
        signerId: 'signer-cb-fallback',
        email: 'standard@acme.com',
        organizationId: 'org-test-1',
      });

      expect(result.circuitOpen).toBe(true);
      expect(result.fallbackApplied).toBe(true);
      expect(result.level).toBe('high');
      expect(result.suggestedMethod).toBe('id_document');
    });

    it('recovers to CLOSED state after manual reset', async () => {
      for (let i = 0; i < 5; i++) {
        adapter.recordFailure();
      }
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(true);

      adapter.resetCircuitBreaker();
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(false);
      expect(adapter.getCircuitBreakerStatus().failureCount).toBe(0);

      const result = await adapter.computeRiskScore({
        signerId: 'signer-recovered',
        email: 'clean@company.com',
        organizationId: 'org-test-1',
      });
      expect(result.fallbackApplied).toBe(false);
    });
  });
});
