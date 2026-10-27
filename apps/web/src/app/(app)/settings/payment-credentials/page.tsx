'use client';

import React, { useState, useEffect } from 'react';
import { PaymentCredentialResponseDto } from '@pactintel/shared-types';

interface AuditLogEntry {
  id: string;
  providerConnectionId: string;
  actorId: string | null;
  action: string;
  metadata?: any;
  createdAt: string;
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

export default function PaymentCredentialsPage() {
  const [credentials, setCredentials] = useState<PaymentCredentialResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal & Drawer
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [selectedCred, setSelectedCred] = useState<PaymentCredentialResponseDto | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [providerType, setProviderType] = useState<'stripe' | 'paypal'>('stripe');
  const [displayName, setDisplayName] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [currencies, setCurrencies] = useState<string[]>(['USD', 'EUR', 'GBP']);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/payment-credentials');
      if (!res.ok) throw new Error('Failed to load payment credentials');
      const data = await res.json();
      setCredentials(data || []);
    } catch (err: any) {
      setError(err.message || 'Could not fetch credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretKey) {
      setError('Secret Key is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/payment-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType,
          displayName,
          secretKey,
          publicKey: publicKey || undefined,
          webhookSecret: webhookSecret || undefined,
          supportedCurrencies: currencies,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to store credentials');
      }

      const created = await res.json();
      setCredentials((prev) => [created, ...prev]);
      setIsAddOpen(false);
      setDisplayName('');
      setSecretKey('');
      setPublicKey('');
      setWebhookSecret('');
      setCurrencies(['USD', 'EUR', 'GBP']);
      setSuccessMessage('Payment gateway connected and encrypted via Cloud KMS.');
    } catch (err: any) {
      setError(err.message || 'Failed to store payment credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnection = async (cred: PaymentCredentialResponseDto) => {
    setTestingId(cred.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/payment-credentials/${cred.id}/test`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Connection test failed');
      }
      const result = await res.json();
      if (result.success) {
        setSuccessMessage(`Connection to ${cred.displayName} verified successfully!`);
        fetchCredentials();
      } else {
        setError(`Verification failed: ${result.message || 'Invalid credentials'}`);
      }
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleRevoke = async (cred: PaymentCredentialResponseDto) => {
    if (
      !confirm(
        `Revoke and permanently disable payment gateway '${cred.displayName}'? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/v1/payment-credentials/${cred.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to revoke credential');
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
      setSuccessMessage('Payment credential revoked.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openAuditLogs = async (cred: PaymentCredentialResponseDto) => {
    setSelectedCred(cred);
    setIsAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/v1/payment-credentials/${cred.id}/audit`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json();
      setAuditLogs(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const toggleCurrency = (curr: string) => {
    setCurrencies((prev) =>
      prev.includes(curr) ? prev.filter((c) => c !== curr) : [...prev, curr],
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
          marginBottom: '20px',
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
            Payment Gateway Accounts (BYOK)
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-gray-600)' }}>
            Connect your organization's own Stripe or PayPal merchant accounts to receive document
            and contract payments directly.
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
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
          Connect Payment Gateway
        </button>
      </div>

      {/* Security Architecture Card */}
      <div
        style={{
          backgroundColor: 'var(--color-gray-50)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-default)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <div style={{ fontSize: '20px' }}>🔒</div>
        <div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '2px',
            }}
          >
            Envelope Encryption with Google Cloud KMS (RULE PAY-001 & PAY-002)
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', lineHeight: '1.5' }}>
            Merchant credentials are encrypted using an ephemeral AES-256 Data Encryption Key (DEK),
            which is wrapped by a Cloud KMS Key Encryption Key (KEK). Decryption occurs exclusively
            in volatile memory for live operations and is immediately wiped. Plaintext keys are
            never written to disk or logs.
          </div>
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

      {/* Table / Empty State */}
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
          Loading credentials...
        </div>
      ) : credentials.length === 0 ? (
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
            💳
          </div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '6px',
            }}
          >
            No Payment Accounts Connected
          </h3>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-gray-600)',
              maxWidth: '460px',
              margin: '0 auto 20px auto',
            }}
          >
            Connect your Stripe or PayPal account to collect customer deposits, retainer fees, and
            invoice payments upon contract execution.
          </p>
          <button
            onClick={() => setIsAddOpen(true)}
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
            Connect Payment Gateway
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
                <th style={{ padding: '12px 16px' }}>Provider</th>
                <th style={{ padding: '12px 16px' }}>Account Name</th>
                <th style={{ padding: '12px 16px' }}>Supported Currencies</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Last Verified</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((cred) => (
                <tr
                  key={cred.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    verticalAlign: 'middle',
                  }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: cred.providerType === 'stripe' ? '#635BFF1A' : '#0030871A',
                        color: cred.providerType === 'stripe' ? '#635BFF' : '#003087',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {cred.providerType}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      fontWeight: 600,
                      color: 'var(--color-gray-950)',
                    }}
                  >
                    {cred.displayName}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {cred.supportedCurrencies.map((c) => (
                        <span
                          key={c}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--color-gray-100)',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        >
                          {c}
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
                        backgroundColor: cred.isVerified
                          ? 'var(--status-success-bg)'
                          : 'var(--status-warning-bg)',
                        color: cred.isVerified
                          ? 'var(--status-success-text)'
                          : 'var(--status-warning-text)',
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '3px',
                          backgroundColor: cred.isVerified
                            ? 'var(--status-success-dot)'
                            : 'var(--status-warning-dot)',
                        }}
                      />
                      {cred.isVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-gray-600)' }}>
                    {cred.lastVerifiedAt
                      ? new Date(cred.lastVerifiedAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => handleTestConnection(cred)}
                        disabled={testingId === cred.id}
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
                        {testingId === cred.id ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        onClick={() => openAuditLogs(cred)}
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
                        Audit Trail
                      </button>
                      <button
                        onClick={() => handleRevoke(cred)}
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
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Credential Modal */}
      {isAddOpen && (
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
                Connect Merchant Account (BYOK)
              </h2>
              <button
                onClick={() => setIsAddOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCredential}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Payment Provider *
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-default)',
                      backgroundColor:
                        providerType === 'stripe'
                          ? 'var(--color-primary-subtle)'
                          : 'var(--surface-card)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="radio"
                      name="providerType"
                      checked={providerType === 'stripe'}
                      onChange={() => setProviderType('stripe')}
                    />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>Stripe</span>
                  </label>
                  <label
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-default)',
                      backgroundColor:
                        providerType === 'paypal'
                          ? 'var(--color-primary-subtle)'
                          : 'var(--surface-card)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="radio"
                      name="providerType"
                      checked={providerType === 'paypal'}
                      onChange={() => setProviderType('paypal')}
                    />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>PayPal</span>
                  </label>
                </div>
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
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Primary Stripe, Operations PayPal"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                  {providerType === 'stripe'
                    ? 'Stripe Secret Key (sk_live_... / sk_test_...)'
                    : 'PayPal Client Secret'}{' '}
                  *
                </label>
                <input
                  type="password"
                  required
                  placeholder={providerType === 'stripe' ? 'sk_live_...' : 'Client Secret'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
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
                  {providerType === 'stripe' ? 'Publishable Key (pk_...)' : 'PayPal Client ID'}{' '}
                  (Optional)
                </label>
                <input
                  type="text"
                  placeholder={providerType === 'stripe' ? 'pk_live_...' : 'Client ID'}
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
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
                  Webhook Signing Secret (whsec_...) (Optional)
                </label>
                <input
                  type="password"
                  placeholder="whsec_..."
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
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
                  Supported Currencies
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COMMON_CURRENCIES.map((curr) => (
                    <button
                      type="button"
                      key={curr}
                      onClick={() => toggleCurrency(curr)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: currencies.includes(curr)
                          ? 'var(--color-primary)'
                          : 'var(--color-gray-100)',
                        color: currencies.includes(curr)
                          ? 'var(--color-white)'
                          : 'var(--color-gray-800)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
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
                  {submitting ? 'Encrypting & Storing...' : 'Save & Encrypt via KMS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {isAuditOpen && selectedCred && (
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
              maxWidth: '620px',
              boxShadow: 'var(--shadow-popover)',
              border: '1px solid var(--border-color)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
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
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  Audit Trail: {selectedCred.displayName}
                </h2>
                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                  Immutable audit records (RULE PAY-003, PostgreSQL append-only)
                </div>
              </div>
              <button
                onClick={() => setIsAuditOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {loadingAudit ? (
                <div
                  style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-500)' }}
                >
                  Loading audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div
                  style={{ textAlign: 'center', padding: '32px', color: 'var(--color-gray-500)' }}
                >
                  No audit log entries found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '10px 14px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-default)',
                        backgroundColor: 'var(--color-gray-50)',
                        fontSize: '12px',
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
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              log.action === 'created'
                                ? 'var(--status-info-bg)'
                                : log.action === 'verified'
                                  ? 'var(--status-success-bg)'
                                  : log.action === 'deleted'
                                    ? 'var(--status-error-bg)'
                                    : 'var(--color-gray-200)',
                            color:
                              log.action === 'created'
                                ? 'var(--status-info-text)'
                                : log.action === 'verified'
                                  ? 'var(--status-success-text)'
                                  : log.action === 'deleted'
                                    ? 'var(--status-error-text)'
                                    : 'var(--color-gray-800)',
                            textTransform: 'uppercase',
                            fontSize: '10px',
                          }}
                        >
                          {log.action}
                        </span>
                        <span style={{ color: 'var(--color-gray-500)', fontSize: '11px' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: 'var(--color-gray-800)' }}>
                        Actor: {log.actorId ? <code>{log.actorId}</code> : 'System Worker'}
                      </div>
                      {log.metadata && (
                        <div
                          style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: 'var(--color-gray-600)',
                            marginTop: '4px',
                          }}
                        >
                          {JSON.stringify(log.metadata)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border-color)',
                textAlign: 'right',
              }}
            >
              <button
                onClick={() => setIsAuditOpen(false)}
                style={{
                  padding: '6px 14px',
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
