import React from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
            Dashboard
          </h1>
          <p style={{ color: 'var(--color-gray-600)', marginTop: '4px' }}>
            Overview of active documents, signatures, and payments.
          </p>
        </div>
        <Link href="/documents" className="pact-btn pact-btn-primary">
          View Documents
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div
          style={{
            padding: '20px',
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', fontWeight: 500 }}>
            Awaiting Signature
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 600,
              marginTop: '8px',
              color: 'var(--color-gray-950)',
            }}
          >
            3
          </div>
        </div>
        <div
          style={{
            padding: '20px',
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', fontWeight: 500 }}>
            Completed (This Month)
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 600,
              marginTop: '8px',
              color: 'var(--color-gray-950)',
            }}
          >
            12
          </div>
        </div>
        <div
          style={{
            padding: '20px',
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', fontWeight: 500 }}>
            Total Pipeline Value
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 600,
              marginTop: '8px',
              color: 'var(--color-gray-950)',
            }}
          >
            $48,500.00
          </div>
        </div>
      </div>
    </div>
  );
}
