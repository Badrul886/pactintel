import React from 'react';

export default function RecipientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface-page)',
      }}
    >
      {/* Minimal clean header with no app sidebar (Design System §10) */}
      <header
        style={{
          height: '56px',
          backgroundColor: 'var(--color-white)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-gray-950)' }}>
          PactIntel Secure Review
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>Encrypted & Verified</div>
      </header>

      {/* Recipient document container */}
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ width: '100%', maxWidth: 'var(--recipient-max-width)' }}>{children}</div>
      </main>

      {/* Subtle bottom trust indicator (RULE BRAND-001) */}
      <footer
        id="pact-recipient-footer"
        style={{
          padding: '24px 0',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--color-gray-400)',
          display: 'var(--brand-badge-display, block)',
        }}
      >
        Powered by PactIntel E-Signature Platform
      </footer>
    </div>
  );
}
