'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlertCircle,
} from 'lucide-react';

interface VariableField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email';
  required: boolean;
}

interface SignerRole {
  roleLabel: string;
  verificationMethod: 'none' | 'email' | 'passcode' | 'sms';
}

const CATEGORIES = [
  'Proposals',
  'Quotes',
  'Contracts',
  'Statement of Work (SOW)',
  'Online Brochures',
  'Sign-Offs',
  'Job Offers',
];

const INDUSTRIES = [
  'Software / IT',
  'Legal & Compliance',
  'Management Consulting',
  'Digital Marketing',
  'Finance & FinTech',
  'Real Estate',
  'Construction',
];

export default function NewTemplateWizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 1: Start State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Contracts');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Software / IT']);
  const [folderId, setFolderId] = useState<string>('');

  // Step 2: Content (Tiptap Editor)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: `
      <h1>Agreement Title</h1>
      <p>This Agreement is entered into on <strong>{{effectiveDate}}</strong> by and between <strong>{{clientName}}</strong> ("Client") and <strong>{{providerName}}</strong> ("Provider").</p>
      <h2>1. Scope of Engagement</h2>
      <p>Provider shall perform the professional services outlined in the attached Schedule.</p>
      <h2>2. Financial Consideration</h2>
      <p>Client agrees to pay Provider the total contract sum of <strong>{{contractAmount}}</strong>.</p>
      <h2>3. Signatures</h2>
      <p>In witness whereof, the parties hereto have caused this Agreement to be duly executed by their authorized representatives.</p>
    `,
    editorProps: {
      attributes: {
        class: 'prose focus:outline-none min-h-[360px] text-gray-900',
        style: 'font-size: 15px; line-height: 1.7; color: var(--color-gray-900);',
      },
    },
  });

  // Step 3: Configure Settings & Variables
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [maxViews, setMaxViews] = useState<number>(50);
  const [domainRestriction, setDomainRestriction] = useState<string>('');
  const [requirePassword, setRequirePassword] = useState<boolean>(false);

  const [variables, setVariables] = useState<VariableField[]>([
    { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
    { key: 'clientName', label: 'Client Name', type: 'text', required: true },
    { key: 'providerName', label: 'Provider Name', type: 'text', required: true },
    { key: 'contractAmount', label: 'Contract Amount ($)', type: 'number', required: false },
  ]);

  const [signerRoles, setSignerRoles] = useState<SignerRole[]>([
    { roleLabel: 'Client Signatory', verificationMethod: 'email' },
    { roleLabel: 'Provider Signatory', verificationMethod: 'none' },
  ]);

  // Tag toggle helper
  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // Add variable helper
  const handleAddVariable = () => {
    const newKey = `var_${variables.length + 1}`;
    setVariables((prev) => [
      ...prev,
      { key: newKey, label: `New Variable ${prev.length + 1}`, type: 'text', required: false },
    ]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  };

  // Add signer role helper
  const handleAddSignerRole = () => {
    setSignerRoles((prev) => [
      ...prev,
      { roleLabel: `Signer ${prev.length + 1}`, verificationMethod: 'email' },
    ]);
  };

  const handleRemoveSignerRole = (index: number) => {
    setSignerRoles((prev) => prev.filter((_, i) => i !== index));
  };

  // Navigation handlers
  const handleNext = () => {
    if (currentStep === 1) {
      if (!title.trim()) {
        setErrorMessage('Template title is required.');
        return;
      }
    }
    setErrorMessage(null);
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Save template submission
  const handleSaveTemplate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const templateData = {
      workspaceId: '33333333-3333-7333-8333-333333333333', // Default active workspace
      title: title.trim(),
      category,
      industryTags: selectedTags,
      content: editor ? editor.getJSON() : { type: 'doc', content: [] },
      defaultSettings: {
        expiresInDays,
        maxViews,
        domainRestriction: domainRestriction
          ? domainRestriction
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean)
          : [],
        requirePassword,
      },
      variableFields: variables,
      signerRoles,
      folderId: folderId || undefined,
    };

    try {
      void templateData;
      // In production calls POST /api/v1/templates
      router.push('/templates');
    } catch {
      setErrorMessage('Failed to save template. Please check the fields and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <Link
          href="/templates"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-gray-600)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          Back to Templates
        </Link>

        {/* 4-Step Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {[
            { step: 1, label: 'Start' },
            { step: 2, label: 'Editor' },
            { step: 3, label: 'Configure' },
            { step: 4, label: 'Confirm' },
          ].map(({ step, label }, index) => {
            const isCompleted = currentStep > step;
            const isActive = currentStep === step;
            return (
              <React.Fragment key={step}>
                {index > 0 && (
                  <div
                    style={{
                      width: '24px',
                      height: '2px',
                      backgroundColor: isCompleted
                        ? 'var(--color-blue-600)'
                        : 'var(--border-color)',
                    }}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: isActive
                        ? 'var(--color-blue-600)'
                        : isCompleted
                          ? 'var(--color-blue-50)'
                          : 'var(--color-gray-100)',
                      color: isActive
                        ? '#ffffff'
                        : isCompleted
                          ? 'var(--color-blue-600)'
                          : 'var(--color-gray-500)',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isCompleted ? <Check size={13} /> : step}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-gray-900)' : 'var(--color-gray-500)',
                    }}
                  >
                    {label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: 'var(--color-red-50)',
            border: '1px solid var(--color-red-200)',
            borderRadius: 'var(--radius-default)',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--color-red-700)',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: START */}
      {currentStep === 1 && (
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
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '8px',
            }}
          >
            Step 1: Template Metadata
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '24px' }}>
            Give your template a clear title, select its document type category, and add industry
            tags.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-800)',
                  marginBottom: '6px',
                }}
              >
                Template Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Enterprise Software License Agreement (SLA)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-default)',
                  border: '1px solid var(--border-color)',
                  fontSize: '15px',
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
                  marginBottom: '6px',
                }}
              >
                Document Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-default)',
                  border: '1px solid var(--border-color)',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-800)',
                  marginBottom: '6px',
                }}
              >
                Industry Tags
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {INDUSTRIES.map((ind) => {
                  const isSelected = selectedTags.includes(ind);
                  return (
                    <button
                      type="button"
                      key={ind}
                      onClick={() => handleToggleTag(ind)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: isSelected
                          ? '1px solid var(--color-blue-600)'
                          : '1px solid var(--border-color)',
                        backgroundColor: isSelected
                          ? 'var(--color-blue-50)'
                          : 'var(--color-gray-50)',
                        color: isSelected ? 'var(--color-blue-600)' : 'var(--color-gray-700)',
                        fontSize: '12px',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {ind}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-800)',
                  marginBottom: '6px',
                }}
              >
                Organize into Folder (Optional)
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-default)',
                  border: '1px solid var(--border-color)',
                  fontSize: '14px',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="">None (Root Directory)</option>
                <option value="fld_legal">Legal & Compliance</option>
                <option value="fld_sales">Sales Agreements</option>
                <option value="fld_procure">Procurement & SOWs</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: TIPTAP EDITOR */}
      {currentStep === 2 && (
        <div
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            overflow: 'hidden',
          }}
        >
          {/* Editor Toolbar */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--color-gray-50)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('bold') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Bold"
            >
              <Bold size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('italic') ? 'var(--color-gray-200)' : 'transparent',
                cursor: 'pointer',
              }}
              title="Italic"
            >
              <Italic size={16} />
            </button>
            <div
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--border-color)',
                margin: '0 4px',
              }}
            />
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('heading', { level: 1 })
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Heading 1"
            >
              <Heading1 size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('heading', { level: 2 })
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Heading 2"
            >
              <Heading2 size={16} />
            </button>
            <div
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--border-color)',
                margin: '0 4px',
              }}
            />
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('bulletList')
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Bullet List"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('orderedList')
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Numbered List"
            >
              <ListOrdered size={16} />
            </button>
            <button
              type="button"
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: editor?.isActive('blockquote')
                  ? 'var(--color-gray-200)'
                  : 'transparent',
                cursor: 'pointer',
              }}
              title="Quote"
            >
              <Quote size={16} />
            </button>
            <div
              style={{
                width: '1px',
                height: '18px',
                backgroundColor: 'var(--border-color)',
                margin: '0 4px',
              }}
            />
            <button
              type="button"
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              style={{
                padding: '6px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              title="Divider"
            >
              <Minus size={16} />
            </button>

            {/* Helper Tag */}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--color-gray-500)' }}>
              Tip: Insert merge tags like{' '}
              <code
                style={{
                  backgroundColor: 'var(--color-gray-200)',
                  padding: '2px 4px',
                  borderRadius: '3px',
                }}
              >
                {'{{clientName}}'}
              </code>
            </span>
          </div>

          {/* Editor Body */}
          <div style={{ padding: '32px', minHeight: '400px' }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      )}

      {/* STEP 3: CONFIGURE (SETTINGS & VARIABLES) */}
      {currentStep === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Default Access & Security Settings */}
          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-default)',
              padding: '24px',
            }}
          >
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--color-gray-900)',
                marginBottom: '4px',
              }}
            >
              Default Security & Expiry Settings
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '20px' }}>
              These rules automatically apply to every document created from this template.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Default Expiration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 30)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Maximum Distinct View Limit
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={maxViews}
                  onChange={(e) => setMaxViews(parseInt(e.target.value, 10) || 50)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Recipient Domain Restriction (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. acme.corp, partner.org"
                  value={domainRestriction}
                  onChange={(e) => setDomainRestriction(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '28px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={requirePassword}
                    onChange={(e) => setRequirePassword(e.target.checked)}
                  />
                  <span>Require access passcode by default</span>
                </label>
              </div>
            </div>
          </div>

          {/* Merge Variables Definition */}
          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-default)',
              padding: '24px',
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
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                  Merge Variables
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                  Define input fields that prompt creators when using this template.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddVariable}
                className="pact-btn pact-btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <Plus size={14} />
                Add Variable
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {variables.map((variable, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr 120px 80px 40px',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: 'var(--color-gray-50)',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <input
                    type="text"
                    value={variable.key}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                      setVariables((prev) =>
                        prev.map((v, i) => (i === idx ? { ...v, key: val } : v)),
                      );
                    }}
                    placeholder="Key (e.g. clientName)"
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                    }}
                  />
                  <input
                    type="text"
                    value={variable.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVariables((prev) =>
                        prev.map((v, i) => (i === idx ? { ...v, label: val } : v)),
                      );
                    }}
                    placeholder="Label shown to user"
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                    }}
                  />
                  <select
                    value={variable.type}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setVariables((prev) =>
                        prev.map((v, i) => (i === idx ? { ...v, type: val } : v)),
                      );
                    }}
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="email">Email</option>
                  </select>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={variable.required}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setVariables((prev) =>
                          prev.map((v, i) => (i === idx ? { ...v, required: val } : v)),
                        );
                      }}
                    />
                    Req
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveVariable(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-gray-400)',
                      cursor: 'pointer',
                    }}
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Signer Roles Definition */}
          <div
            style={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-default)',
              padding: '24px',
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
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                  Signer Roles & Authentication
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                  Define signatory placeholders and their default identity verification methods.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddSignerRole}
                className="pact-btn pact-btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <Plus size={14} />
                Add Signer Role
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {signerRoles.map((role, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 180px 40px',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: 'var(--color-gray-50)',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <input
                    type="text"
                    value={role.roleLabel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSignerRoles((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, roleLabel: val } : r)),
                      );
                    }}
                    placeholder="Role Label (e.g. Client Signatory)"
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                    }}
                  />
                  <select
                    value={role.verificationMethod}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setSignerRoles((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, verificationMethod: val } : r)),
                      );
                    }}
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <option value="none">None (Direct Link)</option>
                    <option value="email">Email Verification</option>
                    <option value="passcode">Access Passcode</option>
                    <option value="sms">SMS OTP</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveSignerRole(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-gray-400)',
                      cursor: 'pointer',
                    }}
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CONFIRM & REVIEW */}
      {currentStep === 4 && (
        <div
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            padding: '28px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '6px',
            }}
          >
            Step 4: Confirm Template Details
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '24px' }}>
            Review the summary of your template configuration before saving to your organization
            library.
          </p>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-default)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>Title:</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                {title}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-default)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>Category:</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                {category}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-default)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>Industries:</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-800)' }}>
                {selectedTags.join(', ') || 'None'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-default)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                Configured Merge Variables:
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-blue-600)' }}>
                {variables.length} variable{variables.length === 1 ? '' : 's'}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-gray-50)',
                borderRadius: 'var(--radius-default)',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                Default Expiry:
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-gray-800)' }}>
                {expiresInDays} days (max {maxViews} views)
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-default)',
              backgroundColor: 'var(--color-blue-50)',
              border: '1px solid var(--color-blue-100)',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--color-blue-800)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              <ShieldCheck size={16} />
              <span>Copy-On-Create Architecture Assured (RULE SIG-006)</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-blue-700)', marginTop: '4px' }}>
              Any documents generated from this template will maintain independent cryptographic
              snapshots. Future edits to this template will never mutate previously generated
              contracts.
            </p>
          </div>
        </div>
      )}

      {/* Wizard Footer Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '24px',
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="pact-btn pact-btn-secondary"
          style={{ visibility: currentStep === 1 ? 'hidden' : 'visible' }}
        >
          Back
        </button>

        {currentStep < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            className="pact-btn pact-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            Continue
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={isSubmitting}
            className="pact-btn pact-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {isSubmitting ? 'Saving Template...' : 'Save Template to Library'}
            <Check size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
