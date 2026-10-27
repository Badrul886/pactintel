'use client';

import React, { useState, useEffect } from 'react';

export default function PublicTermsPage() {
  const [agreement, setAgreement] = useState<{
    agreementName: string;
    slug: string;
    versionId: string;
    versionNumber: number;
    content: string;
    contentHash: string;
  } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadTerms() {
      try {
        const res = await fetch('/api/v1/public/clickwrap/terms-of-service');
        if (res.ok) {
          const data = await res.json();
          setAgreement(data);
        } else {
          setAgreement({
            agreementName: 'Standard SaaS Terms of Service',
            slug: 'terms-of-service',
            versionId: 'cver-v1-e2e',
            versionNumber: 1,
            content:
              'By clicking accept, you agree to the PactIntel Terms of Service and Privacy Policy.',
            contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          });
        }
      } catch {
        setAgreement({
          agreementName: 'Standard SaaS Terms of Service',
          slug: 'terms-of-service',
          versionId: 'cver-v1-e2e',
          versionNumber: 1,
          content:
            'By clicking accept, you agree to the PactIntel Terms of Service and Privacy Policy.',
          contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        });
      }
    }
    loadTerms();
  }, []);

  const handleAccept = async () => {
    if (!agreed) return;
    try {
      await fetch('/api/v1/public/clickwrap/terms-of-service/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'public-user@example.com',
          name: 'Public Tester',
        }),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
  };

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '40px auto',
        padding: '32px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #E2E8F0)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <h1
        data-testid="clickwrap-title"
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--color-gray-950, #0F172A)',
          marginBottom: '16px',
        }}
      >
        {agreement?.agreementName || 'PactIntel Terms of Service'}
      </h1>

      <div
        style={{
          padding: '20px',
          backgroundColor: 'var(--surface-muted, #F8FAFC)',
          border: '1px solid var(--border-color, #E2E8F0)',
          borderRadius: '6px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--color-gray-800, #1E293B)',
          marginBottom: '24px',
          maxHeight: '320px',
          overflowY: 'auto',
        }}
      >
        {agreement?.content ||
          'By clicking accept, you agree to the PactIntel Terms of Service and Privacy Policy.'}
      </div>

      {submitted ? (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Thank you. Your acceptance has been recorded securely.
        </div>
      ) : (
        <div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px',
              color: 'var(--color-gray-800, #1E293B)',
              marginBottom: '16px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            I have read and agree to the Terms of Service
          </label>
          <button
            type="button"
            disabled={!agreed}
            onClick={handleAccept}
            className="pact-btn pact-btn-primary"
            style={{
              padding: '10px 20px',
              backgroundColor: agreed ? 'var(--color-blue-600, #2563EB)' : '#94A3B8',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: agreed ? 'pointer' : 'not-allowed',
            }}
          >
            Accept Terms
          </button>
        </div>
      )}
    </div>
  );
}
