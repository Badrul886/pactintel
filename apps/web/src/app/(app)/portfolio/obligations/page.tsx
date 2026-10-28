'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, ArrowLeft, Check, X, Search } from 'lucide-react';

interface ObligationItem {
  id: string;
  documentId: string;
  documentVersionId: string;
  fieldName: string;
  fieldValue: string | null;
  fieldValueNumeric: number | null;
  fieldValueDate: string | null;
  fieldType: string;
  confidenceScore: number | null;
  extractionMethod: string;
  isCustomField: boolean;
  isVerified: boolean;
  pendingUpdate: {
    proposedValue?: string;
    proposedDueDate?: string;
    confidenceScore?: number;
    sourceSnippet?: string;
    reason?: string;
    detectedAt?: string;
  } | null;
  createdAt: string;
  document?: {
    id: string;
    title: string;
    status: string;
    counterparty?: {
      canonicalName: string;
    };
  };
}

export default function ObligationsTrackerPage() {
  const [obligations, setObligations] = useState<ObligationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'unverified' | 'verified'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedForReview, setSelectedForReview] = useState<ObligationItem | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchObligations = useCallback(async () => {
    setIsLoading(true);
    try {
      let url = `${apiBase}/api/v1/portfolio/obligations?limit=100`;
      if (activeTab === 'pending') {
        url += '&hasPendingUpdate=true';
      } else if (activeTab === 'verified') {
        url += '&isVerified=true';
      } else if (activeTab === 'unverified') {
        url += '&isVerified=false';
      }

      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setObligations(data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, activeTab]);

  useEffect(() => {
    fetchObligations();
  }, [fetchObligations]);

  const handleVerify = async (id: string) => {
    setIsProcessingAction(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/obligations/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Verification failed: HTTP ${res.status}`);
      }
      await fetchObligations();
    } catch (err: any) {
      setActionError(err.message || 'Failed to verify obligation.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleConfirmAmendment = async (id: string) => {
    setIsProcessingAction(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/obligations/${id}/confirm-amendment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Confirm amendment failed: HTTP ${res.status}`);
      }
      setSelectedForReview(null);
      await fetchObligations();
    } catch (err: any) {
      setActionError(err.message || 'Failed to confirm amendment update.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDismissAmendment = async (id: string) => {
    setIsProcessingAction(true);
    setActionError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/portfolio/obligations/${id}/dismiss-amendment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Dismiss amendment failed: HTTP ${res.status}`);
      }
      setSelectedForReview(null);
      await fetchObligations();
    } catch (err: any) {
      setActionError(err.message || 'Failed to dismiss amendment update.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const filteredObligations = obligations.filter((o) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      o.fieldName.toLowerCase().includes(q) ||
      (o.fieldValue && o.fieldValue.toLowerCase().includes(q)) ||
      (o.document?.title && o.document.title.toLowerCase().includes(q))
    );
  });

  const pendingCount = obligations.filter((o) => o.pendingUpdate !== null).length;

  return (
    <div
      style={{
        padding: '32px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Navigation & Header */}
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
              Obligations Tracker
            </h1>
            <p style={{ fontSize: '14px', color: '#6B7280', marginTop: '4px' }}>
              Extracted contractual obligations, renewal deadlines, and amendment change reviews.
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Tabs & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #E5E7EB',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              fontSize: '14px',
              fontWeight: activeTab === 'all' ? 600 : 500,
              color: activeTab === 'all' ? '#2563EB' : '#6B7280',
              borderBottom: activeTab === 'all' ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            All Obligations
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              fontSize: '14px',
              fontWeight: activeTab === 'pending' ? 600 : 500,
              color: activeTab === 'pending' ? '#D97706' : '#6B7280',
              borderBottom: activeTab === 'pending' ? '2px solid #D97706' : '2px solid transparent',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertTriangle size={15} color="#D97706" />
            Pending Amendment Review
            {pendingCount > 0 && (
              <span
                style={{
                  backgroundColor: '#FEF3C7',
                  color: '#92400E',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('unverified')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              fontSize: '14px',
              fontWeight: activeTab === 'unverified' ? 600 : 500,
              color: activeTab === 'unverified' ? '#2563EB' : '#6B7280',
              borderBottom:
                activeTab === 'unverified' ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            Unverified
          </button>
          <button
            onClick={() => setActiveTab('verified')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              fontSize: '14px',
              fontWeight: activeTab === 'verified' ? 600 : 500,
              color: activeTab === 'verified' ? '#2563EB' : '#6B7280',
              borderBottom:
                activeTab === 'verified' ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            Human-Verified
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px', marginBottom: '8px' }}>
          <Search
            size={16}
            color="#9CA3AF"
            style={{ position: 'absolute', left: '10px', top: '10px' }}
          />
          <input
            type="text"
            placeholder="Filter obligations..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Real Table of Obligations */}
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
                Field / Obligation
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Document Title
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Active Value
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>Due Date</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>
                Confidence
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4B5563' }}>Status</th>
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
            {filteredObligations.map((ob) => {
              const hasAmendment = ob.pendingUpdate !== null;
              return (
                <tr key={ob.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>
                    {ob.fieldName}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#4B5563' }}>
                    {ob.document ? (
                      <Link
                        href={`/documents/${ob.document.id}`}
                        style={{ color: '#2563EB', textDecoration: 'none' }}
                      >
                        {ob.document.title}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      color: '#374151',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ob.fieldValue || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280' }}>
                    {ob.fieldValueDate ? new Date(ob.fieldValueDate).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280' }}>
                    {ob.confidenceScore !== null
                      ? `${Math.round(Number(ob.confidenceScore) * 100)}%`
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {hasAmendment ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: '#FEF3C7',
                          color: '#92400E',
                        }}
                      >
                        <AlertTriangle size={12} /> Pending Review
                      </span>
                    ) : ob.isVerified ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: '#DEF7EC',
                          color: '#03543F',
                        }}
                      >
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: '#F3F4F6',
                          color: '#4B5563',
                        }}
                      >
                        Unverified
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {hasAmendment ? (
                      <button
                        onClick={() => setSelectedForReview(ob)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#D97706',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Review Diff
                      </button>
                    ) : !ob.isVerified ? (
                      <button
                        onClick={() => handleVerify(ob.id)}
                        disabled={isProcessingAction}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: isProcessingAction ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Verify
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Locked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredObligations.length === 0 && !isLoading && (
          <div
            style={{ textAlign: 'center', padding: '48px 0', color: '#6B7280', fontSize: '14px' }}
          >
            No contractual obligations found for this view.
          </div>
        )}
      </div>

      {/* RULE PORT-001 Side-by-Side Amendment Review Modal */}
      {selectedForReview && selectedForReview.pendingUpdate && (
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
              padding: '28px',
              width: '680px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle color="#D97706" size={22} />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Obligation Amendment Diff Review
                </h2>
              </div>
              <button
                onClick={() => setSelectedForReview(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                <X size={20} />
              </button>
            </div>

            <p
              style={{ fontSize: '13px', color: '#4B5563', marginBottom: '20px', lineHeight: 1.5 }}
            >
              <strong>RULE PORT-001 Compliance Guard:</strong> When an agreement is amended, newly
              extracted values are held in pending review and <em>never</em> automatically overwrite
              active contractual terms until confirmed by an authorized user.
            </p>

            <div style={{ marginBottom: '16px', fontSize: '14px' }}>
              <span style={{ color: '#6B7280' }}>Obligation Field: </span>
              <strong style={{ color: '#111827' }}>{selectedForReview.fieldName}</strong>
            </div>

            {/* Side-by-side comparison */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              {/* Current Active */}
              <div
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  padding: '16px',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#4B5563',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  Current Active Obligation
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '8px',
                  }}
                >
                  {selectedForReview.fieldValue || '(Empty)'}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  Due Date:{' '}
                  {selectedForReview.fieldValueDate
                    ? new Date(selectedForReview.fieldValueDate).toLocaleDateString()
                    : 'None'}
                </div>
              </div>

              {/* Proposed Update */}
              <div
                style={{
                  border: '1px solid #FCD34D',
                  borderRadius: '6px',
                  padding: '16px',
                  backgroundColor: '#FFFBEB',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#B45309',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  AI Proposed Amendment Value
                </div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#92400E',
                    marginBottom: '8px',
                  }}
                >
                  {selectedForReview.pendingUpdate.proposedValue || '(Empty)'}
                </div>
                <div style={{ fontSize: '12px', color: '#B45309' }}>
                  Proposed Due Date:{' '}
                  {selectedForReview.pendingUpdate.proposedDueDate
                    ? new Date(selectedForReview.pendingUpdate.proposedDueDate).toLocaleDateString()
                    : 'Unchanged'}
                </div>
              </div>
            </div>

            {/* Source Snippet / Reason */}
            {selectedForReview.pendingUpdate.reason && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#6B7280',
                  marginBottom: '20px',
                  backgroundColor: '#F3F4F6',
                  padding: '10px 12px',
                  borderRadius: '4px',
                }}
              >
                <strong>Extraction Note:</strong> {selectedForReview.pendingUpdate.reason}
              </div>
            )}

            {/* Confirmation & Dismiss Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => handleDismissAmendment(selectedForReview.id)}
                disabled={isProcessingAction}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#4B5563',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: isProcessingAction ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <X size={15} />
                Dismiss (Keep Current Active)
              </button>
              <button
                onClick={() => handleConfirmAmendment(selectedForReview.id)}
                disabled={isProcessingAction}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isProcessingAction ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Check size={15} />
                Confirm & Apply Amendment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
