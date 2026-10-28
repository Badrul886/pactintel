'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface PortfolioDashboardData {
  totalAgreements: number;
  activeAgreements: number;
  counterpartiesCount: number;
  obligationCounts: {
    total: number;
    verified: number;
    pendingAmendments: number;
    unverified: number;
  };
  upcomingExpirations30: number;
  upcomingExpirations90: number;
}

interface SearchResultItem {
  id: string;
  title: string;
  status: string;
  type?: string;
  counterpartyName?: string;
  snippet?: string;
  score?: number;
}

export default function PortfolioDashboardPage() {
  const [metrics, setMetrics] = useState<PortfolioDashboardData | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchEngine, setSearchEngine] = useState<string>('');

  // AI Portfolio Report State
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/dashboard`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/portfolio/search?q=${encodeURIComponent(searchQuery)}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
        setSearchEngine(data.engine || 'meilisearch');
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focusArea: 'Renewal Risks and Obligation Amendment Reviews' }),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Report generation failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      setAiReport(data.report);
    } catch (err: any) {
      setReportError(err.message || 'Failed to generate AI executive report.');
    } finally {
      setIsGeneratingReport(false);
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>
            Portfolio Intelligence
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>
            AI-extracted portfolio agreements, counterparty directory, and contractual obligations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href="/portfolio/obligations"
            style={{
              padding: '9px 16px',
              backgroundColor: '#FFFFFF',
              color: '#374151',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={16} />
            Obligations Tracker
          </Link>
          <Link
            href="/portfolio/counterparties"
            style={{
              padding: '9px 16px',
              backgroundColor: '#FFFFFF',
              color: '#374151',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Users size={16} />
            Counterparties
          </Link>
          <button
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            style={{
              padding: '9px 16px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isGeneratingReport ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={16} />
            {isGeneratingReport ? 'Analyzing Portfolio...' : 'Generate AI Risk Report'}
          </button>
        </div>
      </div>

      {/* Pending Amendment Review Banner (RULE PORT-001) */}
      {metrics && metrics.obligationCounts?.pendingAmendments > 0 && (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle color="#D97706" size={24} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#92400E' }}>
                {metrics.obligationCounts.pendingAmendments} Contract Amendment Diff(s) Awaiting
                Review
              </div>
              <div style={{ fontSize: '13px', color: '#B45309' }}>
                Amended document versions contain modified obligation terms. Per governance rules,
                changes are pending human confirmation before activation.
              </div>
            </div>
          </div>
          <Link
            href="/portfolio/obligations?hasPendingUpdate=true"
            style={{
              padding: '6px 12px',
              backgroundColor: '#D97706',
              color: '#FFFFFF',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Review Diffs <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280' }}>
              Total Agreements
            </span>
            <FileText size={18} color="#2563EB" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '8px' }}>
            {isLoadingMetrics ? '...' : (metrics?.totalAgreements ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#10B981', marginTop: '4px' }}>
            {metrics?.activeAgreements ?? 0} actively executed
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280' }}>
              Active Counterparties
            </span>
            <Users size={18} color="#2563EB" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '8px' }}>
            {isLoadingMetrics ? '...' : (metrics?.counterpartiesCount ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
            Normalized legal entities
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280' }}>
              Contractual Obligations
            </span>
            <CheckCircle2 size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '8px' }}>
            {isLoadingMetrics ? '...' : (metrics?.obligationCounts?.total ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
            {metrics?.obligationCounts?.verified ?? 0} human-verified (
            {metrics?.obligationCounts?.unverified ?? 0} unverified)
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280' }}>
              Renewals (30 / 90 Days)
            </span>
            <Clock size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '8px' }}>
            {isLoadingMetrics
              ? '...'
              : `${metrics?.upcomingExpirations30 ?? 0} / ${metrics?.upcomingExpirations90 ?? 0}`}
          </div>
          <div style={{ fontSize: '12px', color: '#B45309', marginTop: '4px' }}>
            Automated milestone notifications
          </div>
        </div>
      </div>

      {/* AI Risk Report View */}
      {aiReport && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert color="#2563EB" size={20} />
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>
                Executive AI Portfolio Risk & Renewal Intelligence
              </h2>
            </div>
            <button
              onClick={() => setAiReport(null)}
              style={{
                fontSize: '12px',
                color: '#6B7280',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close Report
            </button>
          </div>
          <div
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              color: '#374151',
              whiteSpace: 'pre-wrap',
              backgroundColor: '#F9FAFB',
              padding: '16px',
              borderRadius: '6px',
              border: '1px solid #E5E7EB',
            }}
          >
            {aiReport}
          </div>
        </div>
      )}

      {reportError && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            marginBottom: '24px',
          }}
        >
          {reportError}
        </div>
      )}

      {/* Global Portfolio Search */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
          Portfolio Clause & Agreement Search
        </h2>
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              color="#9CA3AF"
              style={{ position: 'absolute', left: '12px', top: '11px' }}
            />
            <input
              type="text"
              placeholder="Search across all contracts, clauses, counterparty names, terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 38px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            style={{
              padding: '9px 20px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isSearching ? 'not-allowed' : 'pointer',
            }}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '12px' }}>
              Found {searchResults.length} result(s) via search engine ({searchEngine})
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563' }}>
                    Document Title
                  </th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563' }}>
                    Counterparty
                  </th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563' }}>Type</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563' }}>
                    Status
                  </th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563' }}>
                    Matching Excerpt
                  </th>
                  <th
                    style={{
                      padding: '10px 12px',
                      fontWeight: 600,
                      color: '#4B5563',
                      textAlign: 'right',
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>
                      <Link
                        href={`/documents/${item.id}`}
                        style={{ color: '#2563EB', textDecoration: 'none' }}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#4B5563' }}>
                      {item.counterpartyName || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6B7280' }}>
                      {item.type || 'Contract'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: item.status === 'executed' ? '#DEF7EC' : '#F3F4F6',
                          color: item.status === 'executed' ? '#03543F' : '#374151',
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        color: '#6B7280',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.snippet}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <Link
                        href={`/documents/${item.id}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#2563EB',
                          textDecoration: 'none',
                        }}
                      >
                        Open Agreement &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {searchResults.length === 0 && searchQuery && !isSearching && (
          <div
            style={{ textAlign: 'center', padding: '32px 0', color: '#6B7280', fontSize: '14px' }}
          >
            No matching agreements or clauses found for &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </div>
    </div>
  );
}
