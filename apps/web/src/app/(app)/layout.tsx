import React from 'react';
import Link from 'next/link';
import NotificationBell from '../../components/layout/NotificationBell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--surface-page)' }}>
      {/* Sidebar Nav */}
      <aside
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--surface-sidebar)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <div
          style={{
            marginBottom: '24px',
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--color-gray-950)',
          }}
        >
          PactIntel
        </div>

        {/* Workspace Selector */}
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--surface-card)',
            borderRadius: 'var(--radius-default)',
            border: '1px solid var(--border-color)',
            marginBottom: '20px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          General Workspace
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-default)',
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/documents"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-default)',
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Documents
          </Link>
          <Link
            href="/templates"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-default)',
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Templates
          </Link>
          <Link
            href="/settings/brand-kit"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-default)',
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Brand Kits
          </Link>
          <Link
            href="/settings/billing"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-default)',
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Billing & Plans
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header
          style={{
            height: 'var(--topbar-height)',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--surface-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
            Workspace / Documents
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <NotificationBell />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Admin User</span>
          </div>
        </header>

        <main style={{ padding: '32px 40px', maxWidth: 'var(--content-max-width)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
