'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface ClickwrapPublicData {
  agreementName: string;
  slug: string;
  versionId: string;
  versionNumber: number;
  content: string;
  contentHash: string;
  publishedAt?: string;
}

export default function ClickwrapWidgetPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<ClickwrapPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptanceResult, setAcceptanceResult] = useState<{
    acceptanceId: string;
    acceptedAt: string;
    versionNumber: number;
  } | null>(null);

  useEffect(() => {
    if (slug) {
      fetchAgreement();
    }
  }, [slug]);

  const fetchAgreement = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/public/clickwrap/${slug}`);
      if (!res.ok) {
        if (res.status === 404)
          throw new Error('No active clickwrap agreement found for this link.');
        throw new Error('Failed to load agreement');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error loading agreement');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    if (!signerEmail || !signerEmail.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/public/clickwrap/${slug}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signerEmail,
          name: signerName || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to record acceptance');
      }

      const result = await res.json();
      setAcceptanceResult(result);
    } catch (err: any) {
      setError(err.message || 'Error recording acceptance');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-default)',
          color: 'var(--color-gray-500)',
          fontSize: '14px',
        }}
      >
        Loading agreement...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: 'var(--status-error-bg)',
          color: 'var(--status-error-text)',
          border: '1px solid var(--border-error)',
          borderRadius: 'var(--radius-default)',
          fontSize: '13px',
          textAlign: 'center',
        }}
      >
        {error}
      </div>
    );
  }

  if (acceptanceResult) {
    return (
      <div
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-default)',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '24px',
            backgroundColor: 'var(--status-success-bg)',
            color: 'var(--status-success-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            fontSize: '22px',
            fontWeight: 'bold',
          }}
        >
          ✓
        </div>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '6px',
          }}
        >
          Agreement Accepted
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
          Thank you. Your consent to <strong>{data?.agreementName}</strong> (Version{' '}
          {acceptanceResult.versionNumber}) has been recorded.
        </p>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: 'var(--color-gray-50)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            padding: '12px 16px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: 'var(--color-gray-800)',
            textAlign: 'left',
          }}
        >
          <div>Acceptance ID: {acceptanceResult.acceptanceId}</div>
          <div>Timestamp: {new Date(acceptanceResult.acceptedAt).toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            A cryptographic audit record (with IP address & client info) has been permanently
            sealed.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-default)',
        padding: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1
            style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950)', margin: 0 }}
          >
            {data?.agreementName}
          </h1>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-gray-100)',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--color-gray-700)',
            }}
          >
            v{data?.versionNumber}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--border-error)',
            borderRadius: 'var(--radius-default)',
            padding: '10px 14px',
            marginBottom: '14px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Scrollable Terms Content */}
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-default)',
          backgroundColor: 'var(--color-gray-50)',
          padding: '16px',
          height: '240px',
          overflowY: 'auto',
          fontSize: '13px',
          lineHeight: '1.6',
          color: 'var(--color-gray-800)',
          marginBottom: '20px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {data?.content}
      </div>

      {/* Acceptance Form */}
      <form onSubmit={handleAccept}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}
            >
              Your Full Name (Optional)
            </label>
            <input
              type="text"
              placeholder="Jane Doe"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}
            >
              Your Work Email *
            </label>
            <input
              type="email"
              required
              placeholder="jane@company.com"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              color: 'var(--color-gray-950)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <span>
              I have read, understood, and hereby agree to be legally bound by the terms of the{' '}
              <strong>{data?.agreementName}</strong> (Version {data?.versionNumber}).
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!agreed || submitting || !signerEmail}
          style={{
            width: '100%',
            padding: '11px 16px',
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-white)',
            border: 'none',
            borderRadius: 'var(--radius-default)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: !agreed || submitting || !signerEmail ? 'not-allowed' : 'pointer',
            opacity: !agreed || submitting || !signerEmail ? 0.6 : 1,
            transition: 'background-color 150ms ease',
          }}
        >
          {submitting ? 'Recording Consent...' : 'I Agree & Accept'}
        </button>
      </form>
    </div>
  );
}
