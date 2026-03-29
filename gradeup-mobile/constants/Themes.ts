/**
 * App themes (Profile → Preferences). Light / dark bases plus three styled palettes.
 */

export type ThemeId = 'light' | 'dark' | 'blush' | 'midnight' | 'emerald';

export interface ThemePalette {
  id: ThemeId;
  name: string;
  background: string;
  backgroundSecondary: string;
  card: string;
  cardBorder: string;
  primary: string;
  secondary: string;
  accent: string;
  accent2: string;
  accent3: string;
  text: string;
  textSecondary: string;
  textInverse: string;
  border: string;
  tabIconDefault: string;
  tabIconSelected: string;
  success: string;
  warning: string;
  danger: string;
  focusCard: string;
  focusCardText: string;
  shortcutColors: [string, string, string];
}

/** Deep navy + cyan — kept for legacy sign-up / static screens that still reference it */
export const DEEP_SEA_PALETTE = {
  primary: '#003366',
  primaryLight: '#004b7a',
  secondary: '#0e7490',
  accent: '#06b6d4',
  accentLight: '#22d3ee',
  sage: '#0891b2',
  success: '#059669',
  warning: '#d97706',
  danger: '#b91c1c',
  text: '#003366',
  textSecondary: '#475569',
  border: '#a5f3fc',
  borderLight: '#e0f2fe',
  focusCard: '#003366',
  focusCardText: '#cffafe',
  bgSecondary: '#f0f9ff',
  tabBarBg: '#003366',
  tabBarPill: 'rgba(255,255,255,0.12)',
  addBtn: '#0e7490',
} as const;

export const NAVY_PALETTE = DEEP_SEA_PALETTE;
export const STUDY_PALETTE = DEEP_SEA_PALETTE;

export function isDarkTheme(id: ThemeId): boolean {
  return id === 'midnight' || id === 'dark';
}

function backgroundLuminance(hex: string): number | null {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return null;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function themePrefersLightOutline(theme: ThemePalette): boolean {
  const L = backgroundLuminance(theme.background);
  if (L == null) return isDarkTheme(theme.id);
  return L < 0.35;
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  light: {
    id: 'light',
    name: 'Light',
    background: '#f8fafc',
    backgroundSecondary: '#f1f5f9',
    card: '#ffffff',
    cardBorder: '#e2e8f0',
    primary: '#2563eb',
    secondary: '#3b82f6',
    accent: '#60a5fa',
    accent2: '#1d4ed8',
    accent3: '#dbeafe',
    text: '#0f172a',
    textSecondary: '#64748b',
    textInverse: '#ffffff',
    border: '#e2e8f0',
    tabIconDefault: '#94a3b8',
    tabIconSelected: '#2563eb',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    focusCard: '#eff6ff',
    focusCardText: '#1e3a8a',
    shortcutColors: ['#2563eb', '#3b82f6', '#1d4ed8'],
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    background: '#0f172a',
    backgroundSecondary: '#1e293b',
    card: '#1e293b',
    cardBorder: '#334155',
    primary: '#38bdf8',
    secondary: '#0ea5e9',
    accent: '#7dd3fc',
    accent2: '#0284c7',
    accent3: '#0c4a6e',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textInverse: '#0f172a',
    border: '#334155',
    tabIconDefault: '#64748b',
    tabIconSelected: '#38bdf8',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    focusCard: '#1e3a5f',
    focusCardText: '#e0f2fe',
    shortcutColors: ['#38bdf8', '#0ea5e9', '#7dd3fc'],
  },
  blush: {
    id: 'blush',
    name: 'Soft pink & nude',
    background: '#faf5f6',
    backgroundSecondary: '#f3e8ec',
    card: '#fffcfc',
    cardBorder: '#e8d0d9',
    primary: '#b83280',
    secondary: '#db7093',
    accent: '#e879a6',
    accent2: '#9d174d',
    accent3: '#fce7f3',
    text: '#3f2432',
    textSecondary: '#8b6572',
    textInverse: '#ffffff',
    border: '#e1c4d0',
    tabIconDefault: '#a38b94',
    tabIconSelected: '#b83280',
    success: '#0d9488',
    warning: '#c2410c',
    danger: '#be123c',
    focusCard: '#f9e8ee',
    focusCardText: '#5c2d3d',
    shortcutColors: ['#b83280', '#db7093', '#9d174d'],
  },
  midnight: {
    id: 'midnight',
    name: 'Black & gold',
    background: '#0a0a0b',
    backgroundSecondary: '#141416',
    card: '#18181b',
    cardBorder: '#3f3f46',
    primary: '#d4af37',
    secondary: '#c9a227',
    accent: '#f0d56c',
    accent2: '#a16207',
    accent3: '#fef3c7',
    text: '#faf7ef',
    textSecondary: '#b8b3a8',
    textInverse: '#0a0a0b',
    border: '#3f3f46',
    tabIconDefault: '#78716c',
    tabIconSelected: '#d4af37',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    focusCard: '#27272a',
    focusCardText: '#faf7ef',
    shortcutColors: ['#d4af37', '#f0d56c', '#c9a227'],
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald & mint',
    background: '#ecfdf5',
    backgroundSecondary: '#d1fae5',
    card: '#ffffff',
    cardBorder: '#a7f3d0',
    primary: '#047857',
    secondary: '#059669',
    accent: '#10b981',
    accent2: '#065f46',
    accent3: '#6ee7b7',
    text: '#064e3b',
    textSecondary: '#0f766e',
    textInverse: '#ffffff',
    border: '#a7f3d0',
    tabIconDefault: '#5c8f84',
    tabIconSelected: '#047857',
    success: '#047857',
    warning: '#b45309',
    danger: '#b91c1c',
    focusCard: '#d1fae5',
    focusCardText: '#064e3b',
    shortcutColors: ['#047857', '#10b981', '#059669'],
  },
};

/** Order in Profile → theme picker: neutral modes first, then styled themes */
export const THEME_IDS: ThemeId[] = ['light', 'dark', 'blush', 'midnight', 'emerald'];
