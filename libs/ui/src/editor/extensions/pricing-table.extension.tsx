import React from 'react';
import { Node, mergeAttributes } from '@tiptap/react';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';

export interface PricingTableAttributes {
  pricingTableId: string | null;
  documentId: string | null;
}

export const PricingTableNodeView: React.FC<NodeViewProps> = (props) => {
  const { node, deleteNode } = props;
  const pricingTableId = node.attrs.pricingTableId as string | null;
  const documentId = node.attrs.documentId as string | null;

  return (
    <NodeViewWrapper className="pricing-table-node-view my-6">
      <div
        style={{
          border: '1px solid var(--border-color, #E5E7EB)',
          borderRadius: '8px',
          backgroundColor: 'var(--color-gray-50, #F9FAFB)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              $
            </div>
            <div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950, #030712)',
                }}
              >
                Interactive Pricing Table (CPQ)
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--color-gray-500, #6B7280)',
                  fontFamily: 'monospace',
                }}
              >
                ID: {pricingTableId || 'Unassigned'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {pricingTableId && documentId && (
              <a
                href={`/documents/${documentId}/edit/pricing-table/${pricingTableId}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#FFFFFF',
                  backgroundColor: '#2563EB',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                Edit Pricing & Line Items →
              </a>
            )}
            <button
              onClick={() => deleteNode()}
              type="button"
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                color: '#DC2626',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: '13px',
            color: 'var(--color-gray-600, #4B5563)',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color, #E5E7EB)',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            Recipients will view real-time calculated line items, optional addons, and quantity
            controls in their signing portal.
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#2563EB',
              letterSpacing: '0.05em',
            }}
          >
            RULE CPQ-001 Compliant
          </span>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const PricingTableExtension = Node.create({
  name: 'pricingTable',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      pricingTableId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-pricing-table-id'),
        renderHTML: (attributes) => {
          if (!attributes.pricingTableId) return {};
          return { 'data-pricing-table-id': attributes.pricingTableId };
        },
      },
      documentId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-document-id'),
        renderHTML: (attributes) => {
          if (!attributes.documentId) return {};
          return { 'data-document-id': attributes.documentId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="pricing-table"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pricing-table' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PricingTableNodeView);
  },
});
