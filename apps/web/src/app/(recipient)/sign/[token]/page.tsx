'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import {
  Lock,
  CheckCircle,
  AlertTriangle,
  FileText,
  CreditCard,
  Download,
  XCircle,
  PenTool,
  Type,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Award,
} from 'lucide-react';

interface SignPageProps {
  params: Promise<{ token: string }>;
}

interface SignerInfo {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  verificationMethod?: string;
  verificationAttempts?: number;
  kbaLocked?: boolean;
  kbaLockedAt?: string;
  verificationResult?: Record<string, any>;
}

interface DocumentInfo {
  id: string;
  title: string;
  documentNumber: string;
  organizationId: string;
}

interface LatestVersionInfo {
  versionNumber: number;
  fileUrl: string;
  contentHash: string;
}

interface KbaQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export default function ExternalSigningPage({ params }: SignPageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Signer & Doc State
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);

  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [latestVersion, setLatestVersion] = useState<LatestVersionInfo | null>(null);

  // Advanced ID Verification State (Sprint 3.6)
  const [showKbaModal, setShowKbaModal] = useState(false);
  const [kbaQuestions, setKbaQuestions] = useState<KbaQuestion[]>([]);
  const [kbaSessionId, setKbaSessionId] = useState<string>('');
  const [kbaAnswers, setKbaAnswers] = useState<Record<string, string>>({});
  const [kbaAttemptsRemaining, setKbaAttemptsRemaining] = useState<number>(3);
  const [kbaError, setKbaError] = useState<string | null>(null);
  const [kbaLoading, setKbaLoading] = useState(false);

  const [showGovIdModal, setShowGovIdModal] = useState(false);
  const [govIdSessionId, setGovIdSessionId] = useState<string>('');
  const [govIdVerificationUrl, setGovIdVerificationUrl] = useState<string>('');
  const [govIdLoading, setGovIdLoading] = useState(false);
  const [govIdError, setGovIdError] = useState<string | null>(null);

  const [showQesModal, setShowQesModal] = useState(false);
  const [qesSessionId, setQesSessionId] = useState<string>('');
  const [qesProvider, setQesProvider] = useState<string>('D-Trust Qualified QTSP EU');
  const [qesSigningUrl, setQesSigningUrl] = useState<string>('');
  const [qesCountryCode, setQesCountryCode] = useState<string>('DE');
  const [qesLoading, setQesLoading] = useState(false);
  const [qesError, setQesError] = useState<string | null>(null);

  // Workflow states
  const [isSigned, setIsSigned] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);

  // Modals & inputs
  const [showSignModal, setShowSignModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Signature capture state
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('type');
  const [typedSignature, setTypedSignature] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [legalAssentChecked, setLegalAssentChecked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  // Helper: check if advanced verification is satisfied
  const isVerificationSatisfied = () => {
    if (!signer) return true;
    const method = signer.verificationMethod;
    if (!method || ['none', 'email', 'passcode', 'sms'].includes(method)) {
      return true;
    }
    const result = signer.verificationResult;
    return Boolean(result && (result.status === 'passed' || result.status === 'completed'));
  };

  // Load initial signing request metadata
  useEffect(() => {
    async function loadSignRequest() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/signing/sign/${token}`);
        if (!res.ok) {
          if (res.status === 404 || res.status === 401) {
            setErrorMessage(
              'This signing link is invalid, has expired, or has already been used. Please contact the sender for a new link.',
            );
          } else {
            setErrorMessage('Unable to load document details at this time. Please try again.');
          }
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        setRequiresPasscode(Boolean(data.requiresPasscode));
        setSigner(data.signer || null);
        setDocument(data.document || null);
        setLatestVersion(data.latestVersion || null);
        if (data.signer?.name) {
          setTypedSignature(data.signer.name);
        }
      } catch {
        setErrorMessage(
          'Unable to connect to the signing service. Please check your network and try again.',
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      loadSignRequest();
    }
  }, [token]);

  // Handle Passcode Identity Verification
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setPasscodeError('Please enter your passcode to access this document.');
      return;
    }

    setIsVerifyingPasscode(true);
    setPasscodeError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/verify-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (!res.ok) {
        setPasscodeError('Incorrect passcode. Please check the code provided by the sender.');
        setIsVerifyingPasscode(false);
        return;
      }

      const data = await res.json();
      setRequiresPasscode(false);
      if (data.signer) setSigner(data.signer);
      if (data.document) setDocument(data.document);
      if (data.latestVersion) setLatestVersion(data.latestVersion);
      if (data.signer?.name) setTypedSignature(data.signer.name);
    } catch {
      setPasscodeError('Error validating passcode. Please try again.');
    } finally {
      setIsVerifyingPasscode(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Advanced ID Verification Handlers (Sprint 3.6)
  // ---------------------------------------------------------------------------

  const handleStartKba = async () => {
    setKbaLoading(true);
    setKbaError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/kba/initiate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setKbaError(data.message || 'Unable to initiate KBA session.');
        return;
      }

      if (data.fallbackApplied) {
        alert(`Notice: ${data.message}`);
        if (signer) {
          setSigner({ ...signer, verificationMethod: data.fallbackMethod });
        }
        return;
      }

      setKbaSessionId(data.sessionId);
      setKbaQuestions(data.questions || []);
      setKbaAttemptsRemaining(data.attemptsRemaining ?? 3);
      setShowKbaModal(true);
    } catch {
      setKbaError('Network error starting KBA verification.');
    } finally {
      setKbaLoading(false);
    }
  };

  const handleSubmitKba = async () => {
    setKbaLoading(true);
    setKbaError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/kba/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: kbaSessionId,
          answers: kbaAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setKbaError(data.message || 'KBA answer submission failed.');
        return;
      }

      if (data.passed) {
        if (signer) {
          setSigner({
            ...signer,
            verificationResult: { status: 'passed', method: 'kba' },
          });
        }
        setShowKbaModal(false);
      } else if (data.locked) {
        if (signer) {
          setSigner({ ...signer, kbaLocked: true });
        }
        setShowKbaModal(false);
      } else {
        setKbaAttemptsRemaining(data.attemptsRemaining ?? 0);
        setKbaError(data.message || 'Incorrect answers. Please try again.');
      }
    } catch {
      setKbaError('Network error submitting KBA answers.');
    } finally {
      setKbaLoading(false);
    }
  };

  const handleStartGovId = async () => {
    setGovIdLoading(true);
    setGovIdError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/id-verify/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGovIdError(data.message || 'Unable to initiate ID verification.');
        return;
      }

      if (data.fallbackApplied) {
        alert(`Notice: ${data.message}`);
        if (signer) {
          setSigner({ ...signer, verificationMethod: data.fallbackMethod });
        }
        return;
      }

      setGovIdSessionId(data.sessionId);
      setGovIdVerificationUrl(data.verificationUrl);
      setShowGovIdModal(true);
    } catch {
      setGovIdError('Network error initiating Government ID verification.');
    } finally {
      setGovIdLoading(false);
    }
  };

  const handleCompleteGovIdCheck = async () => {
    setGovIdLoading(true);
    setGovIdError(null);
    try {
      const res = await fetch(
        `/api/signing/sign/${token}/id-verify/result?sessionId=${govIdSessionId}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setGovIdError(data.message || 'Error checking verification status.');
        return;
      }

      if (data.status === 'passed') {
        if (signer) {
          setSigner({
            ...signer,
            verificationResult: {
              status: 'passed',
              method: 'id_document',
              confidenceScore: data.confidenceScore,
              biometricMatch: data.biometricMatch,
            },
          });
        }
        setShowGovIdModal(false);
      } else {
        setGovIdError(
          'Verification is still pending or was not approved. Please complete document submission.',
        );
      }
    } catch {
      setGovIdError('Network error checking verification result.');
    } finally {
      setGovIdLoading(false);
    }
  };

  const handleStartQes = async () => {
    setQesLoading(true);
    setQesError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/qes/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: qesCountryCode,
          providerPreference: qesProvider,
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQesError(data.message || 'Unable to initiate QES session.');
        return;
      }

      if (data.fallbackApplied) {
        alert(`Notice: ${data.message}`);
        if (signer) {
          setSigner({ ...signer, verificationMethod: data.fallbackMethod });
        }
        return;
      }

      setQesSessionId(data.sessionId);
      setQesSigningUrl(data.signingUrl);
      setShowQesModal(true);
    } catch {
      setQesError('Network error initiating QES certificate session.');
    } finally {
      setQesLoading(false);
    }
  };

  const handleCompleteQesCheck = async () => {
    setQesLoading(true);
    setQesError(null);
    try {
      const res = await fetch(`/api/signing/sign/${token}/qes/result?sessionId=${qesSessionId}`);
      const data = await res.json();
      if (!res.ok) {
        setQesError(data.message || 'Error checking QES status.');
        return;
      }

      if (data.status === 'completed' || data.status === 'passed') {
        if (signer) {
          setSigner({
            ...signer,
            verificationResult: {
              status: 'passed',
              method: 'qes',
              certificateIssuer: data.certificateIssuer,
              qualifiedTimestamp: data.qualifiedTimestamp,
            },
          });
        }
        setShowQesModal(false);
      } else {
        setQesError(
          'Qualified certificate authentication is still pending. Please authorize with your QTSP.',
        );
      }
    } catch {
      setQesError('Network error checking QES result.');
    } finally {
      setQesLoading(false);
    }
  };

  // Canvas drawing handlers
  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawing.current = true;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0C0F1D';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Submit Signature
  const handleCompleteSign = async () => {
    if (!legalAssentChecked) return;
    if (!isVerificationSatisfied()) {
      alert('Please complete the required identity verification before signing.');
      return;
    }

    let signatureData = '';
    if (signatureMode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      signatureData = canvas.toDataURL('image/png');
    } else {
      if (!typedSignature.trim()) return;
      signatureData = `typed:${typedSignature.trim()}`;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/signing/sign/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData,
          legalAssent: true,
        }),
      });

      if (!res.ok) {
        throw new Error('Signing failed');
      }

      const data = await res.json();
      setIsSigned(true);
      setShowSignModal(false);
      if (data.paymentLinkUrl) {
        setPaymentLinkUrl(data.paymentLinkUrl);
      }
    } catch {
      alert('Unable to record signature. Please refresh the page and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Decline
  const handleCompleteDecline = async () => {
    if (!declineReason.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/signing/sign/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: declineReason.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Decline failed');
      }

      setIsDeclined(true);
      setShowDeclineModal(false);
    } catch {
      alert('Unable to record decline response. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div
          style={{
            height: '36px',
            width: '280px',
            backgroundColor: 'var(--color-gray-100)',
            borderRadius: '4px',
          }}
        />
        <div
          style={{
            height: '400px',
            backgroundColor: 'var(--color-white)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
          }}
        />
      </div>
    );
  }

  // 2. KBA Lockout Gate View (RULE KBA-001)
  if (signer?.kbaLocked) {
    return (
      <div
        style={{
          maxWidth: '540px',
          margin: '40px auto',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-error-bg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: 'var(--status-error-text)',
          }}
        >
          <ShieldAlert size={26} />
        </div>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '8px',
          }}
        >
          Identity Verification Locked
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-gray-600)',
            lineHeight: '22px',
            marginBottom: '24px',
          }}
        >
          You have exceeded the maximum allowed attempts for Knowledge-Based Authentication (KBA).
          For legal security and anti-fraud compliance, this signing link has been locked and the
          sender has been alerted. Please contact the document sender to unlock or reissue your
          invitation.
        </p>
      </div>
    );
  }

  // 3. Error State (Invalid/Expired Token)
  if (errorMessage) {
    return (
      <div
        style={{
          maxWidth: '540px',
          margin: '40px auto',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-error-bg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: 'var(--status-error-text)',
          }}
        >
          <AlertTriangle size={24} />
        </div>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '8px',
          }}
        >
          Invalid or Expired Link
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-gray-600)',
            lineHeight: '22px',
            marginBottom: '24px',
          }}
        >
          {errorMessage}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-white)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            color: 'var(--color-gray-800)',
          }}
        >
          Check Again
        </button>
      </div>
    );
  }

  // 4. Passcode Gate View
  if (requiresPasscode) {
    return (
      <div
        style={{
          maxWidth: '440px',
          margin: '40px auto',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '40px 32px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
            }}
          >
            <Lock size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
              Protected Document
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>
              Passcode verification required
            </p>
          </div>
        </div>

        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-gray-600)',
            marginBottom: '20px',
            lineHeight: '20px',
          }}
        >
          The sender has secured this agreement with an access passcode. Enter your code below to
          view and execute this document.
        </p>

        <form onSubmit={handleVerifyPasscode}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="passcodeInput"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-gray-800)',
                marginBottom: '6px',
              }}
            >
              Access Passcode
            </label>
            <input
              id="passcodeInput"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoFocus
              style={{
                width: '100%',
                height: '38px',
                padding: '0 12px',
                fontSize: '14px',
                border: passcodeError
                  ? '1px solid var(--border-error)'
                  : '1px solid var(--border-color)',
                borderRadius: '6px',
                outline: 'none',
              }}
            />
            {passcodeError && (
              <p style={{ fontSize: '12px', color: 'var(--border-error)', marginTop: '4px' }}>
                {passcodeError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isVerifyingPasscode}
            style={{
              width: '100%',
              height: '38px',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-white)',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              fontSize: '14px',
              cursor: isVerifyingPasscode ? 'not-allowed' : 'pointer',
              opacity: isVerifyingPasscode ? 0.7 : 1,
            }}
          >
            {isVerifyingPasscode ? 'Verifying...' : 'Unlock Document'}
          </button>
        </form>
      </div>
    );
  }

  // 5. Signed Success Confirmation
  if (isSigned) {
    return (
      <div
        style={{
          maxWidth: '560px',
          margin: '40px auto',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-success-bg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: 'var(--status-success-text)',
          }}
        >
          <CheckCircle size={30} />
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '8px',
          }}
        >
          Document Successfully Signed
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-gray-600)',
            lineHeight: '22px',
            marginBottom: '24px',
          }}
        >
          Thank you, {signer?.name || 'Signer'}. Your electronic signature has been timestamped and
          permanently attached to the cryptographic audit trail.
        </p>

        {paymentLinkUrl && (
          <div
            style={{
              backgroundColor: 'var(--color-primary-subtle)',
              border: '1px solid var(--color-primary-muted)',
              borderRadius: '6px',
              padding: '20px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CreditCard size={18} color="var(--color-primary)" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Payment Required Upon Execution
              </span>
            </div>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-700)',
                marginBottom: '16px',
                lineHeight: '18px',
              }}
            >
              The agreement specifies that initial remuneration is due upon signature. Please
              proceed to the payment link below to complete your checkout.
            </p>
            <a
              href={paymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-white)',
                padding: '9px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              <span>Complete Payment</span>
              <ArrowRight size={15} />
            </a>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          {latestVersion?.fileUrl && (
            <a
              href={latestVersion.fileUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: 'var(--color-white)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-gray-800)',
                textDecoration: 'none',
              }}
            >
              <Download size={15} />
              <span>Download Executed Copy</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  // 6. Declined Confirmation
  if (isDeclined) {
    return (
      <div
        style={{
          maxWidth: '540px',
          margin: '40px auto',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-gray-100)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: 'var(--color-gray-600)',
          }}
        >
          <XCircle size={24} />
        </div>
        <h1
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '8px',
          }}
        >
          Document Execution Declined
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--color-gray-600)', lineHeight: '22px' }}>
          You have declined to sign this document. The sender has been notified with your feedback.
        </p>
      </div>
    );
  }

  const verificationMethod = signer?.verificationMethod || 'none';
  const hasAdvancedVerification = ['kba', 'id_document', 'qes'].includes(verificationMethod);
  const isVerified = isVerificationSatisfied();

  // 7. Active Document Viewing & Signing Experience
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Document Info Header */}
      <div
        style={{
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '24px 28px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <FileText size={18} color="var(--color-primary)" />
            <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
              {document?.title || 'Agreement for Execution'}
            </h1>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>
            Document #{document?.documentNumber || 'PI-2026-0001'} · Version{' '}
            {latestVersion?.versionNumber || 1}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>Signer Identity</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-900)' }}>
            {signer?.name} ({signer?.email})
          </div>
        </div>
      </div>

      {/* Advanced Verification Banner (Sprint 3.6) */}
      {hasAdvancedVerification && (
        <div
          style={{
            backgroundColor: isVerified
              ? 'var(--status-success-bg)'
              : 'var(--color-primary-subtle)',
            border: isVerified
              ? '1px solid var(--status-success-border)'
              : '1px solid var(--color-primary-muted)',
            borderRadius: '8px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isVerified ? (
              <ShieldCheck size={22} color="var(--status-success-text)" />
            ) : (
              <ShieldAlert size={22} color="var(--color-primary)" />
            )}
            <div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isVerified ? 'var(--status-success-text)' : 'var(--color-gray-950)',
                }}
              >
                {isVerified
                  ? `Identity Verified (${verificationMethod.toUpperCase()})`
                  : `Identity Verification Required (${verificationMethod.toUpperCase()})`}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                {isVerified
                  ? 'Your identity has been verified under legal compliance requirements.'
                  : 'The sender requires identity verification prior to executing this agreement.'}
              </div>
            </div>
          </div>

          {!isVerified && (
            <div>
              {verificationMethod === 'kba' && (
                <button
                  type="button"
                  onClick={handleStartKba}
                  disabled={kbaLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: kbaLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {kbaLoading ? 'Starting...' : 'Verify with KBA'}
                </button>
              )}
              {verificationMethod === 'id_document' && (
                <button
                  type="button"
                  onClick={handleStartGovId}
                  disabled={govIdLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: govIdLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {govIdLoading ? 'Starting...' : 'Verify Government ID'}
                </button>
              )}
              {verificationMethod === 'qes' && (
                <button
                  type="button"
                  onClick={handleStartQes}
                  disabled={qesLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: qesLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {qesLoading ? 'Starting...' : 'Verify with QES'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document Content Paper */}
      <div
        style={{
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '48px',
          minHeight: '480px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '20px',
            marginBottom: '28px',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
            STANDARD TERMS OF SERVICE & COLLABORATION AGREEMENT
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            This Agreement is made effective by and between the Sender and the executing Signatory.
          </p>
        </div>

        <div
          style={{
            fontSize: '14px',
            lineHeight: '24px',
            color: 'var(--color-gray-800)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <section>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '6px',
              }}
            >
              1. Purpose and Scope of Agreement
            </h3>
            <p>
              The parties acknowledge that this electronic document constitutes a binding commitment
              under applicable laws including the Electronic Signatures in Global and National
              Commerce Act (15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act.
            </p>
          </section>

          <section>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '6px',
              }}
            >
              2. Data Protection and Confidentiality
            </h3>
            <p>
              All confidential materials and business records exchanged pursuant to this agreement
              are safeguarded with AES-256 GCM envelope encryption. No customer data or proprietary
              documents are ever used for machine learning model training without explicit consent.
            </p>
          </section>

          <section>
            <h3
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '6px',
              }}
            >
              3. Execution in Counterparts
            </h3>
            <p>
              This document may be executed in one or more counterparts, each of which shall be
              deemed an original and all of which together shall constitute one and the same
              instrument. Delivery of an executed counterpart via cryptographic electronic
              transmission shall be legally effective.
            </p>
          </section>
        </div>

        <div
          style={{
            marginTop: '48px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '24px',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
            Digital fingerprint (SHA-256):{' '}
            <span style={{ fontFamily: 'monospace' }}>
              {latestVersion?.contentHash || 'a7b8c9d0e1f234567890abcdef123456'}
            </span>
          </div>
        </div>
      </div>

      {/* Recipient Action Bar */}
      <div
        style={{
          position: 'sticky',
          bottom: '24px',
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'var(--color-gray-600)',
          }}
        >
          <Lock size={16} color="var(--color-gray-400)" />
          <span>Your signature is legally binding under ESIGN and UETA</span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowDeclineModal(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--color-white)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-gray-700)',
              cursor: 'pointer',
            }}
          >
            Decline
          </button>
          <button
            onClick={() => {
              if (!isVerified) {
                if (verificationMethod === 'kba') handleStartKba();
                else if (verificationMethod === 'id_document') handleStartGovId();
                else if (verificationMethod === 'qes') handleStartQes();
                return;
              }
              setShowSignModal(true);
            }}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--color-primary)',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-white)',
              cursor: 'pointer',
            }}
          >
            {isVerified ? 'Sign Document' : 'Verify Identity to Sign'}
          </button>
        </div>
      </div>

      {/* KBA Questionnaire Modal */}
      {showKbaModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-white)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '560px',
              padding: '28px',
              boxShadow: 'var(--shadow-modal)',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  Knowledge-Based Authentication (KBA)
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  Attempt {4 - kbaAttemptsRemaining} of 3 · Verification via credit bureau records
                </p>
              </div>
              <button
                onClick={() => setShowKbaModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                ✕
              </button>
            </div>

            {kbaError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {kbaError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                marginBottom: '24px',
              }}
            >
              {kbaQuestions.map((q, idx) => (
                <div key={q.id}>
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--color-gray-900)',
                      marginBottom: '8px',
                    }}
                  >
                    {idx + 1}. {q.prompt}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          border:
                            kbaAnswers[q.id] === opt
                              ? '1px solid var(--color-primary)'
                              : '1px solid var(--border-color)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor:
                            kbaAnswers[q.id] === opt
                              ? 'var(--color-primary-subtle)'
                              : 'var(--color-white)',
                          fontSize: '13px',
                          color: 'var(--color-gray-800)',
                        }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={kbaAnswers[q.id] === opt}
                          onChange={() => setKbaAnswers({ ...kbaAnswers, [q.id]: opt })}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowKbaModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--color-gray-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitKba}
                disabled={kbaLoading || Object.keys(kbaAnswers).length < kbaQuestions.length}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor:
                    kbaLoading || Object.keys(kbaAnswers).length < kbaQuestions.length
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    kbaLoading || Object.keys(kbaAnswers).length < kbaQuestions.length ? 0.6 : 1,
                }}
              >
                {kbaLoading ? 'Verifying...' : 'Submit Answers'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Government ID & Biometric Verification Modal */}
      {showGovIdModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-white)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Government ID & Biometric Verification
              </h2>
              <button
                onClick={() => setShowGovIdModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                ✕
              </button>
            </div>

            {govIdError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {govIdError}
              </div>
            )}

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--color-gray-50)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '13px',
                color: 'var(--color-gray-700)',
                lineHeight: '20px',
                marginBottom: '20px',
              }}
            >
              <strong>GDPR & CCPA Zero-PII Notice:</strong> Your identity document and biometric
              facial analysis are verified in real time. PactIntel does not retain document photos,
              license numbers, or SSNs in internal datastores.
            </div>

            {govIdVerificationUrl && (
              <div style={{ marginBottom: '20px' }}>
                <a
                  href={govIdVerificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: 'var(--color-primary)',
                    textDecoration: 'underline',
                  }}
                >
                  <span>Open Identity Provider Portal in New Tab</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowGovIdModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--color-gray-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteGovIdCheck}
                disabled={govIdLoading}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: govIdLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {govIdLoading ? 'Checking Result...' : 'Confirm Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QES Modal */}
      {showQesModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-white)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                eIDAS Qualified Electronic Signature (QES)
              </h2>
              <button
                onClick={() => setShowQesModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                ✕
              </button>
            </div>

            {qesError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {qesError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px',
                backgroundColor: 'var(--color-primary-subtle)',
                borderRadius: '6px',
                marginBottom: '20px',
              }}
            >
              <Award size={24} color="var(--color-primary)" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  eIDAS Qualified Certificate
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                  Issued by {qesProvider} under EU Regulation No 910/2014.
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="qesCountrySelect"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-800)',
                  marginBottom: '6px',
                }}
              >
                EU Member State / Jurisdiction
              </label>
              <select
                id="qesCountrySelect"
                value={qesCountryCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setQesCountryCode(val);
                  if (val === 'DE') setQesProvider('D-Trust Qualified QTSP EU');
                  else if (val === 'FR') setQesProvider('CertEurope QTSP EU');
                  else if (val === 'IT') setQesProvider('InfoCert Qualified QTSP EU');
                  else setQesProvider('Cleverbase Qualified QTSP EU');
                }}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 10px',
                  fontSize: '13px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-white)',
                  color: 'var(--color-gray-900)',
                }}
              >
                <option value="DE">Germany (DE - D-Trust)</option>
                <option value="FR">France (FR - CertEurope)</option>
                <option value="IT">Italy (IT - InfoCert)</option>
                <option value="ES">Spain (ES - Camerfirma)</option>
                <option value="NL">Netherlands (NL - Cleverbase)</option>
              </select>
            </div>

            {qesSigningUrl && (
              <div style={{ marginBottom: '20px' }}>
                <a
                  href={qesSigningUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: 'var(--color-primary)',
                    textDecoration: 'underline',
                  }}
                >
                  <span>Authenticate on QTSP Portal ({qesProvider})</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowQesModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--color-gray-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteQesCheck}
                disabled={qesLoading}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: qesLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {qesLoading ? 'Verifying Certificate...' : 'Complete QES Verification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Capture Modal */}
      {showSignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-white)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '520px',
              padding: '28px',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Adopt Your Signature
              </h2>
              <button
                onClick={() => setShowSignModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                ✕
              </button>
            </div>

            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setSignatureMode('type')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border:
                    signatureMode === 'type'
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--border-color)',
                  backgroundColor:
                    signatureMode === 'type' ? 'var(--color-primary-subtle)' : 'var(--color-white)',
                  color:
                    signatureMode === 'type' ? 'var(--color-primary)' : 'var(--color-gray-700)',
                }}
              >
                <Type size={16} />
                <span>Type Signature</span>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode('draw')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border:
                    signatureMode === 'draw'
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--border-color)',
                  backgroundColor:
                    signatureMode === 'draw' ? 'var(--color-primary-subtle)' : 'var(--color-white)',
                  color:
                    signatureMode === 'draw' ? 'var(--color-primary)' : 'var(--color-gray-700)',
                }}
              >
                <PenTool size={16} />
                <span>Draw Signature</span>
              </button>
            </div>

            {/* Signature Area */}
            {signatureMode === 'type' ? (
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Enter full legal name"
                  style={{
                    width: '100%',
                    height: '48px',
                    padding: '0 16px',
                    fontSize: '18px',
                    fontFamily: 'cursive, sans-serif',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    outline: 'none',
                    backgroundColor: 'var(--color-gray-50)',
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <div
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={464}
                    height={140}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                      display: 'block',
                      backgroundColor: 'var(--color-gray-50)',
                      cursor: 'crosshair',
                      width: '100%',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '12px',
                      color: 'var(--color-gray-500)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear Drawing
                  </button>
                </div>
              </div>
            )}

            {/* Legal Assent Mandatory Gate */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={legalAssentChecked}
                  onChange={(e) => setLegalAssentChecked(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span
                  style={{ fontSize: '13px', color: 'var(--color-gray-700)', lineHeight: '18px' }}
                >
                  I agree to be legally bound by this document pursuant to the Electronic Signatures
                  in Global and National Commerce Act (E-SIGN) and UETA.
                </span>
              </label>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowSignModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--color-gray-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSign}
                disabled={
                  !legalAssentChecked ||
                  isSubmitting ||
                  (signatureMode === 'type' && !typedSignature.trim()) ||
                  (signatureMode === 'draw' && !hasDrawn)
                }
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: !legalAssentChecked || isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !legalAssentChecked || isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'Signing...' : 'Adopt & Sign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Modal */}
      {showDeclineModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-white)',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
              padding: '28px',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h2
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Decline to Sign Document
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-600)',
                marginBottom: '16px',
                lineHeight: '18px',
              }}
            >
              Please provide a reason for declining. This message will be sent directly to the
              document author.
            </p>

            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. Terms in Section 2 need revision before execution..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                outline: 'none',
                marginBottom: '20px',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  color: 'var(--color-gray-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteDecline}
                disabled={!declineReason.trim() || isSubmitting}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'var(--border-error)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: !declineReason.trim() || isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: !declineReason.trim() || isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
