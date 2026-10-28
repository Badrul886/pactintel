'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, ArrowLeft, Building, Globe, FileText, X } from 'lucide-react';

interface CounterpartyItem {
  id: string;
  canonicalName: string;
  domain: string | null;
  aliases: string[];
  createdAt: string;
  _count?: {
    documents: number;
  };
}

export default function CounterpartiesPage() {
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDomain, setNewDomain] = useState<string>('');
  const [newAliases, setNewAliases] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchCounterparties = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `${apiBase}/api/v1/portfolio/counterparties?limit=100`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCounterparties(data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, searchQuery]);

  useEffect(() => {
    fetchCounterparties();
  }, [fetchCounterparties]);

  const handleCreateCounterparty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const aliasList = newAliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

      const res = await fetch(`${apiBase}/api/v1/portfolio/counterparties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalName: newName.trim(),
          domain: newDomain.trim() || undefined,
          aliases: aliasList,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to create counterparty: HTTP ${res.status}`);
      }

      setIsModalOpen(false);
      setNewName('');
      setNewDomain('');
      setNewAliases('');
      await fetchCounterparties();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating counterparty.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: '32px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          href="/portfolio"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#6B7280',
            textDecoration: 'none',
            marginBottom: '12px',
          }}
        >
          <ArrowLeft size={14} /> Back to Portfolio Intelligence
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>
              Counterparties Directory
            </h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>
              Normalized legal entities, alternate trading aliases, and agreement portfolios.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: '9px 16px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} /> Add Counterparty
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative', width: '360px', marginBottom: '20px' }}>
        <Search
          size={16}
          color="#9CA3AF"
          style={{ position: 'absolute', left: '12px', top: '11px' }}
        />
        <input
          type="text"
          placeholder="Search by counterparty name or domain..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 36px',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      </div>

      {/* Counterparties Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}
        >
          <thead>
            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Legal Entity (Canonical)
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>Domain</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Recognized Aliases
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Agreements Count
              </th>
              <th
                style={{
                  padding: '12px 16px',
                  fontWeight: 600,
                  color: '#4B5563',
                  textAlign: 'right',
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {counterparties.map((cp) => (
              <tr key={cp.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building size={16} color="#6B7280" />
                    {cp.canonicalName}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#4B5563' }}>
                  {cp.domain ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Globe size={14} color="#9CA3AF" />
                      {cp.domain}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {cp.aliases && cp.aliases.length > 0 ? (
                      cp.aliases.map((alias, i) => (
                        <span
                          key={i}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#F3F4F6',
                            color: '#4B5563',
                            borderRadius: '12px',
                            fontSize: '11px',
                          }}
                        >
                          {alias}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>None</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', color: '#111827', fontWeight: 500 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={14} color="#2563EB" />
                    {cp._count?.documents ?? 0} agreement(s)
                  </span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <Link
                    href={`/portfolio?counterpartyId=${cp.id}`}
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2563EB',
                      textDecoration: 'none',
                    }}
                  >
                    View Agreements &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {counterparties.length === 0 && !isLoading && (
          <div
            style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280', fontSize: '14px' }}
          >
            No counterparties found.
          </div>
        )}
      </div>

      {/* New Counterparty Modal */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              width: '480px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
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
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>
                Add New Counterparty
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                <X size={20} />
              </button>
            </div>

            {errorMessage && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                }}
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCreateCounterparty}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Canonical Company / Entity Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Web Domain
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Known Aliases (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Inc, Acme US, Acme Global Ltd"
                  value={newAliases}
                  onChange={(e) => setNewAliases(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#FFFFFF',
                    color: '#4B5563',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Creating...' : 'Save Counterparty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
