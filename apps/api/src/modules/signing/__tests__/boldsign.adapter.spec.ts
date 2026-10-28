import { BoldSignAdapter, CircuitBreakerOpenException } from '../adapters/boldsign.adapter';

describe('BoldSignAdapter (Sprint 3.6 - Advanced ID Verification & Circuit Breaker)', () => {
  let adapter: BoldSignAdapter;

  beforeEach(() => {
    adapter = new BoldSignAdapter();
    adapter.resetCircuitBreaker();
  });

  describe('Knowledge-Based Authentication (KBA)', () => {
    it('initiates KBA session with 3 credit bureau questions and 3 attempts', async () => {
      const session = await adapter.initiateKba({
        signerId: 'signer-kba-1',
        signerEmail: 'john.doe@example.com',
        signerName: 'John Doe',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.questions).toHaveLength(3);
      expect(session.attemptsRemaining).toBe(3);
      expect(session.questions[0].prompt).toBeDefined();
      expect(session.questions[0].options.length).toBeGreaterThan(1);
    });

    it('validates correct KBA answers and returns passed=true', async () => {
      const session = await adapter.initiateKba({
        signerId: 'signer-kba-2',
        signerEmail: 'jane.smith@example.com',
      });

      const result = await adapter.submitKbaAnswers({
        sessionId: session.sessionId,
        signerId: 'signer-kba-2',
        answers: {
          q1: '742 Evergreen Terrace, Springfield, OR',
          q2: '2019',
          q3: 'Ally Bank',
        },
      });

      expect(result.passed).toBe(true);
      expect(result.locked).toBe(false);
      expect(result.message).toContain('successfully verified');
    });

    it('decrements attempts on wrong answers and locks out on 3rd failure', async () => {
      const session = await adapter.initiateKba({
        signerId: 'signer-kba-3',
        signerEmail: 'bad.actor@example.com',
      });

      // Attempt 1
      const res1 = await adapter.submitKbaAnswers({
        sessionId: session.sessionId,
        signerId: 'signer-kba-3',
        answers: { q1: 'Wrong address', q2: 'Wrong year', q3: 'Wrong bank' },
      });
      expect(res1.passed).toBe(false);
      expect(res1.locked).toBe(false);
      expect(res1.attemptsRemaining).toBe(2);

      // Attempt 2
      const res2 = await adapter.submitKbaAnswers({
        sessionId: session.sessionId,
        signerId: 'signer-kba-3',
        answers: { q1: 'Wrong address', q2: 'Wrong year', q3: 'Wrong bank' },
      });
      expect(res2.passed).toBe(false);
      expect(res2.locked).toBe(false);
      expect(res2.attemptsRemaining).toBe(1);

      // Attempt 3: Final lockout
      const res3 = await adapter.submitKbaAnswers({
        sessionId: session.sessionId,
        signerId: 'signer-kba-3',
        answers: { q1: 'Wrong address', q2: 'Wrong year', q3: 'Wrong bank' },
      });
      expect(res3.passed).toBe(false);
      expect(res3.locked).toBe(true);
      expect(res3.attemptsRemaining).toBe(0);
      expect(res3.message).toContain('Maximum KBA attempts exceeded');
    });
  });

  describe('Government ID & Biometric Verification', () => {
    it('initiates ID verification session and returns verification URL', async () => {
      const session = await adapter.initiateIdVerification({
        signerId: 'signer-govid-1',
        signerEmail: 'exec@corp.com',
        returnUrl: 'https://app.pactintel.internal/sign/done',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.verificationUrl).toContain('https://verify.boldsign.com/id/');
    });

    it('enforces ZERO-PII storage policy on check result (no DL numbers, SSN, photos)', async () => {
      const session = await adapter.initiateIdVerification({
        signerId: 'signer-govid-2',
        signerEmail: 'exec2@corp.com',
      });

      const result = await adapter.getIdVerificationResult({
        sessionId: session.sessionId,
      });

      expect(result.status).toBe('passed');
      expect(result.confidenceScore).toBe(98);
      expect(result.biometricMatch).toBe(true);
      expect(result.vendorReferenceId).toBeDefined();

      // STRICT ZERO-PII: Ensure PII fields are never returned or stored
      expect((result as any).ssn).toBeUndefined();
      expect((result as any).licenseNumber).toBeUndefined();
      expect((result as any).documentPhotoUrl).toBeUndefined();
      expect((result as any).dateOfBirth).toBeUndefined();
    });
  });

  describe('Qualified Electronic Signature (QES - eIDAS)', () => {
    it('initiates QES session with EU Qualified Trust Service Provider (QTSP)', async () => {
      const session = await adapter.initiateQes({
        signerId: 'signer-qes-1',
        signerEmail: 'director@berlin-holding.de',
        countryCode: 'DE',
        providerPreference: 'D-Trust Qualified QTSP EU',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.eidasLevel).toBe('QES');
      expect(session.qtspProvider).toContain('D-Trust');
      expect(session.signingUrl).toContain('https://qes.boldsign.com/session/');
    });

    it('returns completed QES certificate metadata with qualified timestamp', async () => {
      const session = await adapter.initiateQes({
        signerId: 'signer-qes-2',
        signerEmail: 'director@paris-capital.fr',
        countryCode: 'FR',
      });

      const result = await adapter.getQesResult({
        sessionId: session.sessionId,
      });

      expect(result.status).toBe('completed');
      expect(result.certificateIssuer).toBeDefined();
      expect(result.certificateSerial).toBeDefined();
      expect(result.qualifiedTimestamp).toBeDefined();
    });
  });

  describe('Circuit Breaker (RULE RISK-001)', () => {
    it('starts in CLOSED state with 0 failures', () => {
      const status = adapter.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(false);
      expect(status.failureCount).toBe(0);
    });

    it('trips OPEN after 5 failures within 10-minute sliding window', async () => {
      // Simulate 5 provider failures
      for (let i = 0; i < 5; i++) {
        adapter.recordFailure();
      }

      const status = adapter.getCircuitBreakerStatus();
      expect(status.isOpen).toBe(true);
      expect(status.failureCount).toBe(5);
      expect(status.trippedAt).toBeDefined();
      expect(status.cooldownRemainingMs).toBeGreaterThan(0);

      // Subsequent calls must fail fast with CircuitBreakerOpenException without invoking provider
      await expect(
        adapter.initiateKba({
          signerId: 'signer-cb',
          signerEmail: 'cb@test.com',
        }),
      ).rejects.toThrow(CircuitBreakerOpenException);
    });

    it('recovers to CLOSED state when reset', async () => {
      for (let i = 0; i < 5; i++) {
        adapter.recordFailure();
      }
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(true);

      adapter.resetCircuitBreaker();
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(false);
      expect(adapter.getCircuitBreakerStatus().failureCount).toBe(0);

      // Calls work normally after reset
      const session = await adapter.initiateKba({
        signerId: 'signer-recovered',
        signerEmail: 'recovered@test.com',
      });
      expect(session.sessionId).toBeDefined();
    });
  });
});
