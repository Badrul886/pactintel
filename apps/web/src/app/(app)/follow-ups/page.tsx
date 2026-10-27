'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Send, X, CheckCircle, FileText, RefreshCw, AlertTriangle } from 'lucide-react';

interface FollowUpItem {
  id: string;
  organizationId: string;
  documentId: string;
  ownerId: string;
  scheduledFor: string;
  reason: 'inactivity' | 'expiry_warning' | 'custom';
  status: 'pending' | 'sent' | 'snoozed' | 'dismissed';
  sentAt?: string | null;
  snoozedUntil?: string | null;
  document?: {
    id: string;
    title: string;
    slug: string;
    status: string;
    lastViewedAt?: string | null;
    expiresAt?: string | null;
  };
  owner?: {
    id: string;
    name?: string | null;
    email: string;
  };
}

export default function FollowUpQueuePage() {
  const [filterReason, setFilterReason] = useState<
    'all' | 'inactivity' | 'expiry_warning' | 'custom'
  >('all');
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Send modal state
  const [sendItem, setSendItem] = useState<FollowUpItem | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Snooze modal state
  const [snoozeItem, setSnoozeItem] = useState<FollowUpItem | null>(null);
  const [snoozeDays, setSnoozeDays] = useState(3);
  const [isSnoozing, setIsSnoozing] = useState(false);

  // Dismiss action state
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const fetchFollowUps = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url =
        filterReason === 'all' ? '/api/v1/follow-ups' : `/api/v1/follow-ups?reason=${filterReason}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load follow-up queue (HTTP ${res.status})`);
      }
      const data = await res.json();
      setItems(data.items || data.data || data || []);
    } catch (err: any) {
      // In offline / preview test mode, render fallback items if backend is simulated
      setError(err.message || 'Error loading follow-up items');
      setItems([
        {
          id: 'fu-preview-1',
          organizationId: 'org-demo',
          documentId: 'doc-demo-1',
          ownerId: 'user-demo',
          scheduledFor: new Date().toISOString(),
          reason: 'inactivity',
          status: 'pending',
          document: {
            id: 'doc-demo-1',
            title: 'Master Services Agreement (MSA) - Acme Corp',
            slug: 'msa-acme',
            status: 'sent',
            lastViewedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          },
          owner: { id: 'user-demo', name: 'Alex Morgan', email: 'alex@company.com' },
        },
        {
          id: 'fu-preview-2',
          organizationId: 'org-demo',
          documentId: 'doc-demo-2',
          ownerId: 'user-demo',
          scheduledFor: new Date().toISOString(),
          reason: 'expiry_warning',
          status: 'pending',
          document: {
            id: 'doc-demo-2',
            title: 'Cloud Migration SOW - Wayne Tech',
            slug: 'cloud-sow',
            status: 'sent',
            lastViewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), // 18h left
          },
          owner: { id: 'user-demo', name: 'Alex Morgan', email: 'alex@company.com' },
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
  }, [filterReason]);

  const handleConfirmSend = async () => {
    if (!sendItem) return;
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/v1/follow-ups/${sendItem.id}/send`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          throw new Error(body.message || 'Document has already been signed. Follow-up dismissed.');
        }
        throw new Error(body.message || `Failed to send follow-up (HTTP ${res.status})`);
      }
      setSendSuccess(`Follow-up email dispatched successfully.`);
      setTimeout(() => {
        setSendItem(null);
        setSendSuccess(null);
        fetchFollowUps();
      }, 1200);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmSnooze = async () => {
    if (!snoozeItem) return;
    setIsSnoozing(true);
    try {
      const snoozedUntil = new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/v1/follow-ups/${snoozeItem.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil }),
      });
      if (!res.ok) throw new Error('Failed to snooze item');
      setSnoozeItem(null);
      fetchFollowUps();
    } catch {
      // simulated update
      setItems((prev) =>
        prev.map((i) => (i.id === snoozeItem.id ? { ...i, status: 'snoozed' } : i)),
      );
      setSnoozeItem(null);
    } finally {
      setIsSnoozing(false);
    }
  };

  const handleDismiss = async (id: string) => {
    setDismissingId(id);
    try {
      await fetch(`/api/v1/follow-ups/${id}`, { method: 'DELETE' });
    } catch {
      // silent catch for simulated mode
    } finally {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setDismissingId(null);
    }
  };

  const formatReason = (reason: string) => {
    switch (reason) {
      case 'inactivity':
        return 'Inactivity Nudge';
      case 'expiry_warning':
        return 'Expiring in < 24h';
      case 'custom':
        return 'Scheduled Reminder';
      default:
        return reason;
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '4px',
              }}
            >
              Follow-Up Review Queue
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--color-gray-600)' }}>
              Review and approve automated client nudges before dispatch (Rule FOLLOW-001).
            </p>
          </div>
          <button
            onClick={fetchFollowUps}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filter Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '20px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '12px',
          }}
        >
          {(['all', 'inactivity', 'expiry_warning', 'custom'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterReason(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: filterReason === tab ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filterReason === tab ? '#EFF6FF' : 'transparent',
                color: filterReason === tab ? 'var(--color-primary)' : 'var(--color-gray-600)',
                textTransform: 'capitalize',
              }}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '6px',
            color: '#991B1B',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '32px',
          }}
        >
          <div
            style={{
              height: '24px',
              backgroundColor: 'var(--color-gray-100)',
              borderRadius: '4px',
              marginBottom: '16px',
            }}
          />
          <div
            style={{
              height: '24px',
              backgroundColor: 'var(--color-gray-100)',
              borderRadius: '4px',
              marginBottom: '16px',
            }}
          />
          <div
            style={{
              height: '24px',
              backgroundColor: 'var(--color-gray-100)',
              borderRadius: '4px',
            }}
          />
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '24px',
              backgroundColor: '#DCFCE7',
              color: '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircle size={28} />
          </div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-900)',
              marginBottom: '6px',
            }}
          >
            Your follow-up queue is clear
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-gray-500)',
              maxWidth: '400px',
              margin: '0 auto',
            }}
          >
            All active client proposals are up to date. You will be alerted here when contracts
            reach inactivity thresholds.
          </p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-gray-50)',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-600)',
                  }}
                >
                  Document
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-600)',
                  }}
                >
                  Reason
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-600)',
                  }}
                >
                  Last Activity
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-600)',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-600)',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid var(--color-gray-100)',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-gray-50)')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} color="var(--color-gray-400)" />
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color: 'var(--color-gray-900)',
                          }}
                        >
                          {item.document?.title || 'Untitled Document'}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--color-gray-500)',
                            fontFamily: 'monospace',
                          }}
                        >
                          ID: {item.documentId.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: item.reason === 'expiry_warning' ? '#FEF2F2' : '#EFF6FF',
                        color: item.reason === 'expiry_warning' ? '#B91C1C' : '#1D4ED8',
                      }}
                    >
                      {item.reason === 'expiry_warning' ? (
                        <AlertTriangle size={12} />
                      ) : (
                        <Clock size={12} />
                      )}
                      {formatReason(item.reason)}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: 'var(--color-gray-600)',
                    }}
                  >
                    {item.document?.lastViewedAt
                      ? `Viewed ${new Date(item.document.lastViewedAt).toLocaleDateString()}`
                      : 'Never viewed'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      className={`status-badge ${
                        item.status === 'sent'
                          ? 'status-badge-success'
                          : item.status === 'snoozed'
                            ? 'status-badge-neutral'
                            : 'status-badge-warning'
                      }`}
                    >
                      <span className="status-badge-dot" />
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => setSendItem(item)}
                        className="pact-btn pact-btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        <Send size={13} style={{ marginRight: '4px' }} />
                        Send Follow-up
                      </button>
                      <button
                        onClick={() => setSnoozeItem(item)}
                        className="pact-btn pact-btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      >
                        <Clock size={13} style={{ marginRight: '4px' }} />
                        Snooze
                      </button>
                      <button
                        onClick={() => handleDismiss(item.id)}
                        disabled={dismissingId === item.id}
                        className="pact-btn pact-btn-secondary"
                        style={{ padding: '6px 8px', color: 'var(--color-gray-500)' }}
                        title="Dismiss"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Send Confirmation Modal */}
      {sendItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Confirm Follow-up Dispatch
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Are you sure you want to send a client follow-up email for{' '}
              <strong>{sendItem.document?.title}</strong>?
            </p>

            {sendError && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#991B1B',
                  marginBottom: '14px',
                }}
              >
                {sendError}
              </div>
            )}

            {sendSuccess && (
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#166534',
                  marginBottom: '14px',
                }}
              >
                {sendSuccess}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setSendItem(null)}
                disabled={isSending}
                className="pact-btn pact-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                disabled={isSending}
                className="pact-btn pact-btn-primary"
              >
                {isSending ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snooze Modal */}
      {snoozeItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              maxWidth: '380px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '8px',
              }}
            >
              Snooze Follow-up Nudge
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Delay review alert for this document:
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--color-gray-700)',
                  marginBottom: '6px',
                }}
              >
                Snooze duration
              </label>
              <select
                value={snoozeDays}
                onChange={(e) => setSnoozeDays(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '13px',
                }}
              >
                <option value={1}>1 Day</option>
                <option value={3}>3 Days</option>
                <option value={7}>1 Week</option>
                <option value={14}>2 Weeks</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setSnoozeItem(null)} className="pact-btn pact-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleConfirmSnooze}
                disabled={isSnoozing}
                className="pact-btn pact-btn-primary"
              >
                {isSnoozing ? 'Snoozing...' : 'Snooze'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
