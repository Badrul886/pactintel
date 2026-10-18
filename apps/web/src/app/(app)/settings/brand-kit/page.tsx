'use client';

import React, { useState, useEffect } from 'react';
import { Palette, Check, Plus, Trash2, Edit2, Upload, AlertCircle, Shield } from 'lucide-react';
import { BrandKitResponseDto } from '@pactintel/shared-types';

export default function BrandKitSettingsPage() {
  const [brandKits, setBrandKits] = useState<BrandKitResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    primaryColor: '#2563EB',
    secondaryColor: '#475569',
    accentColor: '#3B82F6',
    logoUrl: '',
    fontHeading: 'Inter, sans-serif',
    fontBody: 'Inter, sans-serif',
    customCss: '',
    emailFromName: '',
    emailFromDomain: '',
    removeBadge: false,
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const loadBrandKits = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch(`${apiBase}/api/v1/brand-kits`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setBrandKits(json.data || json || []);
      } else {
        const err = await res.json().catch(() => null);
        setErrorMessage(err?.error?.message || 'Failed to load brand kits');
      }
    } catch {
      setErrorMessage('Network connection error when loading brand kits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrandKits();
  }, [apiBase]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      name: '',
      primaryColor: '#2563EB',
      secondaryColor: '#475569',
      accentColor: '#3B82F6',
      logoUrl: '',
      fontHeading: 'Inter, sans-serif',
      fontBody: 'Inter, sans-serif',
      customCss: '',
      emailFromName: '',
      emailFromDomain: '',
      removeBadge: false,
      isDefault: brandKits.length === 0,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (kit: BrandKitResponseDto) => {
    setEditingId(kit.id);
    setFormData({
      name: kit.name,
      primaryColor: kit.primaryColor || '#2563EB',
      secondaryColor: kit.secondaryColor || '#475569',
      accentColor: kit.accentColor || '#3B82F6',
      logoUrl: kit.logoUrl || '',
      fontHeading: kit.fontHeading || 'Inter, sans-serif',
      fontBody: kit.fontBody || 'Inter, sans-serif',
      customCss: kit.customCss || '',
      emailFromName: kit.emailFromName || '',
      emailFromDomain: kit.emailFromDomain || '',
      removeBadge: kit.removeBadge,
      isDefault: kit.isDefault,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    try {
      const url = editingId
        ? `${apiBase}/api/v1/brand-kits/${editingId}`
        : `${apiBase}/api/v1/brand-kits`;
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setSuccessMessage(
          editingId ? 'Brand kit updated successfully.' : 'Brand kit created successfully.',
        );
        setTimeout(() => setSuccessMessage(null), 4000);
        await loadBrandKits();
      } else {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.error?.message || 'Failed to save brand kit.');
      }
    } catch {
      setErrorMessage('Network error while saving brand kit.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/brand-kits/${id}/set-default`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setSuccessMessage('Default brand kit updated.');
        setTimeout(() => setSuccessMessage(null), 4000);
        await loadBrandKits();
      } else {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.error?.message || 'Failed to set default brand kit.');
      }
    } catch {
      setErrorMessage('Network error while setting default brand kit.');
    }
  };

  const handleDelete = async (kit: BrandKitResponseDto) => {
    if (kit.isDefault) {
      setErrorMessage(
        'Cannot delete the default brand kit. Please set another brand kit as default first.',
      );
      return;
    }

    if (!window.confirm(`Are you sure you want to delete brand kit "${kit.name}"?`)) {
      return;
    }

    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/brand-kits/${kit.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setSuccessMessage('Brand kit deleted.');
        setTimeout(() => setSuccessMessage(null), 4000);
        await loadBrandKits();
      } else {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.error?.message || 'Failed to delete brand kit.');
      }
    } catch {
      setErrorMessage('Network error while deleting brand kit.');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, kitId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const res = await fetch(`${apiBase}/api/v1/brand-kits/${kitId}/upload-logo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename: file.name,
            fileBase64: base64,
          }),
        });
        if (res.ok) {
          setSuccessMessage('Logo uploaded successfully.');
          setTimeout(() => setSuccessMessage(null), 4000);
          await loadBrandKits();
        } else {
          const err = await res.json().catch(() => null);
          setErrorMessage(err?.error?.message || 'Failed to upload logo.');
        }
      } catch {
        setErrorMessage('Failed to upload logo due to network error.');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Palette size={22} color="#2563EB" />
            Brand Kits
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            Customize recipient signing portals, email notifications, and document themes with your
            brand colors and logos.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            backgroundColor: '#2563EB',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <Plus size={16} />
          Create Brand Kit
        </button>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            borderRadius: '6px',
            padding: '12px 16px',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #86EFAC',
            color: '#15803D',
            borderRadius: '6px',
            padding: '12px 16px',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={16} />
          {successMessage}
        </div>
      )}

      {/* Brand Kits Table / List */}
      {loading ? (
        <div
          style={{
            padding: '60px 0',
            textAlign: 'center',
            fontSize: '14px',
            color: '#64748B',
          }}
        >
          Loading brand kits...
        </div>
      ) : brandKits.length === 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px dashed #CBD5E1',
            borderRadius: '8px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <Palette size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
            No brand kits configured
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
            Create your first brand kit to personalize recipient document reviews and signature
            pages.
          </p>
          <button
            onClick={handleOpenCreate}
            style={{
              backgroundColor: '#2563EB',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Create Brand Kit
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Brand Kit
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Palette
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Typography
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Branding Badge
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475569',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {brandKits.map((kit) => (
                <tr
                  key={kit.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: kit.isDefault ? '#F8FAFC' : '#ffffff',
                  }}
                >
                  {/* Name & Logo */}
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {kit.logoUrl ? (
                        <img
                          src={kit.logoUrl}
                          alt={kit.name}
                          style={{
                            width: '36px',
                            height: '36px',
                            objectFit: 'contain',
                            borderRadius: '4px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#fff',
                            padding: '2px',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '4px',
                            backgroundColor: kit.primaryColor || '#2563EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '14px',
                          }}
                        >
                          {kit.name.substring(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                            {kit.name}
                          </span>
                          {kit.isDefault && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: '#EFF6FF',
                                color: '#2563EB',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid #BFDBFE',
                              }}
                            >
                              Default
                            </span>
                          )}
                        </div>
                        {kit.emailFromName && (
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                            Sender: {kit.emailFromName}
                            {kit.emailFromDomain ? ` <noreply@${kit.emailFromDomain}>` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Colors */}
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        title={`Primary: ${kit.primaryColor || '#2563EB'}`}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          backgroundColor: kit.primaryColor || '#2563EB',
                          border: '1px solid rgba(0,0,0,0.1)',
                        }}
                      />
                      {kit.secondaryColor && (
                        <div
                          title={`Secondary: ${kit.secondaryColor}`}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: kit.secondaryColor,
                            border: '1px solid rgba(0,0,0,0.1)',
                          }}
                        />
                      )}
                      {kit.accentColor && (
                        <div
                          title={`Accent: ${kit.accentColor}`}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            backgroundColor: kit.accentColor,
                            border: '1px solid rgba(0,0,0,0.1)',
                          }}
                        />
                      )}
                      <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '4px' }}>
                        {kit.primaryColor || '#2563EB'}
                      </span>
                    </div>
                  </td>

                  {/* Fonts */}
                  <td style={{ padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#334155' }}>
                      <div>H: {kit.fontHeading?.split(',')[0] || 'Inter'}</div>
                      <div style={{ color: '#64748B' }}>
                        B: {kit.fontBody?.split(',')[0] || 'Inter'}
                      </div>
                    </div>
                  </td>

                  {/* Badge */}
                  <td style={{ padding: '16px' }}>
                    {kit.removeBadge ? (
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#059669',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Shield size={13} />
                        White-labeled
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Standard Badge</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      {!kit.isDefault && (
                        <button
                          onClick={() => handleSetDefault(kit.id)}
                          style={{
                            background: 'none',
                            border: '1px solid #CBD5E1',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            color: '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Make Default
                        </button>
                      )}

                      {/* Upload Logo trigger */}
                      <label
                        style={{
                          background: 'none',
                          border: '1px solid #CBD5E1',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          color: '#334155',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Upload Logo"
                      >
                        <Upload size={13} />
                        Logo
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => handleLogoUpload(e, kit.id)}
                        />
                      </label>

                      <button
                        onClick={() => handleOpenEdit(kit)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#475569',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                        title="Edit"
                      >
                        <Edit2 size={15} />
                      </button>

                      <button
                        onClick={() => handleDelete(kit)}
                        disabled={kit.isDefault}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: kit.isDefault ? '#CBD5E1' : '#EF4444',
                          cursor: kit.isDefault ? 'not-allowed' : 'pointer',
                          padding: '4px',
                        }}
                        title={kit.isDefault ? 'Cannot delete default brand kit' : 'Delete'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal (Floating Popover Pattern) */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              padding: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '12px',
              }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#0F172A' }}>
                {editingId ? 'Edit Brand Kit' : 'New Brand Kit'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: '#64748B',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSave}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: '4px',
                  }}
                >
                  Brand Kit Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Enterprise Client Brand"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Color Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Primary Color *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      pattern="^#[0-9a-fA-F]{6}$"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Secondary Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="color"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Accent Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="color"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Logo URL */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: '4px',
                  }}
                >
                  Logo Public URL
                </label>
                <input
                  type="url"
                  placeholder="https://storage.googleapis.com/.../logo.svg"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Typography */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Heading Font
                  </label>
                  <select
                    value={formData.fontHeading}
                    onChange={(e) => setFormData({ ...formData, fontHeading: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  >
                    <option value="Inter, sans-serif">Inter (Default)</option>
                    <option value="Roboto, sans-serif">Roboto</option>
                    <option value="Playfair Display, serif">Playfair Display (Serif)</option>
                    <option value="Outfit, sans-serif">Outfit</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Body Font
                  </label>
                  <select
                    value={formData.fontBody}
                    onChange={(e) => setFormData({ ...formData, fontBody: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  >
                    <option value="Inter, sans-serif">Inter (Default)</option>
                    <option value="Roboto, sans-serif">Roboto</option>
                    <option value="Outfit, sans-serif">Outfit</option>
                  </select>
                </div>
              </div>

              {/* Email Sender Configuration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Email Sender Name
                  </label>
                  <input
                    type="text"
                    placeholder="Acme Legal Team"
                    value={formData.emailFromName}
                    onChange={(e) => setFormData({ ...formData, emailFromName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#334155',
                      marginBottom: '4px',
                    }}
                  >
                    Email Custom Domain
                  </label>
                  <input
                    type="text"
                    placeholder="contracts.acme.com"
                    value={formData.emailFromDomain}
                    onChange={(e) => setFormData({ ...formData, emailFromDomain: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              {/* Custom CSS */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#334155',
                    marginBottom: '4px',
                  }}
                >
                  Custom CSS Overrides (Max 50,000 characters)
                </label>
                <textarea
                  rows={3}
                  placeholder=":root { /* Custom CSS rules */ }"
                  value={formData.customCss}
                  onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              {/* Toggles */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.removeBadge}
                    onChange={(e) => setFormData({ ...formData, removeBadge: e.target.checked })}
                  />
                  <span>Remove &quot;Powered by PactIntel&quot; watermark from recipient view</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                  <span>Set as default brand kit for organization</span>
                </label>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#fff',
                    color: '#475569',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : editingId ? 'Update Kit' : 'Create Kit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
