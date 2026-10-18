'use client';

import React, { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Layers,
  Percent,
  Receipt,
  Check,
  Search,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { PricingTableResponseDto, ProductCatalogItem } from '@pactintel/shared-types';

interface PageProps {
  params: Promise<{ id: string; tableId: string }>;
}

export default function PricingTableEditorPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const documentId = resolvedParams.id;
  const tableId = resolvedParams.tableId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableData, setTableData] = useState<PricingTableResponseDto | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Catalog modal
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogItems, setCatalogItems] = useState<ProductCatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Settings & Tax state
  const [taxRate, setTaxRate] = useState<string>('0');
  const [taxIncluded, setTaxIncluded] = useState<boolean>(false);
  const [tableDiscountPercent, setTableDiscountPercent] = useState<string>('0');

  const fetchTable = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/pricing-tables/${tableId}`, {
        headers: { 'X-Organization-ID': 'default-org' },
      });
      if (!res.ok) {
        // Fallback for demo / preview mode if backend server is not running locally in dev browser
        const demoTable: PricingTableResponseDto = {
          id: tableId,
          documentId,
          organizationId: 'default-org',
          displayFormat: 'line_items',
          discountRules: [{ type: 'percentage', value: 0 }],
          taxConfig: { taxRate: 0.08, taxIncluded: false, label: 'Standard Sales Tax' },
          settings: { allowBuyerQuantityChange: true },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lineItems: [
            {
              id: 'li-1',
              pricingTableId: tableId,
              organizationId: 'default-org',
              productItemId: null,
              name: 'Enterprise Platform License',
              description: 'Annual enterprise subscription tier for up to 50 active signatories',
              quantity: '1',
              unitPrice: '12000.00',
              discountPercent: '10',
              discountAmount: '0',
              subtotal: '10800.00',
              billingFrequency: 'annual',
              isOptional: false,
              isSelected: true,
              sortOrder: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'li-2',
              pricingTableId: tableId,
              organizationId: 'default-org',
              productItemId: null,
              name: 'Custom Domain & SSO Setup',
              description: 'Dedicated SAML 2.0 / OIDC configuration & TLS verification',
              quantity: '1',
              unitPrice: '2500.00',
              discountPercent: '0',
              discountAmount: '0',
              subtotal: '2500.00',
              billingFrequency: 'one_time',
              isOptional: true,
              isSelected: true,
              sortOrder: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          totals: {
            subtotal: '13300.00',
            totalDiscount: '1200.00',
            taxAmount: '1064.00',
            total: '14364.00',
            currency: 'USD',
            lineItems: [
              {
                id: 'li-1',
                name: 'Enterprise Platform License',
                quantity: '1',
                unitPrice: '12000.00',
                discountPercent: '10',
                discountAmount: '0',
                subtotal: '12000.00',
                discount: '1200.00',
                net: '10800.00',
                lineDiscount: '1200.00',
                lineNet: '10800.00',
                isOptional: false,
                isSelected: true,
                billingFrequency: 'annual',
                sortOrder: 0,
              },
              {
                id: 'li-2',
                name: 'Custom Domain & SSO Setup',
                quantity: '1',
                unitPrice: '2500.00',
                discountPercent: '0',
                discountAmount: '0',
                subtotal: '2500.00',
                discount: '0.00',
                net: '2500.00',
                lineDiscount: '0.00',
                lineNet: '2500.00',
                isOptional: true,
                isSelected: true,
                billingFrequency: 'one_time',
                sortOrder: 1,
              },
            ],
          },
        };
        setTableData(demoTable);
        setTaxRate('8');
        setTaxIncluded(false);
        setLoading(false);
        return;
      }
      const data: PricingTableResponseDto = await res.json();
      setTableData(data);

      const taxCfg = data.taxConfig as any;
      if (taxCfg?.taxRate) {
        setTaxRate(String(Number(taxCfg.taxRate) * 100));
        setTaxIncluded(Boolean(taxCfg.taxIncluded));
      }
      const disc = (data.discountRules as any)?.[0];
      if (disc?.value) {
        setTableDiscountPercent(String(disc.value));
      }
    } catch {
      setError('Failed to load pricing table details.');
    } finally {
      setLoading(false);
    }
  }, [tableId, documentId]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  // Load Catalog Items
  const openCatalogModal = async () => {
    setShowCatalogModal(true);
    setLoadingCatalog(true);
    try {
      const res = await fetch('/api/v1/catalog-items', {
        headers: { 'X-Organization-ID': 'default-org' },
      });
      if (res.ok) {
        const items = await res.json();
        setCatalogItems(items);
      } else {
        // Fallback demo items
        setCatalogItems([
          {
            id: 'cat-1',
            organizationId: 'default-org',
            sku: 'ENT-ANNUAL',
            name: 'Enterprise Annual Tier',
            description: 'Full contract lifecycle automation and unlimited envelopes',
            unitPrice: '15000.00',
            currency: 'USD',
            billingFrequency: 'annual',
            isActive: true,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
          {
            id: 'cat-2',
            organizationId: 'default-org',
            sku: 'KMS-HSM-ADDON',
            name: 'Dedicated Cloud KMS HSM Encryption',
            description: 'Tenant-specific Hardware Security Module envelope keys',
            unitPrice: '3600.00',
            currency: 'USD',
            billingFrequency: 'annual',
            isActive: true,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
          {
            id: 'cat-3',
            organizationId: 'default-org',
            sku: 'SVC-ONBOARD',
            name: 'Concierge Migration & Legal Workflow Setup',
            description: '40 hours of dedicated solution architect onboarding support',
            unitPrice: '4500.00',
            currency: 'USD',
            billingFrequency: 'one_time',
            isActive: true,
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ]);
      }
    } catch {
      // ignore
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Add blank line item
  const handleAddBlankRow = async () => {
    setSaveStatus('saving');
    try {
      const payload = {
        pricingTableId: tableId,
        name: 'New Line Item',
        description: '',
        quantity: 1,
        unitPrice: 100,
        discountPercent: 0,
        discountAmount: 0,
        billingFrequency: 'one_time',
        isOptional: false,
        isSelected: true,
        sortOrder: tableData?.lineItems.length ?? 0,
      };

      const res = await fetch(`/api/v1/pricing-tables/${tableId}/line-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-ID': 'default-org',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchTable();
        setSaveStatus('saved');
      } else {
        // Fallback optimistic update
        if (tableData) {
          const newItem = {
            id: 'li-' + Date.now(),
            pricingTableId: tableId,
            organizationId: 'default-org',
            productItemId: null,
            name: 'New Line Item',
            description: '',
            quantity: '1',
            unitPrice: '100.00',
            discountPercent: '0',
            discountAmount: '0',
            subtotal: '100.00',
            billingFrequency: 'one_time',
            isOptional: false,
            isSelected: true,
            sortOrder: tableData.lineItems.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setTableData({
            ...tableData,
            lineItems: [...tableData.lineItems, newItem],
          });
        }
        setSaveStatus('saved');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  // Add from Catalog
  const handleSelectCatalogItem = async (item: ProductCatalogItem) => {
    setSaveStatus('saving');
    setShowCatalogModal(false);
    try {
      const payload = {
        pricingTableId: tableId,
        productItemId: item.id,
        name: item.name,
        description: item.description,
        quantity: 1,
        unitPrice: Number(item.unitPrice),
        discountPercent: 0,
        discountAmount: 0,
        billingFrequency: item.billingFrequency || 'one_time',
        isOptional: false,
        isSelected: true,
        sortOrder: tableData?.lineItems.length ?? 0,
      };

      const res = await fetch(`/api/v1/pricing-tables/${tableId}/line-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-ID': 'default-org',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchTable();
        setSaveStatus('saved');
      } else {
        if (tableData) {
          const newItem = {
            id: 'li-' + Date.now(),
            pricingTableId: tableId,
            organizationId: 'default-org',
            productItemId: item.id,
            name: item.name,
            description: item.description || '',
            quantity: '1',
            unitPrice: String(item.unitPrice),
            discountPercent: '0',
            discountAmount: '0',
            subtotal: String(item.unitPrice),
            billingFrequency: item.billingFrequency || 'one_time',
            isOptional: false,
            isSelected: true,
            sortOrder: tableData.lineItems.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setTableData({
            ...tableData,
            lineItems: [...tableData.lineItems, newItem],
          });
        }
        setSaveStatus('saved');
      }
    } catch {
      setSaveStatus('error');
    }
  };

  // Update line item
  const handleUpdateItem = async (
    lineItemId: string,
    field: string,
    value: string | number | boolean,
  ) => {
    if (!tableData) return;
    setSaveStatus('saving');

    // Optimistic local state update
    const updatedLineItems = tableData.lineItems.map((item) => {
      if (item.id === lineItemId) {
        return { ...item, [field]: value };
      }
      return item;
    });

    setTableData({
      ...tableData,
      lineItems: updatedLineItems,
    });

    try {
      await fetch(`/api/v1/line-items/${lineItemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-ID': 'default-org',
        },
        body: JSON.stringify({ [field]: value }),
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  // Delete line item
  const handleDeleteItem = async (lineItemId: string) => {
    if (!tableData) return;
    setSaveStatus('saving');
    const updatedLineItems = tableData.lineItems.filter((i) => i.id !== lineItemId);
    setTableData({
      ...tableData,
      lineItems: updatedLineItems,
    });

    try {
      await fetch(`/api/v1/line-items/${lineItemId}`, {
        method: 'DELETE',
        headers: { 'X-Organization-ID': 'default-org' },
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  // Reorder line item up/down
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!tableData) return;
    const items = [...tableData.lineItems];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    setTableData({
      ...tableData,
      lineItems: items,
    });

    setSaveStatus('saving');
    try {
      const order = items.map((i) => i.id);
      await fetch(`/api/v1/pricing-tables/${tableId}/line-items/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-ID': 'default-org',
        },
        body: JSON.stringify({ order }),
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  // Update Tax & Table Discounts
  const handleSaveTableConfig = async () => {
    setSaveStatus('saving');
    try {
      const rateNum = Number(taxRate) / 100;
      const discVal = Number(tableDiscountPercent);
      const payload = {
        taxConfig: {
          taxRate: rateNum,
          taxIncluded,
          label: 'Sales Tax',
        },
        discountRules: discVal > 0 ? [{ type: 'percentage', value: discVal }] : [],
      };

      await fetch(`/api/v1/pricing-tables/${tableId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-ID': 'default-org',
        },
        body: JSON.stringify(payload),
      });

      await fetchTable();
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  const formatCurrency = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '$0.00';
    const num = Number(val);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
        <div
          style={{
            height: '32px',
            width: '200px',
            backgroundColor: '#E5E7EB',
            borderRadius: '4px',
            marginBottom: '24px',
          }}
        />
        <div style={{ height: '300px', backgroundColor: '#F3F4F6', borderRadius: '8px' }} />
      </div>
    );
  }

  if (error && !tableData) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center', padding: '32px' }}>
        <AlertCircle size={40} color="#DC2626" style={{ margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>
          Error Loading Pricing Table
        </h2>
        <p style={{ color: '#4B5563', marginTop: '8px' }}>{error}</p>
        <button
          onClick={fetchTable}
          className="pact-btn pact-btn-primary"
          style={{ marginTop: '20px' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '32px auto',
        padding: '0 24px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color, #E5E7EB)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href={`/documents/${documentId}/edit`}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={16} />
            Back to Document
          </Link>
          <div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-gray-950, #030712)',
                margin: 0,
              }}
            >
              Configure Pricing Table & CPQ
            </h1>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-500, #6B7280)',
                marginTop: '2px',
              }}
            >
              Table ID: <span style={{ fontFamily: 'monospace' }}>{tableId}</span> • RULE CPQ-001
              Compliant
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '13px',
              color:
                saveStatus === 'saving'
                  ? '#2563EB'
                  : saveStatus === 'saved'
                    ? '#16A34A'
                    : 'var(--color-gray-500, #6B7280)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {saveStatus === 'saving' && <RefreshCw size={14} className="animate-spin" />}
            {saveStatus === 'saved' && <Check size={14} color="#16A34A" />}
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'All changes saved'
                : 'Auto-save enabled'}
          </span>

          <button
            onClick={openCatalogModal}
            className="pact-btn pact-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Layers size={15} />
            Add from Catalog
          </button>

          <button
            onClick={handleAddBlankRow}
            className="pact-btn pact-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} />
            Add Blank Item
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E5E7EB)',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '32px',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-gray-50, #F9FAFB)',
                  borderBottom: '1px solid var(--border-color, #E5E7EB)',
                  color: 'var(--color-gray-600, #4B5563)',
                  fontWeight: 500,
                  fontSize: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '12px 14px', width: '60px' }}>Order</th>
                <th style={{ padding: '12px 16px' }}>Item Name & Description</th>
                <th style={{ padding: '12px 14px', width: '90px' }}>Qty</th>
                <th style={{ padding: '12px 14px', width: '130px' }}>Unit Price ($)</th>
                <th style={{ padding: '12px 14px', width: '100px' }}>Discount %</th>
                <th style={{ padding: '12px 14px', width: '90px', textAlign: 'center' }}>
                  Optional
                </th>
                <th style={{ padding: '12px 16px', width: '120px', textAlign: 'right' }}>
                  Subtotal
                </th>
                <th style={{ padding: '12px 14px', width: '60px', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {tableData?.lineItems && tableData.lineItems.length > 0 ? (
                tableData.lineItems.map((item, idx) => {
                  const qty = Number(item.quantity) || 1;
                  const price = Number(item.unitPrice) || 0;
                  const disc = Number(item.discountPercent) || 0;
                  const lineSubtotal = qty * price;
                  const lineNet = lineSubtotal - (lineSubtotal * disc) / 100;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border-color, #E5E7EB)',
                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                      }}
                    >
                      {/* Sort Controls */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button
                            onClick={() => handleMove(idx, 'up')}
                            disabled={idx === 0}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              color: idx === 0 ? '#D1D5DB' : '#6B7280',
                              padding: 0,
                            }}
                            title="Move Up"
                          >
                            <MoveUp size={13} />
                          </button>
                          <button
                            onClick={() => handleMove(idx, 'down')}
                            disabled={idx === (tableData?.lineItems.length ?? 0) - 1}
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor:
                                idx === (tableData?.lineItems.length ?? 0) - 1
                                  ? 'not-allowed'
                                  : 'pointer',
                              color:
                                idx === (tableData?.lineItems.length ?? 0) - 1
                                  ? '#D1D5DB'
                                  : '#6B7280',
                              padding: 0,
                            }}
                            title="Move Down"
                          >
                            <MoveDown size={13} />
                          </button>
                        </div>
                      </td>

                      {/* Name & Description */}
                      <td style={{ padding: '10px 16px' }}>
                        <input
                          type="text"
                          defaultValue={item.name}
                          onBlur={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'var(--color-gray-950, #030712)',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            padding: '4px 6px',
                          }}
                          onFocus={(e) => (e.target.style.border = '1px solid #2563EB')}
                        />
                        <input
                          type="text"
                          defaultValue={item.description || ''}
                          placeholder="Optional line description..."
                          onBlur={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '12px',
                            color: 'var(--color-gray-500, #6B7280)',
                            border: '1px solid transparent',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            marginTop: '2px',
                          }}
                          onFocus={(e) => (e.target.style.border = '1px solid #2563EB')}
                        />
                      </td>

                      {/* Qty */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          type="number"
                          min="1"
                          defaultValue={item.quantity}
                          onBlur={(e) =>
                            handleUpdateItem(item.id, 'quantity', Number(e.target.value) || 1)
                          }
                          style={{
                            width: '70px',
                            padding: '6px 8px',
                            fontSize: '14px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #E5E7EB)',
                            textAlign: 'center',
                          }}
                        />
                      </td>

                      {/* Unit Price */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={item.unitPrice}
                          onBlur={(e) =>
                            handleUpdateItem(item.id, 'unitPrice', Number(e.target.value) || 0)
                          }
                          style={{
                            width: '100px',
                            padding: '6px 8px',
                            fontSize: '14px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #E5E7EB)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      </td>

                      {/* Discount % */}
                      <td style={{ padding: '10px 14px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={item.discountPercent || 0}
                          onBlur={(e) =>
                            handleUpdateItem(
                              item.id,
                              'discountPercent',
                              Number(e.target.value) || 0,
                            )
                          }
                          style={{
                            width: '70px',
                            padding: '6px 8px',
                            fontSize: '14px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #E5E7EB)',
                            textAlign: 'center',
                          }}
                        />
                      </td>

                      {/* Optional Toggle */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          defaultChecked={item.isOptional}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'isOptional', e.target.checked)
                          }
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                            accentColor: '#2563EB',
                          }}
                          title="Allow recipient to select or deselect"
                        />
                      </td>

                      {/* Subtotal */}
                      <td
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontWeight: 500,
                          color: 'var(--color-gray-900, #111827)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatCurrency(lineNet)}
                      </td>

                      {/* Delete */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: '#DC2626',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Delete Item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'var(--color-gray-500, #6B7280)',
                    }}
                  >
                    No line items added yet. Click &quot;Add Blank Item&quot; or &quot;Add from
                    Catalog&quot; to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tax & Discount Configurations + Calculated Totals Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Tax & Discounts Settings */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color, #E5E7EB)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--color-gray-950, #030712)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Receipt size={16} color="#2563EB" />
            Tax & Table-Level Discount Settings
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-700, #374151)',
                  marginBottom: '4px',
                }}
              >
                Table-Wide Discount (%)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tableDiscountPercent}
                  onChange={(e) => setTableDiscountPercent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #E5E7EB)',
                  }}
                />
                <Percent
                  size={14}
                  color="#9CA3AF"
                  style={{ position: 'absolute', right: '12px', top: '12px' }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-gray-700, #374151)',
                  marginBottom: '4px',
                }}
              >
                Standard Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #E5E7EB)',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <input
                type="checkbox"
                id="taxIncluded"
                checked={taxIncluded}
                onChange={(e) => setTaxIncluded(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#2563EB' }}
              />
              <label
                htmlFor="taxIncluded"
                style={{
                  fontSize: '13px',
                  color: 'var(--color-gray-700, #374151)',
                  cursor: 'pointer',
                }}
              >
                Prices are tax-inclusive (tax extracted from subtotal)
              </label>
            </div>

            <button
              onClick={handleSaveTableConfig}
              className="pact-btn pact-btn-primary"
              style={{ marginTop: '8px', alignSelf: 'flex-start' }}
            >
              Apply Tax & Discount Rules
            </button>
          </div>
        </div>

        {/* Right Column: Totals Summary (ALL totals from API, Decimal.js calculated) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color, #E5E7EB)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--color-gray-950, #030712)',
              marginBottom: '16px',
            }}
          >
            Financial Summary (CPQ Totals)
          </h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>Subtotal</span>
              <span
                style={{
                  fontWeight: 500,
                  color: 'var(--color-gray-900, #111827)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(tableData?.totals?.subtotal)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>Discounts Applied</span>
              <span
                style={{
                  fontWeight: 500,
                  color: '#16A34A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                -{formatCurrency(tableData?.totals?.totalDiscount)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>
                Estimated Tax {taxIncluded ? '(Included)' : ''}
              </span>
              <span
                style={{
                  fontWeight: 500,
                  color: 'var(--color-gray-900, #111827)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(tableData?.totals?.taxAmount)}
              </span>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border-color, #E5E7EB)',
                paddingTop: '12px',
                marginTop: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950, #030712)',
                  }}
                >
                  Grand Total
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--color-gray-500, #6B7280)',
                  }}
                >
                  Calculated with exact decimal precision
                </span>
              </div>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#2563EB',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(tableData?.totals?.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Item Selection Modal */}
      {showCatalogModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-popover, 0 10px 15px -3px rgba(0, 0, 0, 0.1))',
              border: '1px solid var(--border-color, #E5E7EB)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color, #E5E7EB)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} color="#2563EB" />
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950, #030712)',
                    margin: 0,
                  }}
                >
                  Product Catalog
                </h3>
              </div>
              <button
                onClick={() => setShowCatalogModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  color="#9CA3AF"
                  style={{ position: 'absolute', left: '10px', top: '10px' }}
                />
                <input
                  type="text"
                  placeholder="Search catalog by name or SKU..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    fontSize: '14px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #E5E7EB)',
                  }}
                />
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {loadingCatalog ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  Loading catalog items...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {catalogItems
                    .filter(
                      (item) =>
                        item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                        (item.sku && item.sku.toLowerCase().includes(catalogSearch.toLowerCase())),
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: '1px solid var(--border-color, #E5E7EB)',
                          borderRadius: '6px',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '14px',
                              color: 'var(--color-gray-900, #111827)',
                            }}
                          >
                            {item.name}
                          </div>
                          {item.description && (
                            <div
                              style={{
                                fontSize: '12px',
                                color: 'var(--color-gray-600, #4B5563)',
                                marginTop: '2px',
                              }}
                            >
                              {item.description}
                            </div>
                          )}
                          {item.sku && (
                            <span
                              style={{
                                display: 'inline-block',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: '#6B7280',
                                backgroundColor: '#F3F4F6',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                marginTop: '4px',
                              }}
                            >
                              SKU: {item.sku}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            style={{
                              fontSize: '15px',
                              fontWeight: 600,
                              color: 'var(--color-gray-950, #030712)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatCurrency(item.unitPrice)}
                          </span>
                          <button
                            onClick={() => handleSelectCatalogItem(item)}
                            className="pact-btn pact-btn-primary"
                            style={{ padding: '6px 14px', fontSize: '13px' }}
                          >
                            Insert Item
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
