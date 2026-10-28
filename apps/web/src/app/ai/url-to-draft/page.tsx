'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Globe, AlertCircle, FileText, ShieldCheck, Zap } from 'lucide-react';

export default function UrlToDraftPublicPage() {
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/v1/ai/url-to-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error(
            data.message ||
              'You have reached the free limit (3 proposals per hour). Sign up to generate unlimited proposals.',
          );
        }
        throw new Error(data.message || `Generation failed with status ${res.status}`);
      }

      const proposal = await res.json();
      setResult(proposal);
    } catch (err: any) {
      setError(err.message || 'Failed to generate proposal from URL.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickUrl = (quickUrl: string) => {
    setUrl(quickUrl);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '40px 20px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Top Branding Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '18px',
              }}
            >
              P
            </div>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
              PactIntel
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link
              href="/login"
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-600)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#FFFFFF',
                backgroundColor: '#2563EB',
                padding: '6px 14px',
                borderRadius: '6px',
                textDecoration: 'none',
              }}
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#1D4ED8',
              marginBottom: '16px',
            }}
          >
            <Sparkles size={14} />
            <span>Free AI Commercial Tool</span>
          </div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--color-gray-950)',
              marginBottom: '12px',
            }}
          >
            Turn Any Website into a Commercial Proposal
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-gray-600)', lineHeight: '1.5' }}>
            Paste any company or product landing page. Our AI synthesizes their offerings, value
            propositions, and structure into a tailored commercial agreement in seconds.
          </p>
        </div>

        {/* URL Input Form Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid var(--color-gray-200)',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-gray-900)',
                marginBottom: '8px',
              }}
            >
              Target Website or Product URL
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Globe
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-gray-400)',
                  }}
                />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '14px',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Zap size={16} />
                {isLoading ? 'Synthesizing...' : 'Generate Proposal'}
              </button>
            </div>
          </form>

          {/* Quick-fill sample links */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--color-gray-500)',
            }}
          >
            <span>Try sample:</span>
            {['https://stripe.com', 'https://segment.com', 'https://datadoghq.com'].map(
              (sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => handleQuickUrl(sample)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '12px',
                  }}
                >
                  {sample.replace('https://', '')}
                </button>
              ),
            )}
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid var(--color-gray-100)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: 'var(--color-gray-500)',
            }}
          >
            <span>Rate limit: 3 proposals / hour per IP</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={14} color="#16A34A" /> SSRF protected
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '6px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#B91C1C',
              fontSize: '14px',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Proposal Output Card */}
        {result && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid var(--color-gray-200)',
              overflow: 'hidden',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-gray-200)',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#2563EB" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  {result.title}
                </h3>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                }}
              >
                Ephemeral Preview
              </span>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderLeft: '4px solid #2563EB',
                  backgroundColor: '#F0F7FF',
                  borderRadius: '0 6px 6px 0',
                  marginBottom: '20px',
                  fontSize: '14px',
                  color: 'var(--color-gray-800)',
                  lineHeight: '1.5',
                }}
              >
                <strong>Summary:</strong> {result.summary}
              </div>

              <div style={{ fontSize: '14px', color: 'var(--color-gray-700)', lineHeight: '1.7' }}>
                <h4
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950)',
                    marginBottom: '8px',
                  }}
                >
                  Proposed Collaboration & Scope of Services
                </h4>
                <p style={{ marginBottom: '16px' }}>
                  Based on our structural evaluation of your public platform offerings, this
                  proposal establishes a strategic commercial framework. PactIntel delivers
                  enterprise contract automation, row-level isolation, and verified audit trails.
                </p>

                <h4
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950)',
                    marginBottom: '8px',
                  }}
                >
                  Value Proposition & Business Impact
                </h4>
                <ul style={{ paddingLeft: '20px', marginBottom: '20px' }}>
                  <li style={{ marginBottom: '6px' }}>
                    Accelerated contract cycle turnaround from weeks to under 24 hours
                  </li>
                  <li style={{ marginBottom: '6px' }}>
                    Multi-party Deal Rooms for unified stakeholder collaboration
                  </li>
                  <li style={{ marginBottom: '6px' }}>
                    Legally compliant electronic signatures with locked-mode evidence storage
                  </li>
                </ul>
              </div>

              {/* High-Converting CTA Box */}
              <div
                style={{
                  marginTop: '28px',
                  padding: '20px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-200)',
                  textAlign: 'center',
                }}
              >
                <h4
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950)',
                    marginBottom: '6px',
                  }}
                >
                  Ready to send this proposal for electronic signature?
                </h4>
                <p
                  style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}
                >
                  Sign up for a PactIntel account to edit in our collaborative editor, connect your
                  CRM, and collect legally binding e-signatures.
                </p>
                <Link
                  href="/signup"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 24px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '14px',
                  }}
                >
                  Import into PactIntel & Start Free <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
