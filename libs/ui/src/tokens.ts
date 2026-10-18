/**
 * PactIntel Design System Tokens
 * Source of truth: docs/DESIGN_SYSTEM.md and design-proofs/styles.css
 * Non-negotiable visual constraints:
 * - One primary action color: #2563EB (Blue 600)
 * - Inter font family only
 * - Tables for tabular data (never card grids)
 * - Borders for structure, shadows only for floating elements
 * - 4px border radius for status badges (not full-round pills)
 * - No gradient backgrounds, no glassmorphism, no arrows on buttons
 */

export const colors = {
  primary: {
    DEFAULT: '#2563EB', // Blue 600
    hover: '#1D4ED8', // Blue 700
    subtle: '#EFF6FF', // Blue 50
    muted: '#DBEAFE', // Blue 100
  },
  neutral: {
    950: '#0C0F1D', // Page titles, headers, primary text
    800: '#1E293B', // Body text
    600: '#475569', // Secondary labels
    500: '#64748B', // Placeholder text, meta
    400: '#94A3B8', // Inactive icons, subtle dividers
    200: '#E2E8F0', // Borders, table row separators
    100: '#F1F5F9', // Table header bg, sidebar bg
    50: '#F8FAFC', // Main content background
    white: '#FFFFFF', // Card/panel/modal background
  },
  status: {
    success: {
      bg: '#F0FDF4',
      text: '#15803D',
      dot: '#22C55E',
    },
    warning: {
      bg: '#FFFBEB',
      text: '#B45309',
      dot: '#F59E0B',
    },
    error: {
      bg: '#FEF2F2',
      text: '#B91C1C',
      dot: '#EF4444',
    },
    info: {
      bg: '#EFF6FF',
      text: '#1E40AF',
      dot: '#3B82F6',
    },
    neutral: {
      bg: '#F1F5F9',
      text: '#475569',
      dot: '#94A3B8',
    },
  },
  surface: {
    page: '#F8FAFC',
    card: '#FFFFFF',
    sidebar: '#F1F5F9',
    overlay: 'rgba(15, 23, 42, 0.5)',
    input: '#FFFFFF',
  },
  border: {
    DEFAULT: '#E2E8F0',
    subtle: '#F1F5F9',
    focus: '#2563EB',
    error: '#EF4444',
  },
} as const;

export const shadows = {
  // Shadows used ONLY for floating elements (popovers, dropdowns, modals, toasts)
  popover: '0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.06)',
  modal: '0 8px 24px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06)',
  toast: '0 4px 12px rgba(15, 23, 42, 0.1)',
} as const;

export const radius = {
  default: '6px',
  badge: '4px',
  avatar: '9999px',
} as const;

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const typography = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  sizes: {
    title: { size: '20px', lineHeight: '28px', weight: '600' },
    subtitle: { size: '16px', lineHeight: '24px', weight: '600' },
    body: { size: '14px', lineHeight: '20px', weight: '400' },
    bodyMedium: { size: '14px', lineHeight: '20px', weight: '500' },
    caption: { size: '12px', lineHeight: '16px', weight: '400' },
    badge: { size: '12px', lineHeight: '16px', weight: '500' },
    tableHeader: { size: '12px', lineHeight: '16px', weight: '500' },
  },
} as const;
