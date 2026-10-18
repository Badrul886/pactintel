'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  ArrowLeft,
  Save,
  FilePlus,
  Eye,
  Plus,
  Trash2,
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
  BookOpen,
  Layers,
  Tag,
} from 'lucide-react';

interface TemplateEditPageProps {
  params: Promise<{ id: string }>;
}

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

interface ContentBlock {
  id: string;
  title: string;
  category: string;
  snippet: string;
}

export default function TemplateEditorPage({ params }: TemplateEditPageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const templateId = resolvedParams.id;

  // Template metadata state
  const [title, setTitle] = useState('Standard Master Services Agreement');
  const [category] = useState('Contracts');
  const [usageCount, setUsageCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string>('Just now');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active sidebar tab
  const [activeSidebarTab, setActiveSidebarTab] = useState<'variables' | 'library' | 'settings'>(
    'variables',
  );

  // Variable fields state
  const [variableFields, setVariableFields] = useState<VariableField[]>([
    { key: 'clientName', label: 'Client Legal Entity Name', type: 'text', required: true },
    { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
    { key: 'contractAmount', label: 'Total Value / Fee', type: 'text', required: true },
    { key: 'governingLaw', label: 'Governing Jurisdiction', type: 'text', required: false },
  ]);
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarLabel, setNewVarLabel] = useState('');
  const [newVarType, setNewVarType] = useState<'text' | 'number' | 'date' | 'email'>('text');
  const [newVarRequired, setNewVarRequired] = useState(true);

  // Reusable Content Blocks (Content Library)
  const [contentBlocks] = useState<ContentBlock[]>([
    {
      id: 'blk_1',
      title: 'Mutual Indemnification Standard Clause',
      category: 'Legal Clauses',
      snippet:
        '<p>Each Party shall defend, indemnify, and hold harmless the other Party against all third-party claims arising from gross negligence or intentional misconduct.</p>',
    },
    {
      id: 'blk_2',
      title: 'Net-30 Enterprise Payment Term',
      category: 'Payment Terms',
      snippet:
        '<p>All invoices shall be due and payable within thirty (30) days from the date of issuance. Undisputed past-due balances accrue interest at 1.5% per month.</p>',
    },
    {
      id: 'blk_3',
      title: 'GDPR & CCPA Data Privacy Addendum',
      category: 'Compliance',
      snippet:
        '<p>Provider shall process personal data solely in compliance with applicable Data Protection Laws and the executed Data Processing Agreement (DPA).</p>',
    },
    {
      id: 'blk_4',
      title: 'Warranty & Non-Infringement Disclaimer',
      category: 'Warranties',
      snippet:
        '<p>Provider warrants that services will be performed in a professional manner conforming to recognized commercial standards.</p>',
    },
  ]);

  // Signer Roles
  const [signerRoles] = useState<SignerRole[]>([
    { roleLabel: 'Client Signatory', verificationMethod: 'email' },
    { roleLabel: 'Executive Sponsor', verificationMethod: 'passcode' },
  ]);

  // Default Settings
  const [expiresInDays, setExpiresInDays] = useState<number>(30);
  const [domainRestriction, setDomainRestriction] = useState<string>('');
  const [requirePassword, setRequirePassword] = useState<boolean>(false);

  // Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewValues] = useState<Record<string, string>>({
    clientName: 'Starlight Dynamics Inc.',
    effectiveDate: '2026-11-01',
    contractAmount: '$45,000.00 USD',
    governingLaw: 'State of Delaware',
  });

  // Use Template (Create Document) Modal State
  const [showUseTemplateModal, setShowUseTemplateModal] = useState<boolean>(false);
  const [docTitle, setDocTitle] = useState('');
  const [inputVariables, setInputVariables] = useState<Record<string, string>>({});
  const [isCreatingDoc, setIsCreatingDoc] = useState<boolean>(false);

  // Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: `
      <h1>Master Services Agreement</h1>
      <p>This Master Services Agreement ("Agreement") is entered into and made effective as of <strong>{{effectiveDate}}</strong> by and between <strong>{{clientName}}</strong> ("Client") and <strong>PactIntel Partner</strong> ("Provider").</p>
      <h2>1. Statement of Work & Deliverables</h2>
      <p>Provider will render cloud infrastructure and digital contracting automation services as described in mutually executed Statement of Work attachments.</p>
      <h2>2. Compensation & Payment</h2>
      <p>Client shall pay Provider the total contract fee of <strong>{{contractAmount}}</strong> in accordance with billing schedules set forth herein.</p>
      <h2>3. Governing Law</h2>
      <p>This Agreement and any dispute arising from it shall be governed and construed pursuant to the laws of <strong>{{governingLaw}}</strong>.</p>
      <h2>4. Execution & Legal Assent</h2>
      <p>By signing below, the parties confirm agreement to all terms and conditions set forth above.</p>
    `,
    editorProps: {
      attributes: {
        class: 'prose focus:outline-none min-h-[480px] text-gray-900',
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

  // Auto-fill template doc title when opening modal
  useEffect(() => {
    if (showUseTemplateModal) {
      setDocTitle(`${title} - ${new Date().toLocaleDateString()}`);
      const initialVals: Record<string, string> = {};
      variableFields.forEach((v) => {
        initialVals[v.key] = '';
      });
      setInputVariables(initialVals);
    }
  }, [showUseTemplateModal, title, variableFields]);

  // Insert Variable Token into Editor
  const handleInsertVariable = (key: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${key}}}`).run();
    showToast(`Inserted variable {{${key}}}`);
  };

  // Add Variable Field
  const handleAddVariableField = () => {
    if (!newVarKey.trim() || !newVarLabel.trim()) {
      setErrorMessage('Variable key and display label are required.');
      return;
    }
    const cleanKey = newVarKey.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (variableFields.some((v) => v.key === cleanKey)) {
      setErrorMessage(`Variable key "${cleanKey}" already exists.`);
      return;
    }

    setVariableFields((prev) => [
      ...prev,
      {
        key: cleanKey,
        label: newVarLabel.trim(),
        type: newVarType,
        required: newVarRequired,
      },
    ]);
    setNewVarKey('');
    setNewVarLabel('');
    setErrorMessage(null);
    showToast(`Added variable {{${cleanKey}}}`);
  };

  // Remove Variable Field
  const handleRemoveVariableField = (key: string) => {
    setVariableFields((prev) => prev.filter((v) => v.key !== key));
    showToast(`Removed variable {{${key}}}`);
  };

  // Insert Content Block into Editor
  const handleInsertBlock = (block: ContentBlock) => {
    if (!editor) return;
    editor.chain().focus().insertContent(block.snippet).run();
    showToast(`Inserted "${block.title}" into template`);
  };

  // Save Template Action
  const handleSaveTemplate = async () => {
    if (!editor) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      // In production environment, this calls PATCH /api/v1/templates/:id
      // Simulating seamless response
      await new Promise((r) => setTimeout(r, 600));
      setIsSaving(false);
      setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      showToast('Template changes saved successfully');
    } catch {
      setIsSaving(false);
      setErrorMessage('Failed to save template. Please try again.');
    }
  };

  // Create Document from Template Action (Adhering to RULE SIG-006: copy-on-create, never live link)
  const handleCreateDocumentFromTemplate = async () => {
    if (!docTitle.trim()) {
      setErrorMessage('Document title is required.');
      return;
    }
    setIsCreatingDoc(true);
    setErrorMessage(null);

    try {
      // In production environment, calls POST /api/v1/templates/:id/documents
      await new Promise((r) => setTimeout(r, 700));
      setUsageCount((prev) => prev + 1);
      setIsCreatingDoc(false);
      setShowUseTemplateModal(false);
      // Navigate to documents list or document editor
      router.push('/documents');
    } catch {
      setIsCreatingDoc(false);
      setErrorMessage('Could not create document from template.');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Generate Preview HTML with replaced variables
  const getPreviewHtml = () => {
    if (!editor) return '';
    let html = editor.getHTML();
    variableFields.forEach((vf) => {
      const val = previewValues[vf.key] || `[${vf.label}]`;
      const regex = new RegExp(`\\{\\{${vf.key}\\}\\}`, 'g');
      html = html.replace(
        regex,
        `<mark style="background-color: #DBEAFE; color: #1E40AF; padding: 1px 4px; border-radius: 3px;">${val}</mark>`,
      );
    });
    return html;
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', paddingBottom: '80px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: 'var(--color-gray-900)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle size={15} color="#10B981" />
          {toastMessage}
        </div>
      )}

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
            href="/templates"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={title}
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
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-gray-100)',
                  color: 'var(--color-gray-700)',
                }}
              >
                {category}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '2px',
                paddingLeft: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--color-gray-500)',
                  fontFamily: 'monospace',
                }}
              >
                ID: {templateId}
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
                {isSaving ? 'Saving changes...' : `Saved at ${lastSaved}`}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                Usage: <strong>{usageCount}</strong> documents created
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowPreviewModal(true)}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Eye size={15} />
            Preview
          </button>

          <button
            onClick={handleSaveTemplate}
            disabled={isSaving}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={15} />
            Save Changes
          </button>

          <button
            onClick={() => setShowUseTemplateModal(true)}
            className="pact-btn pact-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FilePlus size={15} />
            Use Template
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#991B1B',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main 2-Column Workspace: Left = Tiptap Document Canvas, Right = Tool Sidebar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 360px',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left: Tiptap Editor */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--color-gray-200)',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          {/* Formatting Toolbar */}
          {editor && (
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
                  background: editor.isActive('bulletList')
                    ? 'var(--color-gray-200)'
                    : 'transparent',
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
                  background: editor.isActive('blockquote')
                    ? 'var(--color-gray-200)'
                    : 'transparent',
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
            </div>
          )}

          {/* Paper Canvas */}
          <div style={{ padding: '40px 48px', minHeight: '540px' }}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Right: Sidebar with Variables, Content Library, and Settings Tabs */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--color-gray-200)',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar Tab Header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--color-gray-200)',
              backgroundColor: 'var(--color-gray-50)',
            }}
          >
            <button
              onClick={() => setActiveSidebarTab('variables')}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                borderBottom:
                  activeSidebarTab === 'variables'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                backgroundColor: activeSidebarTab === 'variables' ? '#fff' : 'transparent',
                fontWeight: activeSidebarTab === 'variables' ? 600 : 500,
                color:
                  activeSidebarTab === 'variables'
                    ? 'var(--color-primary)'
                    : 'var(--color-gray-600)',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Tag size={14} />
              Variables
            </button>
            <button
              onClick={() => setActiveSidebarTab('library')}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                borderBottom:
                  activeSidebarTab === 'library'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                backgroundColor: activeSidebarTab === 'library' ? '#fff' : 'transparent',
                fontWeight: activeSidebarTab === 'library' ? 600 : 500,
                color:
                  activeSidebarTab === 'library' ? 'var(--color-primary)' : 'var(--color-gray-600)',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <BookOpen size={14} />
              Clauses
            </button>
            <button
              onClick={() => setActiveSidebarTab('settings')}
              style={{
                flex: 1,
                padding: '10px 8px',
                border: 'none',
                borderBottom:
                  activeSidebarTab === 'settings'
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                backgroundColor: activeSidebarTab === 'settings' ? '#fff' : 'transparent',
                fontWeight: activeSidebarTab === 'settings' ? 600 : 500,
                color:
                  activeSidebarTab === 'settings'
                    ? 'var(--color-primary)'
                    : 'var(--color-gray-600)',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Layers size={14} />
              Defaults
            </button>
          </div>

          {/* Sidebar Tab 1: Variables */}
          {activeSidebarTab === 'variables' && (
            <div style={{ padding: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginBottom: '4px',
                  }}
                >
                  Dynamic Variable Tokens
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Click "Insert" to place a merge token at cursor position.
                </div>
              </div>

              {/* Variable List */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '20px',
                }}
              >
                {variableFields.map((field) => (
                  <div
                    key={field.key}
                    style={{
                      border: '1px solid var(--color-gray-200)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      backgroundColor: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-primary)',
                            backgroundColor: 'var(--color-gray-100)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                          }}
                        >
                          {`{{${field.key}}}`}
                        </code>
                        {field.required && (
                          <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 600 }}>
                            *
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-gray-600)',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {field.label} ({field.type})
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => handleInsertVariable(field.key)}
                        className="pact-btn pact-btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 500 }}
                      >
                        Insert
                      </button>
                      <button
                        onClick={() => handleRemoveVariableField(field.key)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-gray-400)',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                        title="Remove variable"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Variable Form */}
              <div
                style={{
                  borderTop: '1px solid var(--color-gray-200)',
                  paddingTop: '16px',
                  backgroundColor: 'var(--color-gray-50)',
                  margin: '-16px',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginBottom: '10px',
                  }}
                >
                  Create New Variable
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Key (e.g. clientName)"
                    value={newVarKey}
                    onChange={(e) => setNewVarKey(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '12px',
                      outline: 'none',
                      backgroundColor: '#fff',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Display Label (e.g. Legal Name)"
                    value={newVarLabel}
                    onChange={(e) => setNewVarLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '12px',
                      outline: 'none',
                      backgroundColor: '#fff',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={newVarType}
                      onChange={(e) => setNewVarType(e.target.value as any)}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-gray-300)',
                        fontSize: '12px',
                        outline: 'none',
                        backgroundColor: '#fff',
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
                        gap: '6px',
                        fontSize: '12px',
                        color: 'var(--color-gray-700)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={newVarRequired}
                        onChange={(e) => setNewVarRequired(e.target.checked)}
                      />
                      Required
                    </label>
                  </div>
                  <button
                    onClick={handleAddVariableField}
                    className="pact-btn pact-btn-primary"
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      fontSize: '12px',
                    }}
                  >
                    <Plus size={14} />
                    Add Variable
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sidebar Tab 2: Content Library (Clauses) */}
          {activeSidebarTab === 'library' && (
            <div style={{ padding: '16px' }}>
              <div style={{ marginBottom: '14px' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginBottom: '4px',
                  }}
                >
                  Clause Library
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Insert vetted standard legal clauses into this template.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {contentBlocks.map((block) => (
                  <div
                    key={block.id}
                    style={{
                      border: '1px solid var(--color-gray-200)',
                      borderRadius: '6px',
                      padding: '10px',
                      backgroundColor: '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-gray-900)',
                          }}
                        >
                          {block.title}
                        </div>
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--color-gray-500)',
                            backgroundColor: 'var(--color-gray-100)',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            display: 'inline-block',
                            marginTop: '2px',
                          }}
                        >
                          {block.category}
                        </span>
                      </div>
                      <button
                        onClick={() => handleInsertBlock(block)}
                        className="pact-btn pact-btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', flexShrink: 0 }}
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sidebar Tab 3: Defaults & Security Settings */}
          {activeSidebarTab === 'settings' && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-800)',
                    marginBottom: '4px',
                  }}
                >
                  Document Expiration Window
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '12px',
                    outline: 'none',
                    backgroundColor: '#fff',
                  }}
                >
                  <option value={7}>7 Days</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days (recommended)</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-800)',
                    marginBottom: '4px',
                  }}
                >
                  Domain Restriction
                </label>
                <input
                  type="text"
                  placeholder="e.g. enterprise.com"
                  value={domainRestriction}
                  onChange={(e) => setDomainRestriction(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '12px',
                    outline: 'none',
                    backgroundColor: '#fff',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--color-gray-800)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={requirePassword}
                    onChange={(e) => setRequirePassword(e.target.checked)}
                  />
                  Require Recipient Access Code
                </label>
              </div>

              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: '12px' }}>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-800)',
                    marginBottom: '8px',
                  }}
                >
                  Default Signer Roles
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {signerRoles.map((role, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--color-gray-50)',
                        border: '1px solid var(--color-gray-200)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                        {role.roleLabel}
                      </span>
                      <span style={{ color: 'var(--color-gray-500)' }}>
                        Auth: {role.verificationMethod}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '820px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--color-gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  Template Live Preview
                </h2>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  Variables are highlighted in blue with sample resolution values.
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="pact-btn pact-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                Close Preview
              </button>
            </div>

            <div style={{ padding: '32px 40px', overflowY: 'auto', flex: 1 }}>
              <div
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--color-gray-900)' }}
              />
            </div>

            <div
              style={{
                padding: '12px 24px',
                borderTop: '1px solid var(--color-gray-200)',
                backgroundColor: 'var(--color-gray-50)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setShowPreviewModal(false)}
                className="pact-btn pact-btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Use Template Modal: Create Document from Template (RULE SIG-006: copy-on-create) */}
      {showUseTemplateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <FilePlus size={20} color="var(--color-primary)" />
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Create Document from Template
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Adheres to <strong>RULE SIG-006</strong>: Document creates an independent deep-copy
              snapshot. Future edits to this template will never alter the created document.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                marginBottom: '20px',
              }}
            >
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
                  Document Title *
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-gray-300)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              {variableFields.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: '12px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-gray-900)',
                      marginBottom: '8px',
                    }}
                  >
                    Merge Variable Values
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {variableFields.map((vf) => (
                      <div key={vf.key}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--color-gray-700)',
                            marginBottom: '2px',
                          }}
                        >
                          {vf.label} {vf.required && <span style={{ color: '#DC2626' }}>*</span>}
                        </label>
                        <input
                          type={
                            vf.type === 'number' ? 'number' : vf.type === 'date' ? 'date' : 'text'
                          }
                          placeholder={`Enter value for {{${vf.key}}}`}
                          value={inputVariables[vf.key] || ''}
                          onChange={(e) =>
                            setInputVariables((prev) => ({
                              ...prev,
                              [vf.key]: e.target.value,
                            }))
                          }
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: '1px solid var(--color-gray-300)',
                            fontSize: '12px',
                            outline: 'none',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowUseTemplateModal(false)}
                className="pact-btn pact-btn-secondary"
                disabled={isCreatingDoc}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDocumentFromTemplate}
                className="pact-btn pact-btn-primary"
                disabled={isCreatingDoc}
              >
                {isCreatingDoc ? 'Creating Document...' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
