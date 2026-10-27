'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ClickwrapAgreementDto,
  ClickwrapVersionDto,
  ClickwrapAcceptanceDto,
} from '@pactintel/shared-types';

export default function ClickwrapDetailPage() {
  const params = useParams();
  const agreementId = params.id as string;

  const [agreement, setAgreement] = useState<ClickwrapAgreementDto | null>(null);
  const [versions, setVersions] = useState<ClickwrapVersionDto[]>([]);
  const [acceptances, setAcceptances] = useState<ClickwrapAcceptanceDto[]>([]);
  const [stats, setStats] = useState<{
    totalAcceptances: number;
    byVersion: Record<string, number>;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'versions' | 'acceptances' | 'embed'>('versions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Version Modal
  const [isNewVersionOpen, setIsNewVersionOpen] = useState(false);
  const [newVersionTitle, setNewVersionTitle] = useState('');
  const [newVersionBody, setNewVersionBody] = useState('');
  const [newVersionChangelog, setNewVersionChangelog] = useState('');
  const [submittingVersion, setSubmittingVersion] = useState(false);

  // Acceptance filter
  const [emailFilter, setEmailFilter] = useState('');
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  useEffect(() => {
    if (agreementId) {
      loadData();
    }
  }, [agreementId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [agRes, statsRes, accRes] = await Promise.all([
        fetch(`/api/v1/clickwrap/${agreementId}`),
        fetch(`/api/v1/clickwrap/${agreementId}/stats`),
        fetch(`/api/v1/clickwrap/${agreementId}/acceptances?limit=100`),
      ]);

      if (!agRes.ok) throw new Error('Failed to load agreement');
      const agData = await agRes.json();
      setAgreement(agData);
      setVersions(agData.versions || []);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (accRes.ok) {
        const accData = await accRes.json();
        setAcceptances(accData.items || accData || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading agreement data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingVersion(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/clickwrap/${agreementId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newVersionBody,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create new version');
      }

      const created = await res.json();
      setVersions((prev) => [created, ...prev]);
      setIsNewVersionOpen(false);
      setNewVersionTitle('');
      setNewVersionBody('');
      setNewVersionChangelog('');
      setSuccessMessage('Draft version created successfully.');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingVersion(false);
    }
  };

  const handlePublishVersion = async (versionId: string) => {
    if (
      !confirm(
        'Publishing this version will make it the current live version. Previous acceptances will remain immutably anchored to their original version. Proceed?',
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/v1/clickwrap/${agreementId}/versions/${versionId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to publish version');
      setSuccessMessage('Version published as current live agreement.');
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteDraftVersion = async (versionId: string) => {
    if (!confirm('Delete this draft version?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/clickwrap/${agreementId}/versions/${versionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to delete version');
      }
      setSuccessMessage('Draft version deleted.');
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filterAcceptances = acceptances.filter((a) => {
    if (!emailFilter) return true;
    return (
      (a.acceptorEmail && a.acceptorEmail.toLowerCase().includes(emailFilter.toLowerCase())) ||
      (a.acceptorName && a.acceptorName.toLowerCase().includes(emailFilter.toLowerCase()))
    );
  });

  const embedUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/clickwrap/${agreement?.slug}/widget`
      : `https://app.pactintel.com/clickwrap/${agreement?.slug}/widget`;

  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="450px" style="border: 1px solid #E2E8F0; border-radius: 6px;"></iframe>`;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Breadcrumbs */}
      <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--color-gray-500)' }}>
        <Link
          href="/settings/clickwrap"
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          Clickwrap Agreements
        </Link>{' '}
        / <span>{agreement ? agreement.name : 'Loading...'}</span>
      </div>

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
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '4px',
            }}
          >
            {agreement?.name || 'Clickwrap Agreement'}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '13px',
              color: 'var(--color-gray-600)',
            }}
          >
            <span>
              Slug: <code>{agreement?.slug}</code>
            </span>
            <span>•</span>
            <span>
              Total Acceptances: <strong>{stats?.totalAcceptances || acceptances.length}</strong>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsNewVersionOpen(true)}
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-white)',
              border: 'none',
              padding: '9px 16px',
              borderRadius: 'var(--radius-default)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Draft New Version
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div
          style={{
            backgroundColor: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--border-error)',
            borderRadius: 'var(--radius-default)',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            backgroundColor: 'var(--status-success-bg)',
            color: 'var(--status-success-text)',
            border: '1px solid var(--status-success-dot)',
            borderRadius: 'var(--radius-default)',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {successMessage}
        </div>
      )}

      {loading ? (
        <div
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            padding: '48px',
            textAlign: 'center',
            color: 'var(--color-gray-500)',
            fontSize: '14px',
          }}
        >
          Loading agreement details...
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '20px',
            }}
          >
            <button
              onClick={() => setActiveTab('versions')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom:
                  activeTab === 'versions'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                color: activeTab === 'versions' ? 'var(--color-primary)' : 'var(--color-gray-600)',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Versions ({versions.length})
            </button>
            <button
              onClick={() => setActiveTab('acceptances')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom:
                  activeTab === 'acceptances'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                color:
                  activeTab === 'acceptances' ? 'var(--color-primary)' : 'var(--color-gray-600)',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Acceptances Audit Trail ({acceptances.length})
            </button>
            <button
              onClick={() => setActiveTab('embed')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom:
                  activeTab === 'embed'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                color: activeTab === 'embed' ? 'var(--color-primary)' : 'var(--color-gray-600)',
                fontWeight: 500,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Embed Widget Code
            </button>
          </div>

          {/* Tab 1: Versions */}
          {activeTab === 'versions' && (
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                overflow: 'hidden',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: 'var(--color-gray-50)',
                      color: 'var(--color-gray-600)',
                      fontWeight: 600,
                    }}
                  >
                    <th style={{ padding: '12px 16px' }}>Version</th>
                    <th style={{ padding: '12px 16px' }}>Title & Changelog</th>
                    <th style={{ padding: '12px 16px' }}>Content Hash (SHA-256)</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Published</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((ver) => (
                    <tr
                      key={ver.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        verticalAlign: 'middle',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        v{ver.versionNumber}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-gray-950)' }}>
                          Version {ver.versionNumber}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--color-gray-500)',
                            marginTop: '2px',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ver.content}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <code
                          title={ver.contentHash}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            padding: '2px 6px',
                            backgroundColor: 'var(--color-gray-100)',
                            borderRadius: '4px',
                          }}
                        >
                          {ver.contentHash ? `${ver.contentHash.substring(0, 12)}...` : 'N/A'}
                        </code>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {ver.isCurrent ? (
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: 'var(--status-success-bg)',
                              color: 'var(--status-success-text)',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            ● Live / Current
                          </span>
                        ) : ver.publishedAt ? (
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: 'var(--status-neutral-bg)',
                              color: 'var(--status-neutral-text)',
                              fontSize: '12px',
                            }}
                          >
                            Archived
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: 'var(--status-warning-bg)',
                              color: 'var(--status-warning-text)',
                              fontSize: '12px',
                            }}
                          >
                            Draft
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-gray-600)' }}>
                        {ver.publishedAt
                          ? new Date(ver.publishedAt).toLocaleDateString()
                          : 'Unpublished'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {!ver.isCurrent && (
                            <button
                              onClick={() => handlePublishVersion(ver.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: 'var(--color-primary)',
                                color: 'var(--color-white)',
                                border: 'none',
                                borderRadius: 'var(--radius-default)',
                                cursor: 'pointer',
                              }}
                            >
                              Make Current
                            </button>
                          )}
                          {!ver.isCurrent && !ver.publishedAt && (
                            <button
                              onClick={() => handleDeleteDraftVersion(ver.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: 'var(--color-gray-100)',
                                color: 'var(--status-error-text)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-default)',
                                cursor: 'pointer',
                              }}
                            >
                              Delete Draft
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Acceptances Audit Trail */}
          {activeTab === 'acceptances' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                  Protected by PostgreSQL immutability trigger{' '}
                  <code>prevent_clickwrap_acceptance_mutation</code> (RULE CW-001).
                </div>
                <input
                  type="text"
                  placeholder="Filter by signer email..."
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-default)',
                    fontSize: '13px',
                    width: '240px',
                  }}
                />
              </div>

              <div
                style={{
                  backgroundColor: 'var(--surface-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-default)',
                  overflow: 'hidden',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '13px',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: 'var(--color-gray-50)',
                        color: 'var(--color-gray-600)',
                        fontWeight: 600,
                      }}
                    >
                      <th style={{ padding: '12px 16px' }}>Signer</th>
                      <th style={{ padding: '12px 16px' }}>Version Agreed</th>
                      <th style={{ padding: '12px 16px' }}>IP Address</th>
                      <th style={{ padding: '12px 16px' }}>User Agent / Browser</th>
                      <th style={{ padding: '12px 16px' }}>Agreed Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterAcceptances.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'var(--color-gray-500)',
                          }}
                        >
                          No acceptance records match this query.
                        </td>
                      </tr>
                    ) : (
                      filterAcceptances.map((acc) => (
                        <tr
                          key={acc.id}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            verticalAlign: 'middle',
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--color-gray-950)' }}>
                              {acc.acceptorEmail}
                            </div>
                            {acc.acceptorName && (
                              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                                {acc.acceptorName}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--color-gray-100)',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                              }}
                            >
                              v
                              {(acc as any).versionNumber || acc.clickwrapVersionId.substring(0, 8)}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontFamily: 'monospace',
                              fontSize: '12px',
                            }}
                          >
                            {acc.ipAddress || 'Unknown'}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: '11px',
                              color: 'var(--color-gray-600)',
                              maxWidth: '240px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {acc.userAgent || 'Unknown'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-gray-600)' }}>
                            {new Date(acc.acceptedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Embed Widget Code */}
          {activeTab === 'embed' && (
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                padding: '24px',
              }}
            >
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950)',
                  marginBottom: '8px',
                }}
              >
                Embeddable Iframe Widget
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
                Paste this snippet into your checkout flow, signup modal, or customer onboarding
                portal.
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  HTML Iframe Snippet
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <textarea
                    readOnly
                    rows={3}
                    value={iframeSnippet}
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      padding: '8px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-default)',
                      backgroundColor: 'var(--color-gray-50)',
                    }}
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(iframeSnippet);
                      setCopiedEmbed(true);
                      setTimeout(() => setCopiedEmbed(false), 2000);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-white)',
                      border: 'none',
                      borderRadius: 'var(--radius-default)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {copiedEmbed ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  Direct Widget URL
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={embedUrl}
                    style={{
                      flex: 1,
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      padding: '8px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-default)',
                      backgroundColor: 'var(--color-gray-50)',
                    }}
                  />
                  <a
                    href={embedUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '8px 16px',
                      backgroundColor: 'var(--color-gray-100)',
                      color: 'var(--color-gray-800)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-default)',
                      fontSize: '13px',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Preview Widget ↗
                  </a>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Draft New Version Modal */}
      {isNewVersionOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              borderRadius: 'var(--radius-default)',
              width: '100%',
              maxWidth: '640px',
              boxShadow: 'var(--shadow-popover)',
              border: '1px solid var(--border-color)',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
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
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Draft New Version for {agreement?.name}
              </h2>
              <button
                onClick={() => setIsNewVersionOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateVersion}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Version Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Terms of Service v2.0 - GDPR Update"
                  value={newVersionTitle}
                  onChange={(e) => setNewVersionTitle(e.target.value)}
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

              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Changelog Notes
                </label>
                <input
                  type="text"
                  placeholder="Summary of legal modifications in this version"
                  value={newVersionChangelog}
                  onChange={(e) => setNewVersionChangelog(e.target.value)}
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

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Agreement Terms Body (HTML / Markdown) *
                </label>
                <textarea
                  required
                  rows={10}
                  placeholder="<h2>Terms of Service</h2><p>By clicking accept, the user agrees to the following terms...</p>"
                  value={newVersionBody}
                  onChange={(e) => setNewVersionBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-default)',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                  A cryptographic SHA-256 content hash will be computed upon submission to seal this
                  version.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewVersionOpen(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--surface-card)',
                    borderRadius: 'var(--radius-default)',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingVersion}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: 'var(--radius-default)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: submittingVersion ? 0.7 : 1,
                  }}
                >
                  {submittingVersion ? 'Creating...' : 'Create Draft Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
