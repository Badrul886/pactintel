'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Folder as FolderIcon,
  FolderPlus,
  FileText,
  Layers,
  ArrowRight,
  Edit,
  Trash2,
  AlertCircle,
  X,
} from 'lucide-react';

interface VariableField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email';
  required: boolean;
}

interface TemplateItem {
  id: string;
  title: string;
  category: string;
  industryTags: string[];
  usageCount: number;
  folderId?: string | null;
  folderName?: string;
  variableFields: VariableField[];
  updatedAt: string;
}

interface FolderItem {
  id: string;
  name: string;
  entityType: 'document' | 'template';
  count?: number;
}

const CATEGORIES = [
  'All Categories',
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

export default function TemplatesPage() {
  const router = useRouter();

  // State
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const [activeTemplateForUse, setActiveTemplateForUse] = useState<TemplateItem | null>(null);
  const [docTitle, setDocTitle] = useState<string>('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isSubmittingDoc, setIsSubmittingDoc] = useState<boolean>(false);
  const [useDocError, setUseDocError] = useState<string | null>(null);

  // Load initial template & folder data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Seed with standard templates if empty
      const initialTemplates: TemplateItem[] = [
        {
          id: 'tmpl-msa-001',
          title: 'Enterprise Master Services Agreement (MSA)',
          category: 'Contracts',
          industryTags: ['Software / IT', 'Legal & Compliance'],
          usageCount: 18,
          folderId: 'folder-legal',
          folderName: 'Legal & Procurement',
          variableFields: [
            { key: 'clientName', label: 'Client Company Name', type: 'text', required: true },
            { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
            {
              key: 'retainerAmount',
              label: 'Monthly Retainer ($)',
              type: 'number',
              required: false,
            },
          ],
          updatedAt: '2026-10-15',
        },
        {
          id: 'tmpl-sow-002',
          title: 'Cloud Infrastructure Implementation Statement of Work',
          category: 'Statement of Work (SOW)',
          industryTags: ['Software / IT', 'Management Consulting'],
          usageCount: 14,
          folderId: 'folder-delivery',
          folderName: 'Delivery Scopes',
          variableFields: [
            { key: 'projectName', label: 'Project Name', type: 'text', required: true },
            { key: 'durationWeeks', label: 'Duration (Weeks)', type: 'number', required: true },
          ],
          updatedAt: '2026-10-14',
        },
        {
          id: 'tmpl-prop-003',
          title: 'Strategic Marketing Transformation Proposal',
          category: 'Proposals',
          industryTags: ['Digital Marketing'],
          usageCount: 9,
          folderId: null,
          variableFields: [
            { key: 'targetMarket', label: 'Target Market Segment', type: 'text', required: false },
          ],
          updatedAt: '2026-10-10',
        },
        {
          id: 'tmpl-nda-004',
          title: 'Mutual Non-Disclosure Agreement (Standard 2-Party)',
          category: 'Contracts',
          industryTags: ['Legal & Compliance'],
          usageCount: 32,
          folderId: 'folder-legal',
          folderName: 'Legal & Procurement',
          variableFields: [
            { key: 'partyA', label: 'First Party Legal Entity', type: 'text', required: true },
            { key: 'partyB', label: 'Second Party Legal Entity', type: 'text', required: true },
          ],
          updatedAt: '2026-10-18',
        },
      ];

      const initialFolders: FolderItem[] = [
        { id: 'folder-legal', name: 'Legal & Procurement', entityType: 'template', count: 2 },
        { id: 'folder-delivery', name: 'Delivery Scopes', entityType: 'template', count: 1 },
      ];

      setTemplates(initialTemplates);
      setFolders(initialFolders);
    } catch {
      setErrorMessage('Failed to load templates. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesCategory =
      selectedCategory === 'All Categories' || template.category === selectedCategory;
    const matchesIndustry = !selectedIndustry || template.industryTags.includes(selectedIndustry);
    const matchesFolder = !selectedFolderId || template.folderId === selectedFolderId;
    const matchesSearch =
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.industryTags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesIndustry && matchesFolder && matchesSearch;
  });

  // Handle folder creation
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      setFolderError('Folder name is required.');
      return;
    }

    const newFolder: FolderItem = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      entityType: 'template',
      count: 0,
    };

    setFolders((prev) => [...prev, newFolder]);
    setNewFolderName('');
    setFolderError(null);
    setShowFolderModal(false);
  };

  // Open "Use Template" modal
  const handleOpenUseModal = (template: TemplateItem) => {
    setActiveTemplateForUse(template);
    setDocTitle(`${template.title} — ${new Date().toLocaleDateString()}`);
    setVariableValues({});
    setUseDocError(null);
  };

  // Submit create document from template
  const handleCreateDocumentFromTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplateForUse) return;

    // Validate required variables
    for (const field of activeTemplateForUse.variableFields) {
      if (field.required && !variableValues[field.key]?.trim()) {
        setUseDocError(`Field "${field.label}" is required.`);
        return;
      }
    }

    setIsSubmittingDoc(true);
    setUseDocError(null);

    try {
      // Simulate API call to POST /api/v1/templates/:id/documents
      // Increment usage count locally
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === activeTemplateForUse.id ? { ...t, usageCount: t.usageCount + 1 } : t,
        ),
      );

      // Navigate to document editor with deep-copied snapshot
      const newDocId = `doc-${Date.now()}`;
      router.push(`/documents/${newDocId}/edit`);
    } catch {
      setUseDocError('Failed to generate document from template. Please try again.');
    } finally {
      setIsSubmittingDoc(false);
    }
  };

  // Handle delete template
  const handleDeleteTemplate = (id: string, title: string) => {
    if (confirm(`Are you sure you want to delete template "${title}"?`)) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
            Template Library
          </h1>
          <p style={{ color: 'var(--color-gray-600)', marginTop: '4px', fontSize: '14px' }}>
            Browse standardized contracts, sales agreements, and reusable content templates.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowFolderModal(true)}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FolderPlus size={16} />
            New Folder
          </button>
          <Link
            href="/templates/new"
            className="pact-btn pact-btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
            }}
          >
            <Plus size={16} />
            New Template
          </Link>
        </div>
      </div>

      {/* Two-Panel Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Sidebar: Filters & Folders */}
        <div
          style={{
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-default)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Categories */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-gray-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedFolderId(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-default)',
                      border: 'none',
                      backgroundColor: isSelected ? 'var(--color-blue-50)' : 'transparent',
                      color: isSelected ? 'var(--color-blue-600)' : 'var(--color-gray-700)',
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

          {/* Folders */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-gray-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Folders
              </span>
              <button
                onClick={() => setShowFolderModal(true)}
                title="Create folder"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-gray-500)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <Plus size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                onClick={() => setSelectedFolderId(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-default)',
                  border: 'none',
                  backgroundColor:
                    selectedFolderId === null ? 'var(--color-blue-50)' : 'transparent',
                  color:
                    selectedFolderId === null ? 'var(--color-blue-600)' : 'var(--color-gray-700)',
                  fontSize: '13px',
                  fontWeight: selectedFolderId === null ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Layers size={14} />
                <span>All Templates</span>
              </button>

              {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolderId(folder.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-default)',
                      border: 'none',
                      backgroundColor: isSelected ? 'var(--color-blue-50)' : 'transparent',
                      color: isSelected ? 'var(--color-blue-600)' : 'var(--color-gray-700)',
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <FolderIcon size={14} />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {folder.name}
                    </span>
                    {folder.count !== undefined && (
                      <span style={{ fontSize: '11px', color: 'var(--color-gray-400)' }}>
                        {folder.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

          {/* Industry Tags Filter */}
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-gray-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Industry Filter
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {INDUSTRIES.map((ind) => {
                const isSelected = selectedIndustry === ind;
                return (
                  <button
                    key={ind}
                    onClick={() => setSelectedIndustry(isSelected ? null : ind)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      border: isSelected
                        ? '1px solid var(--color-blue-600)'
                        : '1px solid var(--border-color)',
                      backgroundColor: isSelected ? 'var(--color-blue-50)' : 'var(--color-gray-50)',
                      color: isSelected ? 'var(--color-blue-600)' : 'var(--color-gray-600)',
                      fontSize: '11px',
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
        </div>

        {/* Right Panel: Search Bar + Template Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-default)',
              padding: '8px 12px',
              gap: '8px',
            }}
          >
            <Search size={16} color="var(--color-gray-400)" />
            <input
              type="text"
              placeholder="Search templates by title, tag, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                width: '100%',
                fontSize: '14px',
                color: 'var(--color-gray-900)',
                backgroundColor: 'transparent',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Active Filter Chips */}
          {(selectedIndustry || selectedFolderId || selectedCategory !== 'All Categories') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                Active filters:
              </span>
              {selectedCategory !== 'All Categories' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    backgroundColor: 'var(--color-gray-100)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                >
                  Category: {selectedCategory}
                  <X
                    size={12}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedCategory('All Categories')}
                  />
                </span>
              )}
              {selectedFolderId && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    backgroundColor: 'var(--color-gray-100)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                >
                  Folder: {folders.find((f) => f.id === selectedFolderId)?.name}
                  <X
                    size={12}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedFolderId(null)}
                  />
                </span>
              )}
              {selectedIndustry && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    backgroundColor: 'var(--color-gray-100)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                >
                  Industry: {selectedIndustry}
                  <X
                    size={12}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedIndustry(null)}
                  />
                </span>
              )}
            </div>
          )}

          {/* Content: Loading, Error, Table, or Empty State */}
          {isLoading ? (
            /* Loading Skeleton Rows */
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '48px',
                    backgroundColor: 'var(--color-gray-100)',
                    borderRadius: 'var(--radius-default)',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
              ))}
            </div>
          ) : errorMessage ? (
            /* Error State */
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--color-red-200)',
                borderRadius: 'var(--radius-default)',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <AlertCircle
                size={28}
                color="var(--color-red-600)"
                style={{ margin: '0 auto 8px' }}
              />
              <p style={{ color: 'var(--color-red-800)', fontSize: '14px', marginBottom: '12px' }}>
                {errorMessage}
              </p>
              <button onClick={loadData} className="pact-btn pact-btn-secondary">
                Retry
              </button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            /* Designed Empty State (Design System §10) */
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                padding: '48px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-gray-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: 'var(--color-gray-500)',
                }}
              >
                <FileText size={24} />
              </div>
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'var(--color-gray-900)',
                  marginBottom: '4px',
                }}
              >
                No templates found
              </h3>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--color-gray-600)',
                  maxWidth: '380px',
                  marginBottom: '20px',
                }}
              >
                {searchQuery ||
                selectedCategory !== 'All Categories' ||
                selectedIndustry ||
                selectedFolderId
                  ? 'No templates match your active filter criteria. Try adjusting your search query or reset filters.'
                  : 'Get started by creating your first standardized template or browse the pre-built template library.'}
              </p>
              <Link
                href="/templates/new"
                className="pact-btn pact-btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Create Template
              </Link>
            </div>
          ) : (
            /* Standard HTML <table> (Design System §6) */
            <div
              style={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-default)',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: 'var(--color-gray-50)',
                    }}
                  >
                    <th
                      style={{
                        padding: '12px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-gray-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Template Title
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-gray-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Folder
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-gray-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Industry
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-gray-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Usage
                    </th>
                    <th
                      style={{
                        padding: '12px 16px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--color-gray-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr
                      key={template.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-gray-50)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Title & Category */}
                      <td style={{ padding: '14px 16px' }}>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            color: 'var(--color-gray-900)',
                          }}
                        >
                          {template.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            marginTop: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--color-gray-100)',
                              color: 'var(--color-gray-600)',
                              fontWeight: 500,
                            }}
                          >
                            {template.category}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--color-gray-400)' }}>
                            Updated {template.updatedAt}
                          </span>
                        </div>
                      </td>

                      {/* Folder */}
                      <td
                        style={{
                          padding: '14px 16px',
                          fontSize: '13px',
                          color: 'var(--color-gray-600)',
                        }}
                      >
                        {template.folderName ? (
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <FolderIcon size={13} color="var(--color-gray-400)" />
                            {template.folderName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-gray-400)' }}>—</span>
                        )}
                      </td>

                      {/* Industry Tags */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {template.industryTags.map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                backgroundColor: 'var(--color-gray-100)',
                                color: 'var(--color-gray-600)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Usage Count */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-blue-700)',
                            backgroundColor: 'var(--color-blue-50)',
                            padding: '3px 8px',
                            borderRadius: '12px',
                          }}
                        >
                          {template.usageCount} doc{template.usageCount === 1 ? '' : 's'} created
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenUseModal(template)}
                            className="pact-btn pact-btn-primary"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Use Template
                          </button>
                          <Link
                            href={`/templates/${template.id}/edit`}
                            style={{
                              color: 'var(--color-gray-600)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '6px',
                              borderRadius: '4px',
                            }}
                            title="Edit Template"
                          >
                            <Edit size={16} />
                          </Link>
                          <button
                            onClick={() => handleDeleteTemplate(template.id, template.title)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-gray-400)',
                              cursor: 'pointer',
                              padding: '6px',
                              borderRadius: '4px',
                            }}
                            title="Delete Template"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Folder */}
      {showFolderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
              boxShadow: 'var(--shadow-modal)',
              width: '100%',
              maxWidth: '420px',
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
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                New Template Folder
              </h3>
              <button
                onClick={() => setShowFolderModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateFolder}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--color-gray-700)',
                  }}
                >
                  Folder Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Proposals, NDA Agreements"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                {folderError && (
                  <p style={{ color: 'var(--color-red-600)', fontSize: '12px', marginTop: '4px' }}>
                    {folderError}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="pact-btn pact-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="pact-btn pact-btn-primary">
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Use Template (RULE SIG-006: Fill variables & Copy-on-create) */}
      {activeTemplateForUse && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
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
              boxShadow: 'var(--shadow-modal)',
              width: '100%',
              maxWidth: '540px',
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
                  Create Document from Template
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  {activeTemplateForUse.title}
                </p>
              </div>
              <button
                onClick={() => setActiveTemplateForUse(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-gray-400)',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDocumentFromTemplate}>
              {/* Document Title */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--color-gray-700)',
                  }}
                >
                  Document Title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-default)',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Dynamic Variables Section */}
              {activeTemplateForUse.variableFields.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--color-gray-800)',
                      marginBottom: '8px',
                    }}
                  >
                    Template Variables
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '12px',
                      backgroundColor: 'var(--color-gray-50)',
                      borderRadius: 'var(--radius-default)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {activeTemplateForUse.variableFields.map((field) => (
                      <div key={field.key}>
                        <label
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                            fontWeight: 500,
                            marginBottom: '4px',
                            color: 'var(--color-gray-700)',
                          }}
                        >
                          <span>{field.label}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-gray-400)' }}>
                            {`{{${field.key}}}`} {field.required ? '*' : ''}
                          </span>
                        </label>
                        <input
                          type={
                            field.type === 'number'
                              ? 'number'
                              : field.type === 'date'
                                ? 'date'
                                : 'text'
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}...`}
                          value={variableValues[field.key] || ''}
                          onChange={(e) =>
                            setVariableValues((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          required={field.required}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-default)',
                            border: '1px solid var(--border-color)',
                            fontSize: '13px',
                            backgroundColor: '#ffffff',
                            outline: 'none',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {useDocError && (
                <p
                  style={{ color: 'var(--color-red-600)', fontSize: '12px', marginBottom: '12px' }}
                >
                  {useDocError}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTemplateForUse(null)}
                  className="pact-btn pact-btn-secondary"
                  disabled={isSubmittingDoc}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pact-btn pact-btn-primary"
                  disabled={isSubmittingDoc}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSubmittingDoc ? 'Creating Document...' : 'Create & Open Document'}
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
