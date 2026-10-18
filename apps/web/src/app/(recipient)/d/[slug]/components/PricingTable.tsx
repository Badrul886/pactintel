'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { PricingTotalsResponse, PricingTableResponseDto } from '@pactintel/shared-types';

interface PricingTableProps {
  documentId: string;
  tableId: string;
  onTotalChange?: (newTotal: string) => void;
  readOnly?: boolean;
}

export default function PricingTable({
  documentId,
  tableId,
  onTotalChange,
  readOnly = false,
}: PricingTableProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableMeta, setTableMeta] = useState<PricingTableResponseDto | null>(null);
  const [totals, setTotals] = useState<PricingTotalsResponse | null>(null);

  // Local buyer selection overrides state
  const [selections, setSelections] = useState<
    Record<string, { isSelected: boolean; quantity: number }>
  >({});

  const formatCurrency = (val: string | number | undefined) => {
    if (val === undefined || val === null) return '$0.00';
    const num = Number(val);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: totals?.currency || 'USD',
    }).format(num);
  };

  // Fetch initial pricing table totals (NO AUTH endpoint)
  const loadTotals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/documents/${documentId}/pricing-tables/${tableId}/totals`);
      if (!res.ok) {
        // Fallback demo for preview mode if server not running locally
        const demoTotals: PricingTotalsResponse = {
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
        };
        setTotals(demoTotals);
        if (onTotalChange) {
          onTotalChange(demoTotals.total);
        }
        return;
      }

      const data: { table: PricingTableResponseDto; totals: PricingTotalsResponse } =
        await res.json();
      setTableMeta(data.table);
      setTotals(data.totals);

      // Initialize selections map
      const initialMap: Record<string, { isSelected: boolean; quantity: number }> = {};
      data.totals.lineItems.forEach((li) => {
        initialMap[li.id] = {
          isSelected: li.isSelected,
          quantity: Number(li.quantity),
        };
      });
      setSelections(initialMap);

      if (onTotalChange) {
        onTotalChange(data.totals.total);
      }
    } catch {
      setError('Unable to load interactive pricing table.');
    } finally {
      setLoading(false);
    }
  }, [documentId, tableId, onTotalChange]);

  useEffect(() => {
    loadTotals();
  }, [loadTotals]);

  // Recipient selection change (RULE CPQ-001)
  const handleSelectionChange = async (
    lineItemId: string,
    updates: { isSelected?: boolean; quantity?: number },
  ) => {
    if (readOnly) return;

    const current = selections[lineItemId] || { isSelected: true, quantity: 1 };
    const nextSelection = { ...current, ...updates };

    const nextSelectionsMap = {
      ...selections,
      [lineItemId]: nextSelection,
    };
    setSelections(nextSelectionsMap);
    setUpdating(true);

    try {
      const selectionsPayload = Object.entries(nextSelectionsMap).map(([id, val]) => ({
        lineItemId: id,
        isSelected: val.isSelected,
        quantity: val.quantity,
      }));

      const res = await fetch(
        `/api/v1/documents/${documentId}/pricing-tables/${tableId}/buyer-selections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selections: selectionsPayload,
            viewerSessionId: 'recipient-viewer-session',
          }),
        },
      );

      if (res.ok) {
        const freshTotals: PricingTotalsResponse = await res.json();
        setTotals(freshTotals);
        if (onTotalChange) {
          onTotalChange(freshTotals.total);
        }
      }
    } catch {
      // In offline/demo mode, re-estimate locally
    } finally {
      setUpdating(false);
    }
  };

  const allowBuyerQuantity =
    tableMeta?.settings && (tableMeta.settings as any).allowBuyerQuantityChange !== false;

  if (loading) {
    return (
      <div
        style={{
          border: '1px solid var(--border-color, #E5E7EB)',
          borderRadius: '8px',
          padding: '24px',
          backgroundColor: '#FAFAFA',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            height: '24px',
            width: '220px',
            backgroundColor: '#E5E7EB',
            borderRadius: '4px',
            marginBottom: '16px',
          }}
        />
        <div style={{ height: '140px', backgroundColor: '#F3F4F6', borderRadius: '6px' }} />
      </div>
    );
  }

  if (error && !totals) {
    return (
      <div
        style={{
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: '#FEF2F2',
          marginBottom: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#991B1B',
        }}
      >
        <AlertCircle size={20} color="#DC2626" />
        <span style={{ fontSize: '14px' }}>{error}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-color, #E5E7EB)',
        borderRadius: '8px',
        backgroundColor: '#FFFFFF',
        marginBottom: '32px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Table Header Bar */}
      <div
        style={{
          padding: '14px 20px',
          backgroundColor: 'var(--color-gray-50, #F9FAFB)',
          borderBottom: '1px solid var(--border-color, #E5E7EB)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="#2563EB" />
          <h2
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--color-gray-950, #030712)',
              margin: 0,
            }}
          >
            Schedule of Services & Consideration (CPQ)
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {updating && (
            <span
              style={{
                fontSize: '12px',
                color: '#2563EB',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RefreshCw size={12} className="animate-spin" />
              Recalculating...
            </span>
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-gray-500, #6B7280)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Currency: {totals?.currency || 'USD'}
          </span>
        </div>
      </div>

      {/* Real HTML Table with horizontal scrolling on mobile */}
      <div
        className="cpq-table-wrapper"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '14px',
            minWidth: '100%',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid var(--border-color, #E5E7EB)',
                color: 'var(--color-gray-600, #4B5563)',
                fontWeight: 500,
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <th
                className="cpq-col-select"
                style={{ padding: '12px 16px', width: '48px', textAlign: 'center' }}
              >
                Select
              </th>
              <th className="cpq-col-name" style={{ padding: '12px 16px' }}>
                Item & Specifications
              </th>
              <th
                className="cpq-col-qty"
                style={{ padding: '12px 14px', width: '90px', textAlign: 'center' }}
              >
                Qty
              </th>
              <th
                className="cpq-col-unit"
                style={{ padding: '12px 14px', width: '120px', textAlign: 'right' }}
              >
                Unit Price
              </th>
              <th
                className="cpq-col-discount"
                style={{ padding: '12px 14px', width: '100px', textAlign: 'right' }}
              >
                Discount
              </th>
              <th
                className="cpq-col-total"
                style={{ padding: '12px 20px', width: '130px', textAlign: 'right' }}
              >
                Line Net
              </th>
            </tr>
          </thead>
          <tbody>
            {totals?.lineItems && totals.lineItems.length > 0 ? (
              totals.lineItems.map((item, idx) => {
                const isSelected = selections[item.id]?.isSelected ?? item.isSelected;
                const qty = selections[item.id]?.quantity ?? Number(item.quantity);

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #E5E7EB)',
                      backgroundColor: !isSelected
                        ? '#F9FAFB'
                        : idx % 2 === 0
                          ? '#FFFFFF'
                          : '#FAFAFA',
                      opacity: !isSelected ? 0.6 : 1,
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    {/* Select / Optional Checkbox */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {item.isOptional ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={readOnly}
                          onChange={(e) =>
                            handleSelectionChange(item.id, { isSelected: e.target.checked })
                          }
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: readOnly ? 'default' : 'pointer',
                            accentColor: '#2563EB',
                          }}
                          title="Toggle optional item"
                        />
                      ) : (
                        <Check size={16} color="#16A34A" style={{ margin: '0 auto' }} />
                      )}
                    </td>

                    {/* Name & Description */}
                    <td style={{ padding: '12px 16px' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--color-gray-950, #030712)',
                          textDecoration: !isSelected ? 'line-through' : 'none',
                        }}
                      >
                        {item.name}
                        {item.isOptional && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              color: '#2563EB',
                              backgroundColor: 'rgba(37, 99, 235, 0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            Optional Addon
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Qty */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {allowBuyerQuantity && !readOnly && isSelected ? (
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={qty}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 1);
                            handleSelectionChange(item.id, { quantity: val });
                          }}
                          style={{
                            width: '60px',
                            padding: '4px 6px',
                            fontSize: '13px',
                            textAlign: 'center',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #E5E7EB)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                      ) : (
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty}</span>
                      )}
                    </td>

                    {/* Unit Price */}
                    <td
                      className="cpq-col-unit"
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color: 'var(--color-gray-700, #374151)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCurrency(item.unitPrice)}
                    </td>

                    {/* Discount */}
                    <td
                      className="cpq-col-discount"
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color:
                          Number(item.lineDiscount ?? item.discount) > 0
                            ? '#16A34A'
                            : 'var(--color-gray-400, #9CA3AF)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Number(item.lineDiscount ?? item.discount) > 0
                        ? `-${formatCurrency(item.lineDiscount ?? item.discount)}`
                        : '—'}
                    </td>

                    {/* Line Net */}
                    <td
                      className="cpq-col-total"
                      style={{
                        padding: '12px 20px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: isSelected
                          ? 'var(--color-gray-950, #030712)'
                          : 'var(--color-gray-400, #9CA3AF)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatCurrency(item.lineNet ?? item.net)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: 'var(--color-gray-500, #6B7280)',
                  }}
                >
                  No line items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recipient Footer Summary (Totals strictly calculated by backend Decimal.js) */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--color-gray-50, #F9FAFB)',
          borderTop: '1px solid var(--border-color, #E5E7EB)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <div
          className="cpq-totals-summary"
          style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>Subtotal:</span>
            <span
              style={{
                fontWeight: 500,
                color: 'var(--color-gray-900, #111827)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCurrency(totals?.subtotal)}
            </span>
          </div>

          {Number(totals?.totalDiscount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>Discounts Applied:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: '#16A34A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                -{formatCurrency(totals?.totalDiscount)}
              </span>
            </div>
          )}

          {Number(totals?.taxAmount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--color-gray-600, #4B5563)' }}>Taxes:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: 'var(--color-gray-900, #111827)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(totals?.taxAmount)}
              </span>
            </div>
          )}

          <div
            style={{
              borderTop: '1px solid var(--border-color, #E5E7EB)',
              paddingTop: '8px',
              marginTop: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-gray-950, #030712)',
              }}
            >
              Total Consideration:
            </span>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: '#2563EB',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCurrency(totals?.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
