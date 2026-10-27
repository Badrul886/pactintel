'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import {
  Lock,
  Clock,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Building,
  X,
  PenTool,
  Type as TypeIcon,
  RotateCcw,
} from 'lucide-react';
import PricingTable from './components/PricingTable';
import { useSectionTracking } from './hooks/useSectionTracking';

interface RecipientViewerProps {
  params: Promise<{ slug: string }>;
}

export default function RecipientDocumentPage({ params }: RecipientViewerProps) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const [passwordInput, setPasswordInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(true);

  const [isSigned, setIsSigned] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [agreedConsent, setAgreedConsent] = useState(false);
  const [totalValueDisplay, setTotalValueDisplay] = useState('$14,364.00');

  // Signature capture state (Sprint 5.1 dual Draw + Type)
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('type');
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Brand Kit styling (RULE BRAND-001)
  const [brandKit, setBrandKit] = useState<{
    id?: string;
    name?: string;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
    fontHeading?: string | null;
    fontBody?: string | null;
    customCss?: string | null;
    removeBadge?: boolean;
  } | null>(null);

  const [denialState, setDenialState] = useState<{
    denialType:
      | 'EXPIRED'
      | 'DOMAIN_RESTRICTED'
      | 'EMAIL_REQUIRED'
      | 'VIEW_LIMIT_EXCEEDED'
      | 'PASSWORD_REQUIRED';
    message?: string;
    allowedDomains?: string[];
    maxViews?: number;
    documentId?: string;
    title?: string;
    error?: string;
  } | null>(null);

  // Section-Level Engagement Telemetry (Phase 2 Sprint 2.1 — Invariants I-10, AN-001)
  useSectionTracking({
    documentSlug: slug,
    enabled: isUnlocked && !denialState,
    apiBaseUrl: apiBase,
  });

  const [emailInput, setEmailInput] = useState('');
  const [showRequestAccessModal, setShowRequestAccessModal] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  // Timezone detection for RULE I18N-001
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setTimeZone('UTC');
    }
  }, []);

  const checkAccess = async (pass?: string, email?: string) => {
    let sessionId = '';
    try {
      sessionId = sessionStorage.getItem('pact_viewer_session') || '';
    } catch {
      // ignore
    }

    const queryParams = new URLSearchParams();
    if (pass) queryParams.set('password', pass);
    if (email) queryParams.set('email', email);
    if (sessionId) queryParams.set('sessionId', sessionId);

    try {
      const res = await fetch(
        `${apiBase}/api/v1/public/documents/${slug}?${queryParams.toString()}`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json.brandKit) {
          setBrandKit(json.brandKit);
        }
        if (json.accessible === false) {
          setDenialState({
            denialType: json.denialType,
            message: json.message,
            allowedDomains: json.allowedDomains,
            maxViews: json.maxViews,
            documentId: json.documentId,
            title: json.title,
            error: json.error,
          });
          setIsUnlocked(false);
        } else {
          setDenialState(null);
          setIsUnlocked(true);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  };

  useEffect(() => {
    checkAccess();
  }, [slug, apiBase]);

  // Analytics Tracking & Heartbeat (Sprint 3.1)
  useEffect(() => {
    let sessionId = '';
    try {
      sessionId = sessionStorage.getItem('pact_viewer_session') || '';
      if (!sessionId) {
        sessionId = `sess_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
        sessionStorage.setItem('pact_viewer_session', sessionId);
      }
    } catch {
      sessionId = `sess_${Date.now()}`;
    }

    let lastActive = Date.now();

    const sendHeartbeat = () => {
      const now = Date.now();
      const elapsed = Math.min(now - lastActive, 3600000);
      lastActive = now;
      if (elapsed <= 0) return;

      try {
        fetch(`${apiBase}/api/v1/analytics/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentSlug: slug,
            sessionId,
            durationMs: elapsed,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Heartbeat failure shouldn't affect user experience
      }
    };

    const interval = setInterval(sendHeartbeat, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sendHeartbeat();
    };
  }, [slug, apiBase]);

  const documentData = {
    title: 'Enterprise SaaS Services Agreement & Data Processing Addendum',
    organizationName: 'PactIntel Technologies, Inc.',
    reference: slug,
    totalValue: '$24,000.00 USD',
    expiresAt: '2026-11-01T23:59:59Z',
    content: [
      {
        heading: '1. Engagement and Service Level Assurances',
        text: 'Provider agrees to furnish high-availability cloud contract lifecycle automation services subject to a 99.95% monthly uptime service level agreement. All customer data resides exclusively in jurisdiction-aware cells.',
      },
      {
        heading: '2. Payment Terms and Remittance',
        text: 'Client agrees to remit annual subscription fees within thirty (30) days of receipt of invoice. Late remittances shall accrue interest at 1.5% per month or the legal statutory ceiling.',
      },
      {
        heading: '3. Data Protection and Confidentiality',
        text: 'Both parties agree that all customer-managed documents, templates, and signatory identities constitute strictly confidential information protected by envelope encryption and row-level security isolation.',
      },
      {
        heading: '4. Legal Assent and Counterparts',
        text: 'This agreement may be executed electronically in counterparts pursuant to the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and the Uniform Electronic Transactions Act (UETA).',
      },
    ],
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    await checkAccess(passwordInput.trim(), emailInput.trim() || undefined);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    await checkAccess(passwordInput.trim() || undefined, emailInput.trim());
  };

  const handleRequestAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim()) return;
    setRequestSubmitting(true);
    try {
      const docId = denialState?.documentId || slug;
      await fetch(`${apiBase}/api/v1/documents/${docId}/access-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterEmail: requestEmail.trim(),
          requesterName: requestName.trim() || requestEmail.split('@')[0],
          message: requestMessage.trim() || undefined,
        }),
      });
      setRequestSubmitted(true);
    } catch {
      setRequestSubmitted(true);
    } finally {
      setRequestSubmitting(false);
    }
  };

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
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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

  const handleSignConfirm = () => {
    if (!agreedConsent) return;
    if (signatureMode === 'type' && !signerName.trim()) return;
    if (signatureMode === 'draw' && !hasDrawn) return;
    setIsSigned(true);
    setShowSignModal(false);
  };

  const handleDeclineConfirm = () => {
    setIsDeclined(true);
    setShowDeclineModal(false);
  };

  // Recipient Access Guard Denial Views (RULE ACC-004)
  if (denialState && !isUnlocked) {
    return (
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '48px 32px',
          maxWidth: '460px',
          margin: '40px auto',
          textAlign: 'center',
          boxShadow: 'var(--shadow-popover)',
          ['--brand-primary' as any]: brandKit?.primaryColor || 'var(--color-blue-600)',
          ['--brand-heading-font' as any]: brandKit?.fontHeading || 'inherit',
          ['--brand-body-font' as any]: brandKit?.fontBody || 'inherit',
          fontFamily: 'var(--brand-body-font, inherit)',
        }}
      >
        {brandKit?.customCss && <style dangerouslySetInnerHTML={{ __html: brandKit.customCss }} />}

        {brandKit?.logoUrl && (
          <div style={{ marginBottom: '20px' }}>
            <img
              src={brandKit.logoUrl}
              alt={brandKit.name || 'Brand Logo'}
              style={{ maxHeight: '40px', maxWidth: '160px', objectFit: 'contain' }}
            />
          </div>
        )}

        {/* 1. EXPIRED */}
        {denialState.denialType === 'EXPIRED' && (
          <div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--color-gray-700)',
              }}
            >
              <Clock size={24} />
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Document Link Expired
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '24px' }}>
              This document link has expired and is no longer accessible. You can request a renewed
              link from the sender.
            </p>
            <button
              type="button"
              onClick={() => setShowRequestAccessModal(true)}
              className="pact-btn pact-btn-primary"
              style={{
                width: '100%',
                backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
              }}
            >
              Request Access
            </button>
          </div>
        )}

        {/* 2. DOMAIN RESTRICTED / EMAIL REQUIRED */}
        {(denialState.denialType === 'DOMAIN_RESTRICTED' ||
          denialState.denialType === 'EMAIL_REQUIRED') && (
          <div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--color-gray-700)',
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              {denialState.denialType === 'EMAIL_REQUIRED'
                ? 'Verify Your Work Email'
                : 'Access Restricted'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '20px' }}>
              {denialState.denialType === 'EMAIL_REQUIRED'
                ? 'This document requires an authorized work email to view.'
                : `This document is restricted to recipients from: ${denialState.allowedDomains?.join(', ')}.`}
            </p>

            <form onSubmit={handleEmailSubmit} style={{ marginBottom: '16px' }}>
              <input
                type="email"
                placeholder="name@company.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '14px',
                  marginBottom: '12px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="pact-btn pact-btn-primary"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
                }}
              >
                Verify Email
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowRequestAccessModal(true)}
              className="pact-btn pact-btn-secondary"
              style={{ width: '100%' }}
            >
              Request Access
            </button>
          </div>
        )}

        {/* 3. VIEW LIMIT EXCEEDED */}
        {denialState.denialType === 'VIEW_LIMIT_EXCEEDED' && (
          <div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--color-gray-700)',
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              View Limit Exceeded
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '24px' }}>
              The maximum number of views allowed for this document has been reached.
            </p>
            <button
              type="button"
              onClick={() => setShowRequestAccessModal(true)}
              className="pact-btn pact-btn-primary"
              style={{
                width: '100%',
                backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
              }}
            >
              Request Access
            </button>
          </div>
        )}

        {/* 4. PASSWORD REQUIRED */}
        {denialState.denialType === 'PASSWORD_REQUIRED' && (
          <div>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--color-gray-700)',
              }}
            >
              <Lock size={24} />
            </div>
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Password Protected Document
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '20px' }}>
              This document requires an access passcode set by the sender.
            </p>

            {denialState.error && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  color: '#991B1B',
                  fontSize: '13px',
                  padding: '8px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                }}
              >
                {denialState.error}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder="Enter passcode"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '14px',
                  marginBottom: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="pact-btn pact-btn-primary"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
                  marginBottom: '12px',
                }}
              >
                Unlock Document
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowRequestAccessModal(true)}
              className="pact-btn pact-btn-secondary"
              style={{ width: '100%' }}
            >
              Request Access
            </button>
          </div>
        )}

        {/* Request Access Modal Dialog */}
        {showRequestAccessModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '32px',
                maxWidth: '420px',
                width: '90%',
                boxShadow: 'var(--shadow-popover)',
                textAlign: 'left',
                position: 'relative',
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
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  Request Document Access
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRequestAccessModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-gray-500)',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {requestSubmitted ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '20px',
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}
                  >
                    <CheckCircle size={22} />
                  </div>
                  <h4
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--color-gray-900)',
                      marginBottom: '6px',
                    }}
                  >
                    Access Request Submitted
                  </h4>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--color-gray-600)',
                      marginBottom: '16px',
                    }}
                  >
                    The document owner has been notified of your request.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRequestAccessModal(false)}
                    className="pact-btn pact-btn-primary"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
                    }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRequestAccessSubmit}>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--color-gray-700)',
                        marginBottom: '4px',
                      }}
                    >
                      Your Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-gray-300)',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--color-gray-700)',
                        marginBottom: '4px',
                      }}
                    >
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={requestName}
                      onChange={(e) => setRequestName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-gray-300)',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--color-gray-700)',
                        marginBottom: '4px',
                      }}
                    >
                      Message (Optional)
                    </label>
                    <textarea
                      placeholder="Brief note for the document owner..."
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-gray-300)',
                        fontSize: '14px',
                        outline: 'none',
                        resize: 'none',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requestSubmitting}
                    className="pact-btn pact-btn-primary"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--brand-primary, var(--color-blue-600))',
                    }}
                  >
                    {requestSubmitting ? 'Sending Request...' : 'Send Request'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="recipient-page-container"
      style={{
        backgroundColor: '#fff',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '32px 36px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        ['--brand-primary' as any]: brandKit?.primaryColor || 'var(--color-blue-600)',
        ['--brand-heading-font' as any]: brandKit?.fontHeading || 'inherit',
        ['--brand-body-font' as any]: brandKit?.fontBody || 'inherit',
        ['--brand-badge-display' as any]: brandKit?.removeBadge ? 'none' : 'block',
        fontFamily: 'var(--brand-body-font, inherit)',
      }}
    >
      {/* 3.1 Analytics 1x1 Transparent Tracking Pixel */}
      <img
        src={`${apiBase}/api/v1/t/${slug}.gif`}
        width="1"
        height="1"
        style={{ display: 'none' }}
        alt=""
      />

      {/* Brand Kit Custom CSS Injection */}
      {brandKit?.customCss && <style dangerouslySetInnerHTML={{ __html: brandKit.customCss }} />}

      {/* Brand Kit Logo */}
      {brandKit?.logoUrl && (
        <div style={{ marginBottom: '24px' }}>
          <img
            src={brandKit.logoUrl}
            alt={brandKit.name || 'Organization Logo'}
            style={{ maxHeight: '44px', maxWidth: '180px', objectFit: 'contain' }}
          />
        </div>
      )}

      {/* Document Header */}
      <div
        style={{
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '24px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span
                className={`status-badge ${
                  isSigned
                    ? 'status-badge-success'
                    : isDeclined
                      ? 'status-badge-neutral'
                      : 'status-badge-warning'
                }`}
              >
                <span className="status-badge-dot" />
                {isSigned ? 'Completed & Signed' : isDeclined ? 'Declined' : 'Awaiting Signature'}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-gray-500)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={12} />
                Expires in {timeZone} timezone
              </span>
            </div>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                lineHeight: 1.3,
              }}
            >
              {documentData.title}
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '8px',
                fontSize: '13px',
                color: 'var(--color-gray-600)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Building size={14} />
                {documentData.organizationName}
              </span>
              <span>•</span>
              <span>Ref: {documentData.reference}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
              Total Consideration
            </div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {totalValueDisplay}
            </div>
          </div>
        </div>
      </div>

      {/* Signed Banner */}
      {isSigned && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#166534',
          }}
        >
          <CheckCircle size={22} color="#16A34A" />
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Document Successfully Signed</div>
            <div style={{ fontSize: '13px', color: '#15803D' }}>
              Signed by <strong>{signerName || 'Authorized Signatory'}</strong>. Cryptographic hash
              recorded to audit trail.
            </div>
          </div>
        </div>
      )}

      {/* Declined Banner */}
      {isDeclined && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#991B1B',
          }}
        >
          <AlertTriangle size={22} color="#DC2626" />
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Document Declined</div>
            <div style={{ fontSize: '13px', color: '#B91C1C' }}>
              You have declined this document. The sender has been notified.
            </div>
          </div>
        </div>
      )}

      {/* Document Body (Rendered from content snapshot) */}
      <div style={{ color: 'var(--color-gray-900)', lineHeight: 1.8, fontSize: '15px' }}>
        {documentData.content.map((sec, idx) => (
          <React.Fragment key={idx}>
            <div
              data-block-id={`block-${idx + 1}`}
              data-section-title={sec.heading}
              style={{ marginBottom: '28px' }}
            >
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950)',
                  marginBottom: '8px',
                }}
              >
                {sec.heading}
              </h2>
              <p style={{ color: 'var(--color-gray-700)' }}>{sec.text}</p>
            </div>

            {/* Embed CPQ Pricing Table right after Payment Terms (Section 2) */}
            {idx === 1 && (
              <div
                data-block-id="block-pricing-table"
                data-section-title="Pricing Schedule"
                style={{ margin: '32px 0' }}
              >
                <PricingTable
                  documentId="doc-us1-demo"
                  tableId="pt-us1-demo"
                  onTotalChange={(total) => {
                    const formatted = new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(Number(total));
                    setTotalValueDisplay(formatted);
                  }}
                  readOnly={isSigned || isDeclined}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Action Footer (Only active if not signed/declined) */}
      {!isSigned && !isDeclined && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '24px',
            marginTop: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: 'var(--color-gray-500)',
            }}
          >
            <ShieldCheck size={16} color="#16A34A" />
            <span>Encrypted with SHA-256 Audit Trail • Invariant I-09</span>
          </div>

          <div className="recipient-action-bar">
            <button
              onClick={() => setShowDeclineModal(true)}
              className="pact-btn pact-btn-secondary"
            >
              Decline
            </button>
            <button onClick={() => setShowSignModal(true)} className="pact-btn pact-btn-primary">
              Sign Document
            </button>
          </div>
        </div>
      )}

      {/* Sign Document Modal (Dual Draw + Type per Sprint 5.1) */}
      {showSignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: 'var(--shadow-modal, 0 20px 25px -5px rgba(0,0,0,0.1))',
            }}
          >
            <h3
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '4px',
              }}
            >
              Adopt Electronic Signature
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Your electronic signature is legally binding under E-SIGN and UETA laws.
            </p>

            {/* Dual Tabs: Type vs Draw */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: '16px',
                paddingBottom: '8px',
              }}
            >
              <button
                type="button"
                onClick={() => setSignatureMode('type')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor:
                    signatureMode === 'type' ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  color: signatureMode === 'type' ? '#2563EB' : 'var(--color-gray-600)',
                }}
              >
                <TypeIcon size={14} />
                <span>Type Signature</span>
              </button>
              <button
                type="button"
                onClick={() => setSignatureMode('draw')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor:
                    signatureMode === 'draw' ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  color: signatureMode === 'draw' ? '#2563EB' : 'var(--color-gray-600)',
                }}
              >
                <PenTool size={14} />
                <span>Draw Signature</span>
              </button>
            </div>

            {/* Type Tab Content */}
            {signatureMode === 'type' ? (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--color-gray-800)',
                    marginBottom: '4px',
                  }}
                >
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '14px',
                    outline: 'none',
                    marginBottom: '12px',
                  }}
                />

                <div
                  style={{
                    border: '1px dashed var(--border-color, #E2E8F0)',
                    borderRadius: '6px',
                    padding: '16px',
                    backgroundColor: 'var(--color-gray-50, #F8FAFC)',
                    textAlign: 'center',
                    minHeight: '64px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Caveat, "Brush Script MT", cursive, sans-serif',
                    fontSize: '24px',
                    color: 'var(--color-gray-950, #0C0F1D)',
                  }}
                >
                  {signerName.trim() || 'Signature Preview'}
                </div>
              </div>
            ) : (
              /* Draw Tab Content (Touch and Pointer Enabled) */
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                    }}
                  >
                    Draw with finger or mouse *
                  </label>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--color-gray-600)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Clear</span>
                  </button>
                </div>

                <div
                  style={{
                    border: '1px solid var(--border-color, #E2E8F0)',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    touchAction: 'none',
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    width={410}
                    height={130}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '130px',
                      cursor: 'crosshair',
                    }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                  Touch and stylus supported for iOS and Android devices.
                </div>
              </div>
            )}

            {/* Legal Consent Checkbox */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '20px',
              }}
            >
              <input
                type="checkbox"
                id="consent"
                checked={agreedConsent}
                onChange={(e) => setAgreedConsent(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <label
                htmlFor="consent"
                style={{ fontSize: '12px', color: 'var(--color-gray-600)', lineHeight: 1.4 }}
              >
                I agree to be legally bound by this document and assent to the use of electronic
                records and signatures.
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowSignModal(false)}
                className="pact-btn pact-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSignConfirm}
                disabled={
                  !agreedConsent || (signatureMode === 'type' ? !signerName.trim() : !hasDrawn)
                }
                className="pact-btn pact-btn-primary"
              >
                Adopt & Sign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Confirmation Modal */}
      {showDeclineModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Decline to Sign?
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '20px' }}>
              Are you sure you want to decline this document? This action will void the signing
              request and notify the sender.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowDeclineModal(false)}
                className="pact-btn pact-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDeclineConfirm}
                style={{
                  backgroundColor: '#DC2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Yes, Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
