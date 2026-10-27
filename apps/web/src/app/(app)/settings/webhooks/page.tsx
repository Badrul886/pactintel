'use client';

import React, { useState, useEffect } from 'react';
import { WebhookDto, WebhookDeliveryLogDto } from '@pactintel/shared-types';

const AVAILABLE_EVENTS = [
  { id: 'document.created', label: 'Document Created', desc: 'When a new draft is initiated' },
  { id: 'document.sent', label: 'Document Sent', desc: 'When a document is sent to recipients' },
  {
    id: 'signature.completed',
    label: 'Signature Completed',
    desc: 'When a recipient completes signing',
  },
  {
    id: 'payment.completed',
    label: 'Payment Completed',
    desc: 'When a payment confirmation is verified',
  },
  {
    id: 'clickwrap.accepted',
    label: 'Clickwrap Accepted',
    desc: 'When a public consent is captured',
  },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal & Drawer states
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookDto | null>(null);
  const [logs, setLogs] = useState<WebhookDeliveryLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Form states
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'signature.completed',
    'payment.completed',
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/webhooks');
      if (!res.ok) throw new Error('Failed to load webhooks');
      const data = await res.json();
      setWebhooks(data.items || data || []);
    } catch (err: any) {
      setError(err.message || 'Could not fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.startsWith('https://')) {
      setError('Webhook URL must begin with https:// (RULE EC-WH-05)');
      return;
    }
    if (selectedEvents.length === 0) {
      setError('Please select at least one event subscription.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          events: selectedEvents,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to register webhook');
      }

      const created = await res.json();
      setCreatedSecret(created.secret);
      setUrl('');
      setSelectedEvents(['signature.completed', 'payment.completed']);
      setSuccessMessage('Webhook registered successfully.');
      fetchWebhooks();
    } catch (err: any) {
      setError(err.message || 'Failed to register webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook subscription?')) return;
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete webhook');
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      setSuccessMessage('Webhook subscription deleted.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (hook: WebhookDto) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${hook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !hook.isActive }),
      });
      if (!res.ok) throw new Error('Failed to toggle webhook state');
      const updated = await res.json();
      setWebhooks((prev) => prev.map((w) => (w.id === hook.id ? updated : w)));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestPing = async (hook: WebhookDto) => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/webhooks/${hook.id}/test`, { method: 'POST' });
      if (!res.ok) throw new Error('Test ping delivery failed');
      const result = await res.json();
      setSuccessMessage(`Test ping queued. Delivery status: ${result.status}`);
      if (selectedWebhook?.id === hook.id) {
        viewLogs(hook);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const viewLogs = async (hook: WebhookDto) => {
    setSelectedWebhook(hook);
    setIsLogsOpen(true);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${hook.id}/logs?limit=20`);
      if (!res.ok) throw new Error('Failed to fetch delivery logs');
      const data = await res.json();
      setLogs(data.items || data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const toggleEventSelection = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId],
    );
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
            Webhooks
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-gray-600)' }}>
            Subscribe external endpoints (Zapier, Make, custom servers) to real-time contract and
            payment events.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatedSecret(null);
            setIsRegisterOpen(true);
          }}
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
          Register Webhook
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

      {/* Main Table / Empty State */}
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
          Loading webhooks...
        </div>
      ) : webhooks.length === 0 ? (
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
            ⚡
          </div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '6px',
            }}
          >
            No Webhook Subscriptions
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-gray-600)',
              maxWidth: '460px',
              margin: '0 auto 20px auto',
            }}
          >
            Connect Zapier, Make, or custom HTTPS endpoints to receive immediate event payloads for
            signing, payments, and contract updates.
          </p>
          <button
            onClick={() => setIsRegisterOpen(true)}
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
            Register Webhook
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
                <th style={{ padding: '12px 16px' }}>Target URL</th>
                <th style={{ padding: '12px 16px' }}>Subscribed Events</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Failures</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((hook) => (
                <tr
                  key={hook.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    verticalAlign: 'middle',
                  }}
                >
                  <td style={{ padding: '12px 16px', maxWidth: '280px' }}>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--color-gray-950)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {hook.url}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {hook.events.map((ev) => (
                        <span
                          key={ev}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--color-gray-100)',
                            color: 'var(--color-gray-800)',
                            fontSize: '11px',
                          }}
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
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
                        backgroundColor: hook.isActive
                          ? 'var(--status-success-bg)'
                          : 'var(--status-error-bg)',
                        color: hook.isActive
                          ? 'var(--status-success-text)'
                          : 'var(--status-error-text)',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '3px',
                          backgroundColor: hook.isActive
                            ? 'var(--status-success-dot)'
                            : 'var(--status-error-dot)',
                        }}
                      />
                      {hook.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {hook.failureCount > 0 ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--status-warning-bg)',
                          color: 'var(--status-warning-text)',
                          fontWeight: 500,
                        }}
                      >
                        {hook.failureCount} / 10
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-gray-500)' }}>0</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-gray-600)' }}>
                    {new Date(hook.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => handleTestPing(hook)}
                        title="Send Test Ping"
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: 'var(--color-gray-100)',
                          color: 'var(--color-gray-800)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-default)',
                          cursor: 'pointer',
                        }}
                      >
                        Test Ping
                      </button>
                      <button
                        onClick={() => viewLogs(hook)}
                        title="View Delivery Logs"
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: 'var(--color-gray-100)',
                          color: 'var(--color-gray-800)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-default)',
                          cursor: 'pointer',
                        }}
                      >
                        Logs
                      </button>
                      <button
                        onClick={() => handleToggleActive(hook)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: 'var(--color-gray-100)',
                          color: 'var(--color-gray-800)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-default)',
                          cursor: 'pointer',
                        }}
                      >
                        {hook.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(hook.id)}
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
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Webhook Modal */}
      {isRegisterOpen && (
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
              maxWidth: '540px',
              boxShadow: 'var(--shadow-popover)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                {createdSecret ? 'Webhook Registered' : 'Register Webhook Endpoint'}
              </h2>
              <button
                onClick={() => setIsRegisterOpen(false)}
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

            <div style={{ padding: '20px' }}>
              {createdSecret ? (
                <div>
                  <div
                    style={{
                      backgroundColor: 'var(--status-warning-bg)',
                      border: '1px solid var(--status-warning-dot)',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-default)',
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        color: 'var(--status-warning-text)',
                      }}
                    >
                      Save your signing secret now!
                    </div>
                    <div
                      style={{ fontSize: '12px', color: 'var(--color-gray-800)', marginTop: '4px' }}
                    >
                      This HMAC secret is used to verify incoming payloads via the{' '}
                      <code>X-PactIntel-Signature</code> header. It will never be shown again.
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      HMAC Signing Secret
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        value={createdSecret}
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
                          navigator.clipboard.writeText(createdSecret);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: 'var(--color-primary)',
                          color: 'var(--color-white)',
                          border: 'none',
                          borderRadius: 'var(--radius-default)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedSecret ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsRegisterOpen(false)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-white)',
                      border: 'none',
                      borderRadius: 'var(--radius-default)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    I have saved my secret
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateWebhook}>
                  <div style={{ marginBottom: '16px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        marginBottom: '6px',
                      }}
                    >
                      Target HTTPS URL *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder="https://hooks.zapier.com/hooks/catch/..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-default)',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div
                      style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}
                    >
                      Must be HTTPS. Private RFC1918 IPs, loopbacks, and cloud metadata URLs are
                      rejected (SSRF protection).
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 500,
                        marginBottom: '6px',
                      }}
                    >
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Zapier CRM sync or Slack notification bridge"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
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
                        marginBottom: '8px',
                      }}
                    >
                      Event Subscriptions *
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {AVAILABLE_EVENTS.map((ev) => (
                        <label
                          key={ev.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '8px 12px',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-default)',
                            backgroundColor: selectedEvents.includes(ev.id)
                              ? 'var(--color-primary-subtle)'
                              : 'var(--surface-card)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEvents.includes(ev.id)}
                            onChange={() => toggleEventSelection(ev.id)}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 500,
                                color: 'var(--color-gray-950)',
                              }}
                            >
                              {ev.label}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-gray-600)' }}>
                              {ev.desc} (<code>{ev.id}</code>)
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsRegisterOpen(false)}
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
                      {submitting ? 'Registering...' : 'Register Webhook'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Logs Drawer */}
      {isLogsOpen && selectedWebhook && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'var(--surface-overlay)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              width: '100%',
              maxWidth: '600px',
              height: '100%',
              boxShadow: 'var(--shadow-popover)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  Delivery Logs
                </h2>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--color-gray-600)',
                  }}
                >
                  {selectedWebhook.url}
                </div>
              </div>
              <button
                onClick={() => setIsLogsOpen(false)}
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

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {loadingLogs ? (
                <div
                  style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-500)' }}
                >
                  Loading delivery attempts...
                </div>
              ) : logs.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 16px',
                    color: 'var(--color-gray-500)',
                  }}
                >
                  No delivery attempts recorded yet. Click "Send Test Ping" to test.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px 14px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-default)',
                        backgroundColor:
                          log.httpStatus && log.httpStatus >= 200 && log.httpStatus < 300
                            ? 'var(--surface-card)'
                            : 'var(--status-error-bg)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              log.httpStatus && log.httpStatus >= 200 && log.httpStatus < 300
                                ? 'var(--status-success-bg)'
                                : 'var(--status-error-bg)',
                            color:
                              log.httpStatus && log.httpStatus >= 200 && log.httpStatus < 300
                                ? 'var(--status-success-text)'
                                : 'var(--status-error-text)',
                          }}
                        >
                          HTTP {log.httpStatus || 'PENDING'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: 'var(--color-gray-800)',
                        }}
                      >
                        Event: {log.eventType} (Attempt {log.attemptNumber})
                      </div>
                      {log.responseBody && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--status-error-text)',
                            marginTop: '6px',
                            wordBreak: 'break-all',
                          }}
                        >
                          Response: {log.responseBody}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <button
                onClick={() => handleTestPing(selectedWebhook)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: 'var(--radius-default)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Send Test Ping
              </button>
              <button
                onClick={() => setIsLogsOpen(false)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: 'var(--color-gray-100)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-default)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
