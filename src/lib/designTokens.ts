/**
 * Design Tokens — Programmatic Access
 *
 * Use these constants when Tailwind classes aren't available
 * (e.g., Recharts configs, inline styles, dynamic class generation).
 *
 * For normal component styling, prefer Tailwind utility classes.
 */

export const COLORS = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
  },
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
  },
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const;

export const SHADOWS = {
  card: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
  cardHover: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  button: '0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(37, 99, 235, 0.15)',
  overlay: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
} as const;

export const RADIUS = {
  sm: '6px',
  md: '10px',
  lg: '16px',
} as const;

/** Semantic chart colors for Recharts / data visualization */
export const CHART_COLORS = [
  COLORS.primary[600],
  COLORS.success[500],
  COLORS.warning[500],
  COLORS.danger[500],
  COLORS.primary[400],
  COLORS.neutral[500],
  '#8b5cf6', // purple
  '#ec4899', // pink
] as const;
