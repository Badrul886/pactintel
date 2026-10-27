'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Save, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentSettingsPageProps {
  params: Promise<{ id: string }>;
}

export default function DocumentSettingsPage({ params }: DocumentSettingsPageProps) {
  const resolvedParams = use(params);
  const documentId = resolvedParams.id;

  const [documentTitle, setDocumentTitle] = useState('Master Services Agreement (MSA)');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(14);
  const [isNeverExpires, setIsNeverExpires] = useState(false);

  const [inactivityReminderDays, setInactivityReminderDays] = useState<number | null>(7);
  const [isInactivityDisabled, setIsInactivityDisabled] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDoc = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/v1/documents/${documentId}`);
        if (res.ok) {
          const doc = await res.json();
          setDocumentTitle(doc.title || 'Untitled Document');
          if (doc.expiresAt) {
            const daysLeft = Math.max(
              1,
              Math.ceil((new Date(doc.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            );
            setExpiresInDays(daysLeft);
            setIsNeverExpires(false);
          } else {
            setIsNeverExpires(true);
          }

          if (doc.inactivityReminderDays != null) {
            setInactivityReminderDays(doc.inactivityReminderDays);
            setIsInactivityDisabled(false);
          } else {
            setIsInactivityDisabled(true);
          }
        }
      } catch {
        // Fallback default states for preview
      } finally {
        setIsLoading(false);
      }
    };

    fetchDoc();
  }, [documentId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const payload = {
        expiresInDays: isNeverExpires ? null : expiresInDays,
        inactivityReminderDays: isInactivityDisabled ? null : inactivityReminderDays,
      };

      const res = await fetch(`/api/v1/documents/${documentId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to update document settings (HTTP ${res.status})`);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
        <div
          style={{
            height: '32px',
            width: '200px',
            backgroundColor: 'var(--color-gray-100)',
            borderRadius: '6px',
            marginBottom: '24px',
          }}
        />
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
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          href={`/documents/${documentId}/edit`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: 'var(--color-gray-600)',
            textDecoration: 'none',
            marginBottom: '12px',
          }}
        >
          <ArrowLeft size={14} /> Back to Editor
        </Link>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: 'var(--color-gray-950)',
            marginBottom: '4px',
          }}
        >
          Document Settings: {documentTitle}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
          ID: {documentId}
        </p>
      </div>

      {saveSuccess && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#166534',
          }}
        >
          <CheckCircle size={16} />
          Settings saved successfully! Expiry and reminder policies are active.
        </div>
      )}

      {saveError && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#991B1B',
          }}
        >
          <AlertCircle size={16} />
          {saveError}
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings}>
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Clock size={18} color="var(--color-primary)" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
              Expiry & Reminders (Sprint 2.6)
            </h2>
          </div>

          {/* Expiry Configuration */}
          <div
            style={{
              marginBottom: '24px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px',
              }}
            >
              <div>
                <label
                  style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-gray-900)' }}
                >
                  Document Validity & Link Expiry
                </label>
                <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  Automatically void public viewing and signing access after a designated period.
                </p>
              </div>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--color-gray-700)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isNeverExpires}
                  onChange={(e) => setIsNeverExpires(e.target.checked)}
                />
                Never expires
              </label>
            </div>

            {!isNeverExpires && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-gray-700)' }}>
                  Expires in:
                </span>
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={expiresInDays ?? 14}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
                  style={{
                    width: '80px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--color-gray-700)' }}>
                  days from creation
                </span>
              </div>
            )}
          </div>

          {/* Inactivity Reminder Configuration */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px',
              }}
            >
              <div>
                <label
                  style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-gray-900)' }}
                >
                  Inactivity Reminder (Follow-Up Nudge Queue)
                </label>
                <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  Enqueue a sales rep review reminder in your Follow-up Queue if a recipient has not
                  viewed or signed.
                </p>
              </div>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--color-gray-700)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={isInactivityDisabled}
                  onChange={(e) => setIsInactivityDisabled(e.target.checked)}
                />
                Disabled
              </label>
            </div>

            {!isInactivityDisabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-gray-700)' }}>
                  Remind rep after:
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={inactivityReminderDays ?? 7}
                  onChange={(e) => setInactivityReminderDays(parseInt(e.target.value, 10))}
                  style={{
                    width: '80px',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--color-gray-700)' }}>
                  days of client inactivity
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="submit"
            disabled={isSaving}
            className="pact-btn pact-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={14} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
