'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClickwrapAgreementDto } from '@pactintel/shared-types';

export default function ClickwrapListPage() {
  const [agreements, setAgreements] = useState<ClickwrapAgreementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAgreements();
  }, []);

  const fetchAgreements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/clickwrap');
      if (!res.ok) throw new Error('Failed to load clickwrap agreements');
      const data = await res.json();
      setAgreements(data.items || data || []);
    } catch (err: any) {
      setError(err.message || 'Could not fetch agreements');
    } finally {
      setLoading(false);
    }
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    // Auto-generate slug from title
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setSlug(generated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/clickwrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title,
          slug,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create agreement');
      }

      const created = await res.json();
      setAgreements((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setTitle('');
      setSlug('');
      setDescription('');
      setSuccessMessage('Clickwrap agreement created.');
    } catch (err: any) {
      setError(err.message || 'Failed to create agreement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
            Clickwrap Agreements
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-gray-600)' }}>
            One-click terms of service, privacy policies, and embeddable acceptance widgets with
            legally binding immutable records.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
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
          New Clickwrap Agreement
        </button>
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

      {/* Table or Empty State */}
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
          Loading agreements...
        </div>
      ) : agreements.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            padding: '56px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '24px',
              backgroundColor: 'var(--color-primary-subtle)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              fontSize: '20px',
            }}
          >
            📋
          </div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '6px',
            }}
          >
            No Clickwrap Agreements
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-gray-600)',
              maxWidth: '460px',
              margin: '0 auto 20px auto',
            }}
          >
            Create standardized agreements that users can accept with a single checkbox in signup
            flows, checkout pages, or customer portals.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-white)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 'var(--radius-default)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            New Clickwrap Agreement
          </button>
        </div>
      ) : (
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
                <th style={{ padding: '12px 16px' }}>Agreement Title</th>
                <th style={{ padding: '12px 16px' }}>Slug / Embed Key</th>
                <th style={{ padding: '12px 16px' }}>Current Version</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agreements.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    verticalAlign: 'middle',
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-gray-950)' }}>
                      {item.name}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <code
                      style={{
                        padding: '2px 6px',
                        backgroundColor: 'var(--color-gray-100)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'var(--color-gray-800)',
                      }}
                    >
                      {item.slug}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: item.isActive
                          ? 'var(--status-info-bg)'
                          : 'var(--color-gray-100)',
                        color: item.isActive ? 'var(--status-info-text)' : 'var(--color-gray-600)',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {item.isActive ? 'Active' : 'Draft'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: item.isActive
                          ? 'var(--status-success-bg)'
                          : 'var(--status-neutral-bg)',
                        color: item.isActive
                          ? 'var(--status-success-text)'
                          : 'var(--status-neutral-text)',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '3px',
                          backgroundColor: item.isActive
                            ? 'var(--status-success-dot)'
                            : 'var(--status-neutral-dot)',
                        }}
                      />
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-gray-600)' }}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <Link
                      href={`/settings/clickwrap/${item.id}`}
                      style={{
                        display: 'inline-block',
                        padding: '5px 12px',
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-white)',
                        borderRadius: 'var(--radius-default)',
                        textDecoration: 'none',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      Manage & Versions
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {isModalOpen && (
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
              maxWidth: '500px',
              boxShadow: 'var(--shadow-popover)',
              border: '1px solid var(--border-color)',
              padding: '20px',
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
                New Clickwrap Agreement
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: 'var(--color-gray-500)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Agreement Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Terms of Service, Master SaaS Agreement"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
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
                  Public Slug / Identifier *
                </label>
                <input
                  type="text"
                  required
                  placeholder="terms-of-service"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
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
                  Used in widget URLs: <code>/clickwrap/{slug || 'slug'}/widget</code>
                </div>
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
                  Description (Internal)
                </label>
                <textarea
                  placeholder="Notes about this agreement's legal jurisdiction or purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  disabled={submitting}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: 'var(--radius-default)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Creating...' : 'Create Agreement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
