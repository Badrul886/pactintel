'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { PricingTableExtension } from '@pactintel/ui';
import {
  ArrowLeft,
  Save,
  Send,
  FileText,
  Lock,
  Clock,
  AlertCircle,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  CheckCircle,
  Copy,
  Receipt,
} from 'lucide-react';

interface DocumentEditorPageProps {
  params: Promise<{ id: string }>;
}

export default function DocumentEditorPage({ params }: DocumentEditorPageProps) {
  const resolvedParams = use(params);
  const documentId = resolvedParams.id;

  const [title, setTitle] = useState('Master Services Agreement (MSA)');
  const [status, setStatus] = useState<'draft' | 'sent' | 'viewed' | 'signed'>('draft');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('Just now');
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Save as template state
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState(title + ' Template');
  const [templateCategory, setTemplateCategory] = useState('Contracts');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSuccess, setTemplateSuccess] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Send modal fields
  const [recipientEmail, setRecipientEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState(14);
  const [password, setPassword] = useState('');
  const [domainRestriction, setDomainRestriction] = useState('');

  const isSigned = status === 'signed';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      PricingTableExtension,
    ],
    content: `
      <h1>Master Services Agreement</h1>
      <p>This Master Services Agreement ("Agreement") is entered into between <strong>Acme Corporation</strong> ("Client") and <strong>PactIntel Partner</strong> ("Provider").</p>
      <h2>1. Scope of Work</h2>
      <p>Provider shall deliver strategic software engineering and cloud infrastructure automation services as detailed in applicable Statements of Work.</p>
      <h2>2. Payment & Retainer Terms</h2>
      <p>Invoices are payable within 30 days of receipt. Work shall commence upon receipt of the initial agreed milestone payment.</p>
      <h2>3. Intellectual Property</h2>
      <p>All deliverables prepared by Provider shall become the exclusive property of Client upon complete satisfaction of all outstanding invoices.</p>
      <h2>4. Signatures & Binding Assent</h2>
      <p>By signing below, the authorized signatories agree to be bound by the terms and conditions outlined herein.</p>
    `,
    editable: !isSigned,
    editorProps: {
      attributes: {
        class: 'prose focus:outline-none min-h-[400px] text-gray-900',
        style: 'font-size: 15px; line-height: 1.7; color: var(--color-gray-900);',
      },
    },
    onUpdate: () => {
      setIsSaving(true);
      const timer = setTimeout(() => {
        setIsSaving(false);
        setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }, 1500);
      return () => clearTimeout(timer);
    },
  });

  // Switch to read-only if document is signed (RULE SIG-001)
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isSigned);
    }
  }, [isSigned, editor]);

  const handleSaveVersion = () => {
    if (isSigned) return;
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 600);
  };

  const handleSendDocument = () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setSendError('Please provide a valid recipient email address.');
      return;
    }

    setSendError(null);
    setIsSaving(true);

    // Simulate sending transition (RULE SIG-004: draft -> sent)
    setTimeout(() => {
      setIsSaving(false);
      setStatus('sent');
      setSendSuccess(true);
      setTimeout(() => {
        setShowSendModal(false);
        setSendSuccess(false);
      }, 1200);
    }, 800);
  };

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      setTemplateError('Template title is required.');
      return;
    }
    setTemplateError(null);
    setIsSavingTemplate(true);
    // In production environment, calls POST /api/v1/documents/:id/save-as-template
    setTimeout(() => {
      setIsSavingTemplate(false);
      setTemplateSuccess(true);
      setTimeout(() => {
        setShowSaveTemplateModal(false);
        setTemplateSuccess(false);
      }, 1200);
    }, 700);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '80px' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--color-gray-200)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/documents"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid var(--color-gray-300)',
              color: 'var(--color-gray-700)',
              backgroundColor: '#fff',
            }}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <input
              type="text"
              value={title}
              disabled={isSigned}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                border: '1px solid transparent',
                borderRadius: '4px',
                padding: '2px 6px',
                background: 'transparent',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-gray-300)')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '2px',
                paddingLeft: '6px',
              }}
            >
              <span
                className={`status-badge ${
                  status === 'signed'
                    ? 'status-badge-success'
                    : status === 'sent'
                      ? 'status-badge-warning'
                      : 'status-badge-neutral'
                }`}
              >
                <span className="status-badge-dot" />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--color-gray-500)',
                  fontFamily: 'monospace',
                }}
              >
                ID: {documentId}
              </span>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--color-gray-500)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Clock size={12} />
                {isSaving ? 'Saving snapshot...' : `Saved at ${lastSaved}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleSaveVersion}
            disabled={isSigned || isSaving}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={15} />
            Save Snapshot
          </button>

          <button
            onClick={() => {
              setTemplateName(title + ' Template');
              setShowSaveTemplateModal(true);
            }}
            disabled={isSaving}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Copy size={15} />
            Save as Template
          </button>

          {status === 'draft' && (
            <button
              onClick={() => setShowSendModal(true)}
              className="pact-btn pact-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={15} />
              Send for Signature
            </button>
          )}

          {status === 'sent' && (
            <Link
              href={`/d/us1-demo123`}
              target="_blank"
              className="pact-btn pact-btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileText size={15} />
              Recipient View
            </Link>
          )}
        </div>
      </div>

      {/* Signed Document Banner (RULE SIG-001 Immutability) */}
      {isSigned && (
        <div
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#166534',
          }}
        >
          <Lock size={18} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Legally Sealed Document</div>
            <div style={{ fontSize: '13px', color: '#15803D' }}>
              This document has been completed and legally signed. Content snapshots are permanently
              immutable per Invariant I-09 & Rule SIG-001.
            </div>
          </div>
        </div>
      )}

      {/* Editor Container with Toolbar */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid var(--color-gray-200)',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Formatting Toolbar */}
        {!isSigned && editor && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-gray-200)',
              backgroundColor: 'var(--color-gray-50)',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
            }}
          >
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('bold') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Bold"
            >
              <Bold size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('italic') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Italic"
            >
              <Italic size={15} />
            </button>

            <span
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--color-gray-300)',
                margin: '0 4px',
              }}
            />

            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('heading', { level: 1 })
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Heading 1"
            >
              <Heading1 size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('heading', { level: 2 })
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Heading 2"
            >
              <Heading2 size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('heading', { level: 3 })
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Heading 3"
            >
              <Heading3 size={15} />
            </button>

            <span
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--color-gray-300)',
                margin: '0 4px',
              }}
            />

            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('bulletList') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Bullet List"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('orderedList')
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Numbered List"
            >
              <ListOrdered size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor.isActive('blockquote') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Quote"
            >
              <Quote size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              title="Divider"
            >
              <Minus size={15} />
            </button>

            <span
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--color-gray-300)',
                margin: '0 4px',
              }}
            />

            <button
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              title="Undo"
            >
              <Undo size={15} />
            </button>
            <button
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              title="Redo"
            >
              <Redo size={15} />
            </button>

            <span
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--color-gray-300)',
                margin: '0 4px',
              }}
            />

            <button
              type="button"
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: 'pricingTable',
                    attrs: {
                      pricingTableId: 'pt-' + Date.now().toString().slice(-6),
                      documentId,
                    },
                  })
                  .run();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #BFDBFE',
                background: '#EFF6FF',
                color: '#2563EB',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
              title="Insert Interactive CPQ Pricing Table"
            >
              <Receipt size={14} />+ Pricing Table
            </button>
          </div>
        )}

        {/* Paper Canvas */}
        <div style={{ padding: '40px 48px', minHeight: '500px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Send Document Modal */}
      {showSendModal && (
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
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '4px',
              }}
            >
              Send Document for Signature
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              The recipient will receive a secure review and signature link via{' '}
              <strong>pact.link</strong>.
            </p>

            {sendError && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#991B1B',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={16} />
                <span>{sendError}</span>
              </div>
            )}

            {sendSuccess ? (
              <div
                style={{
                  padding: '32px 0',
                  textAlign: 'center',
                  color: '#15803D',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={36} color="#16A34A" />
                <div style={{ fontWeight: 600, fontSize: '16px' }}>Document Sent!</div>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                  State transition to 'sent' complete. Outbox event dispatched.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Recipient Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="client@company.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Expiration Window
                  </label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: '#fff',
                    }}
                  >
                    <option value={7}>7 days</option>
                    <option value={14}>14 days (recommended)</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Password Protection (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave empty for open link"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Domain Restriction (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. company.com (comma separated)"
                    value={domainRestriction}
                    onChange={(e) => setDomainRestriction(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <button
                    onClick={() => setShowSendModal(false)}
                    className="pact-btn pact-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendDocument}
                    className="pact-btn pact-btn-primary"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Sending...' : 'Confirm & Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
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
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950)',
                marginBottom: '4px',
              }}
            >
              Save Document as Template
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Create a reusable organization template from this document's content snapshot.
            </p>

            {templateError && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#991B1B',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={16} />
                <span>{templateError}</span>
              </div>
            )}

            {templateSuccess ? (
              <div
                style={{
                  padding: '24px 0',
                  textAlign: 'center',
                  color: '#15803D',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={36} color="#16A34A" />
                <div style={{ fontWeight: 600, fontSize: '16px' }}>Template Saved!</div>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                  Now available in your organization's template library.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Template Title *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-gray-800)',
                      marginBottom: '4px',
                    }}
                  >
                    Category
                  </label>
                  <select
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: '#fff',
                    }}
                  >
                    <option value="Contracts">Contracts</option>
                    <option value="Proposals">Proposals</option>
                    <option value="Statement of Work (SOW)">Statement of Work (SOW)</option>
                    <option value="Legal & Compliance">Legal & Compliance</option>
                    <option value="Quotes">Quotes</option>
                  </select>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <button
                    onClick={() => setShowSaveTemplateModal(false)}
                    className="pact-btn pact-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAsTemplate}
                    className="pact-btn pact-btn-primary"
                    disabled={isSavingTemplate}
                  >
                    {isSavingTemplate ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
