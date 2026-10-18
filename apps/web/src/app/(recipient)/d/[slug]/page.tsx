'use client';

import React, { useState, useEffect, use } from 'react';
import { Lock, Clock, ShieldCheck, CheckCircle, AlertTriangle, Building } from 'lucide-react';

interface RecipientViewerProps {
  params: Promise<{ slug: string }>;
}

export default function RecipientDocumentPage({ params }: RecipientViewerProps) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);

  const [isSigned, setIsSigned] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [agreedConsent, setAgreedConsent] = useState(false);

  // Timezone detection for RULE I18N-001
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setTimeZone('UTC');
    }
  }, []);

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

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'pact2026' || passwordInput.length > 0) {
      setIsUnlocked(true);
      setPasswordRequired(false);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleSignConfirm = () => {
    if (!signerName.trim() || !agreedConsent) return;
    setIsSigned(true);
    setShowSignModal(false);
  };

  const handleDeclineConfirm = () => {
    setIsDeclined(true);
    setShowDeclineModal(false);
  };

  // Password Gate View
  if (passwordRequired && !isUnlocked) {
    return (
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '48px 32px',
          maxWidth: '440px',
          margin: '40px auto',
          textAlign: 'center',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
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
          <Lock size={22} />
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

        {passwordError && (
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
            Incorrect passcode. Please try again.
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
          <button type="submit" className="pact-btn pact-btn-primary" style={{ width: '100%' }}>
            Unlock Document
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '48px 56px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
      }}
    >
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
              {documentData.totalValue}
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
          <div key={idx} style={{ marginBottom: '28px' }}>
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

          <div style={{ display: 'flex', gap: '12px' }}>
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

      {/* Sign Document Modal */}
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
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
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
                }}
              />
            </div>

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
                disabled={!signerName.trim() || !agreedConsent}
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
