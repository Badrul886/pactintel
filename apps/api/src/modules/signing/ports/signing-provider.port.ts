export interface KbaQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface KbaInitiationResult {
  sessionId: string;
  questions: KbaQuestion[];
  attemptsRemaining: number;
  expiresAt: string;
}

export interface KbaSubmissionResult {
  passed: boolean;
  locked: boolean;
  attemptsRemaining: number;
  message: string;
}

export interface IdVerificationInitiationResult {
  sessionId: string;
  verificationUrl: string;
  expiresAt: string;
}

export interface IdVerificationCheckResult {
  status: 'pending' | 'passed' | 'failed' | 'expired';
  confidenceScore?: number;
  vendorReferenceId?: string;
  verifiedAt?: string;
  biometricMatch?: boolean;
  failureReason?: string;
}

export interface QesInitiationResult {
  sessionId: string;
  qtspProvider: string;
  signingUrl: string;
  eidasLevel: 'QES';
  expiresAt: string;
}

export interface QesCheckResult {
  status: 'pending' | 'completed' | 'failed';
  certificateIssuer?: string;
  certificateSerial?: string;
  qualifiedTimestamp?: string;
  vendorReferenceId?: string;
  verifiedAt?: string;
}

export interface CircuitBreakerStatus {
  isOpen: boolean;
  failureCount: number;
  lastFailureAt?: Date;
  trippedAt?: Date;
  cooldownRemainingMs: number;
}

export interface SigningProviderPort {
  readonly providerName: string;

  // Circuit breaker state inspection & control (RULE RISK-001)
  getCircuitBreakerStatus(): CircuitBreakerStatus;
  resetCircuitBreaker(): void;
  recordFailure(): void;
  recordSuccess(): void;

  // KBA (Knowledge-Based Authentication)
  initiateKba(params: {
    signerId: string;
    signerEmail: string;
    signerName?: string;
  }): Promise<KbaInitiationResult>;

  submitKbaAnswers(params: {
    sessionId: string;
    signerId: string;
    answers: Record<string, string>;
  }): Promise<KbaSubmissionResult>;

  // Government ID Verification
  initiateIdVerification(params: {
    signerId: string;
    signerEmail: string;
    returnUrl?: string;
  }): Promise<IdVerificationInitiationResult>;

  getIdVerificationResult(params: { sessionId: string }): Promise<IdVerificationCheckResult>;

  // QES (Qualified Electronic Signature - eIDAS)
  initiateQes(params: {
    signerId: string;
    signerEmail: string;
    signerName?: string;
    countryCode?: string;
    providerPreference?: string;
    returnUrl?: string;
  }): Promise<QesInitiationResult>;

  getQesResult(params: { sessionId: string }): Promise<QesCheckResult>;
}

export const SIGNING_PROVIDER_PORT = Symbol('SIGNING_PROVIDER_PORT');
