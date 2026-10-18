'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Copy,
  Search,
  ChevronRight,
  Plus,
  CheckCircle,
  AlertCircle,
  FilePlus,
} from 'lucide-react';

interface TemplateItem {
  id: string;
  title: string;
  category: string;
  usageCount: number;
  variables: { key: string; label: string; required: boolean }[];
  updatedAt: string;
}

export default function NewDocumentPage() {
  const router = useRouter();

  // Mode tab: 'blank' | 'template'
  const [activeTab, setActiveTab] = useState<'blank' | 'template'>('blank');

  // Blank document form
  const [blankTitle, setBlankTitle] = useState('');
  const [blankRecipient, setBlankRecipient] = useState('');
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);

  // Template browser state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [showUseModal, setShowUseModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [variableInputs, setVariableInputs] = useState<Record<string, string>>({});
  const [isCreatingFromTemplate, setIsCreatingFromTemplate] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Available templates (in production fetched from GET /api/v1/templates)
  const [templates] = useState<TemplateItem[]>([
    {
      id: 'tpl_msa_01',
      title: 'Enterprise Master Services Agreement (MSA)',
      category: 'Contracts',
      usageCount: 42,
      variables: [
        { key: 'clientName', label: 'Client Legal Name', required: true },
        { key: 'effectiveDate', label: 'Effective Date', required: true },
        { key: 'contractAmount', label: 'Total Value / Fee', required: true },
        { key: 'governingLaw', label: 'Jurisdiction', required: false },
      ],
      updatedAt: '2026-10-18',
    },
    {
      id: 'tpl_sow_02',
      title: 'Cloud & Software Engineering Statement of Work (SOW)',
      category: 'Statement of Work (SOW)',
      usageCount: 28,
      variables: [
        { key: 'clientName', label: 'Client Company', required: true },
        { key: 'projectScope', label: 'Scope Description', required: true },
        { key: 'sowAmount', label: 'Milestone Budget', required: true },
      ],
      updatedAt: '2026-10-15',
    },
    {
      id: 'tpl_nda_03',
      title: 'Mutual Non-Disclosure Agreement (Mutual NDA)',
      category: 'Legal & Compliance',
      usageCount: 89,
      variables: [
        { key: 'disclosingParty', label: 'Disclosing Party', required: true },
        { key: 'receivingParty', label: 'Receiving Party', required: true },
        { key: 'termYears', label: 'Duration (Years)', required: true },
      ],
      updatedAt: '2026-10-12',
    },
    {
      id: 'tpl_prop_04',
      title: 'Commercial SaaS Sales Proposal & Quote',
      category: 'Proposals',
      usageCount: 65,
      variables: [
        { key: 'prospectName', label: 'Prospect Company', required: true },
        { key: 'annualContractValue', label: 'Annual Contract Value', required: true },
        { key: 'userSeats', label: 'Licensed Seats', required: true },
      ],
      updatedAt: '2026-10-10',
    },
  ]);

  const categories = [
    'All',
    'Contracts',
    'Statement of Work (SOW)',
    'Legal & Compliance',
    'Proposals',
  ];

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Handle Create Blank Document
  const handleCreateBlank = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingBlank(true);
    // Redirect to the editor with newly generated or draft document
    setTimeout(() => {
      setIsCreatingBlank(false);
      router.push('/documents/new/edit');
    }, 400);
  };

  // Open Template Modal
  const handleOpenTemplateModal = (template: TemplateItem) => {
    setSelectedTemplate(template);
    setDocTitle(`${template.title} - ${new Date().toLocaleDateString()}`);
    const initVars: Record<string, string> = {};
    template.variables.forEach((v) => {
      initVars[v.key] = '';
    });
    setVariableInputs(initVars);
    setShowUseModal(true);
  };

  // Handle Create from Template (Adhering to RULE SIG-006: copy-on-create, never live link)
  const handleCreateFromTemplate = async () => {
    if (!docTitle.trim()) {
      setErrorMessage('Please enter a valid document title.');
      return;
    }

    setIsCreatingFromTemplate(true);
    setErrorMessage(null);

    try {
      // In production calls POST /api/v1/templates/:id/documents
      await new Promise((r) => setTimeout(r, 600));
      setIsCreatingFromTemplate(false);
      setShowUseModal(false);
      setSuccessMessage('Document created successfully from template.');

      // Route to document edit page
      setTimeout(() => {
        router.push('/documents/new/edit');
      }, 700);
    } catch {
      setIsCreatingFromTemplate(false);
      setErrorMessage('Failed to create document from template.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '80px' }}>
      {/* Top Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--color-gray-200)',
          marginBottom: '24px',
        }}
      >
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
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
            Create New Document
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
            Choose how you would like to initiate your new contract, proposal, or agreement.
          </p>
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMessage && (
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
            color: '#166534',
            fontSize: '13px',
          }}
        >
          <CheckCircle size={16} color="#16A34A" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
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
            color: '#991B1B',
            fontSize: '13px',
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mode Switch Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--color-gray-200)',
          marginBottom: '24px',
        }}
      >
        <button
          onClick={() => setActiveTab('blank')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom:
              activeTab === 'blank' ? '2px solid var(--color-primary)' : '2px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'blank' ? 600 : 500,
            color: activeTab === 'blank' ? 'var(--color-primary)' : 'var(--color-gray-600)',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={16} />
          Start Blank
        </button>

        <button
          onClick={() => setActiveTab('template')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderBottom:
              activeTab === 'template' ? '2px solid var(--color-primary)' : '2px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'template' ? 600 : 500,
            color: activeTab === 'template' ? 'var(--color-primary)' : 'var(--color-gray-600)',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Copy size={16} />
          From Template
          <span
            style={{
              fontSize: '11px',
              backgroundColor:
                activeTab === 'template'
                  ? 'var(--color-primary-light, #EFF6FF)'
                  : 'var(--color-gray-100)',
              color: activeTab === 'template' ? 'var(--color-primary)' : 'var(--color-gray-700)',
              padding: '1px 6px',
              borderRadius: '10px',
              fontWeight: 600,
            }}
          >
            {templates.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Blank Document */}
      {activeTab === 'blank' && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid var(--color-gray-200)',
            borderRadius: '8px',
            padding: '32px',
            maxWidth: '640px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-950)',
              marginBottom: '4px',
            }}
          >
            Blank Document Details
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '24px' }}>
            Start with a fresh editor canvas and add clauses, pricing tables, or signatures as
            needed.
          </p>

          <form
            onSubmit={handleCreateBlank}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
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
                Document Title
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Statement of Work 2026"
                value={blankTitle}
                onChange={(e) => setBlankTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
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
                  marginBottom: '6px',
                }}
              >
                Primary Recipient Email (Optional)
              </label>
              <input
                type="email"
                placeholder="signatory@client.com"
                value={blankRecipient}
                onChange={(e) => setBlankRecipient(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <button
                type="submit"
                disabled={isCreatingBlank}
                className="pact-btn pact-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                {isCreatingBlank ? 'Creating Draft...' : 'Open Editor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: From Template (Sprint 1 Required Interface) */}
      {activeTab === 'template' && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              gap: '16px',
            }}
          >
            {/* Category Pills */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor:
                      selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-gray-300)',
                    backgroundColor: selectedCategory === cat ? 'var(--color-primary)' : '#fff',
                    color: selectedCategory === cat ? '#fff' : 'var(--color-gray-700)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', width: '280px', flexShrink: 0 }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '10px',
                  color: 'var(--color-gray-400)',
                }}
              />
              <input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '13px',
                  outline: 'none',
                  backgroundColor: '#fff',
                }}
              />
            </div>
          </div>

          {/* Tabular List (Design System Rule: Real HTML tables for template and document lists) */}
          <div className="pact-table-container">
            {filteredTemplates.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '20px',
                    backgroundColor: 'var(--color-gray-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-gray-500)',
                  }}
                >
                  <Copy size={20} />
                </div>
                <div>
                  <div
                    style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-gray-900)' }}
                  >
                    No templates matched your query
                  </div>
                  <div
                    style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}
                  >
                    Try searching for another keyword or switch category filter.
                  </div>
                </div>
              </div>
            ) : (
              <table className="pact-table">
                <thead>
                  <tr>
                    <th>Template Title</th>
                    <th>Category</th>
                    <th>Variables</th>
                    <th>Usage</th>
                    <th>Last Updated</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500, color: 'var(--color-gray-950)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Copy size={15} color="var(--color-primary)" />
                          <span>{item.title}</span>
                        </div>
                      </td>
                      <td>
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
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                          {item.variables.length} fields
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--color-gray-700)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.usageCount} docs
                        </span>
                      </td>
                      <td style={{ color: 'var(--color-gray-500)', fontSize: '13px' }}>
                        {item.updatedAt}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenTemplateModal(item)}
                          className="pact-btn pact-btn-primary"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Use Template
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Use Template Modal: Variable merge & document generation (RULE SIG-006: copy-on-create) */}
      {showUseModal && selectedTemplate && (
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
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <FilePlus size={20} color="var(--color-primary)" />
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                Generate Document from Template
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginBottom: '16px' }}>
              Selected template: <strong>{selectedTemplate.title}</strong>
              <br />
              <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                Per RULE SIG-006, this creates a standalone document version snapshot.
              </span>
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

              {selectedTemplate.variables.length > 0 && (
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
                    {selectedTemplate.variables.map((vf) => (
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
                          type="text"
                          placeholder={`Enter value for {{${vf.key}}}`}
                          value={variableInputs[vf.key] || ''}
                          onChange={(e) =>
                            setVariableInputs((prev) => ({
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
                onClick={() => setShowUseModal(false)}
                className="pact-btn pact-btn-secondary"
                disabled={isCreatingFromTemplate}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFromTemplate}
                className="pact-btn pact-btn-primary"
                disabled={isCreatingFromTemplate}
              >
                {isCreatingFromTemplate ? 'Generating...' : 'Create Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
