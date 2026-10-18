'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText, ChevronRight } from 'lucide-react';

interface DocumentItem {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired' | 'archived';
  statusLabel: string;
  owner: string;
  value: string;
  sentAt: string;
}

export default function DocumentsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const [documents] = useState<DocumentItem[]>([
    {
      id: 'doc_1',
      title: 'Northwind Enterprise Master Service Agreement 2026',
      status: 'signed',
      statusLabel: 'Signed',
      owner: 'Sarah Connor',
      value: '$24,500.00',
      sentAt: '2026-10-12',
    },
    {
      id: 'doc_2',
      title: 'Acme SaaS Subscription & Service Level Agreement',
      status: 'sent',
      statusLabel: 'Awaiting signature',
      owner: 'Alex Vance',
      value: '$12,000.00',
      sentAt: '2026-10-15',
    },
    {
      id: 'doc_3',
      title: 'Starlight Media Master Service Agreement',
      status: 'draft',
      statusLabel: 'Draft',
      owner: 'Sarah Connor',
      value: '$8,400.00',
      sentAt: '—',
    },
  ]);

  const filteredDocs = documents.filter((doc) => {
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'sent'
          ? doc.status === 'sent' || doc.status === 'viewed'
          : doc.status === filter;
    const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      {/* Page Header */}
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
            Documents
          </h1>
          <p style={{ color: 'var(--color-gray-600)', marginTop: '4px', fontSize: '14px' }}>
            Manage contracts, proposals, and electronic signatures.
          </p>
        </div>
        <Link
          href="/documents/new"
          className="pact-btn pact-btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            textDecoration: 'none',
          }}
        >
          <Plus size={16} />
          New Document
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          gap: '16px',
        }}
      >
        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: 'var(--color-gray-100)',
            padding: '3px',
            borderRadius: '6px',
          }}
        >
          {[
            { id: 'all', label: 'All' },
            { id: 'draft', label: 'Drafts' },
            { id: 'sent', label: 'In Progress' },
            { id: 'signed', label: 'Signed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: 'none',
                fontSize: '13px',
                fontWeight: filter === tab.id ? 600 : 500,
                color: filter === tab.id ? 'var(--color-gray-900)' : 'var(--color-gray-600)',
                backgroundColor: filter === tab.id ? '#fff' : 'transparent',
                boxShadow: filter === tab.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '260px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '10px',
              top: '10px',
              color: 'var(--color-gray-400)',
            }}
          />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              borderRadius: '6px',
              border: '1px solid var(--color-gray-300)',
              fontSize: '13px',
              outline: 'none',
              backgroundColor: '#fff',
            }}
          />
        </div>
      </div>

      {/* Tabular List (Design System Rule: Real HTML tables for documents) */}
      <div className="pact-table-container">
        {filteredDocs.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '20px',
                backgroundColor: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-gray-500)',
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-gray-900)' }}>
                No documents found
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                {search
                  ? 'Try adjusting your search query.'
                  : 'Create your first proposal or contract to get started.'}
              </div>
            </div>
            {!search && (
              <Link
                href="/documents/new"
                className="pact-btn pact-btn-secondary"
                style={{ marginTop: '8px', textDecoration: 'none' }}
              >
                Create Document
              </Link>
            )}
          </div>
        ) : (
          <table className="pact-table">
            <thead>
              <tr>
                <th>Document Title</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Total Value</th>
                <th>Sent Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const statusClass =
                  doc.status === 'signed'
                    ? 'status-badge-success'
                    : doc.status === 'sent' || doc.status === 'viewed'
                      ? 'status-badge-warning'
                      : 'status-badge-neutral';

                return (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 500, color: 'var(--color-gray-950)' }}>
                      <Link
                        href={`/documents/${doc.id}/edit`}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {doc.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`status-badge ${statusClass}`}>
                        <span className="status-badge-dot" />
                        {doc.statusLabel}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-gray-600)' }}>{doc.owner}</td>
                    <td
                      style={{ color: 'var(--color-gray-800)', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {doc.value}
                    </td>
                    <td style={{ color: 'var(--color-gray-500)' }}>{doc.sentAt}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/documents/${doc.id}/edit`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                          fontWeight: 500,
                          fontSize: '13px',
                        }}
                      >
                        Edit
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
