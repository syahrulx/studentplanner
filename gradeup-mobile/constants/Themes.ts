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

export const CAT_THEME_OVERRIDE: ThemePalette = {
  id: 'blush',
  name: 'Cat Theme',
  background: '#fff8f1',
  backgroundSecondary: '#fdf0e2',
  card: '#fffdf9',
  cardBorder: '#edd9c3',
  primary: '#b26f45',
  secondary: '#c8895a',
  accent: '#e4a06c',
  accent2: '#9e5f38',
  accent3: '#f8e2c9',
  text: '#4b2f1d',
  textSecondary: '#9a6f52',
  textInverse: '#fffaf4',
  border: '#ecd6bf',
  tabIconDefault: '#bb926f',
  tabIconSelected: '#b26f45',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  focusCard: '#fdebd9',
  focusCardText: '#674127',
  shortcutColors: ['#b26f45', '#e4a06c', '#c8895a'],
};

export const MONO_THEME_OVERRIDE: ThemePalette = {
  id: 'dark',
  name: 'Mono Theme',
  background: '#000000',
  backgroundSecondary: '#050505',
  card: '#0a0a0a',
  cardBorder: '#1a1a1a',
  primary: '#ffffff',
  secondary: '#ffffff',
  accent: '#ffffff',
  accent2: '#ffffff',
  accent3: '#111111',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  textInverse: '#000000',
  border: '#1f1f1f',
  tabIconDefault: '#ffffff',
  tabIconSelected: '#ffffff',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  focusCard: '#0d0d0d',
  focusCardText: '#f5f5f5',
  shortcutColors: ['#ffffff', '#ffffff', '#ffffff'],
};

/**
 * Aurora Purple Theme — soft lavender aesthetic.
 *
 * Three-tone palette tuned toward pastel lavender so it stays gentle on dark
 * surfaces: muted violet (#b794f4), soft lilac (#d8b4fe), and a powdered
 * lavender highlight (#e9d5ff). Surfaces use a hint of plum so the wallpaper
 * art blends smoothly without harsh seams.
 */
export const PURPLE_THEME_OVERRIDE: ThemePalette = {
  id: 'dark',
  name: 'Aurora Purple Theme',
  background: '#f7f4ff',
  backgroundSecondary: '#f1ebff',
  card: '#ffffff',
  cardBorder: '#ddd3fb',
  primary: '#8d72cb',
  secondary: '#b49be3',
  accent: '#efe7ff',
  accent2: '#9579d6',
  accent3: '#d6c7fb',
  text: '#3f2f69',
  textSecondary: '#66558e',
  textInverse: '#ffffff',
  border: '#d6c8fb',
  tabIconDefault: '#8f7abf',
  tabIconSelected: '#7a61b0',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
  focusCard: '#f2ecff',
  focusCardText: '#4a3977',
  shortcutColors: ['#8d72cb', '#b49be3', '#d9c8ff'],
};

/**
 * Dark ink base + deep red accents (Spider Theme).
 * Borders use Spider-Man's iconic suit blue (#1e3a8a) so card edges,
 * dividers, and input outlines all carry the blue-suit colour.
 */
export const SPIDER_THEME_OVERRIDE: ThemePalette = {
  id: 'dark',
  name: 'Spider Theme',
  background: '#050508',
  backgroundSecondary: '#08080d',
  card: '#0c0c12',
  cardBorder: '#1a326a',   // Spider-Man suit blue — card outlines
  primary: '#b91c1c',
  secondary: '#dc2626',
  accent: '#991b1b',
  accent2: '#7f1d1d',
  accent3: '#450a0a',
  text: '#f4f4f5',
  textSecondary: '#a1a1aa',
  textInverse: '#fafafa',
  border: '#1e3a8a',       // Spider-Man suit blue — all component borders
  tabIconDefault: '#a1a1aa',
  tabIconSelected: '#ffffff',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#dc2626',
  focusCard: '#0a0c18',
  focusCardText: '#dbeafe',
  shortcutColors: ['#991b1b', '#b91c1c', '#7f1d1d'],
};

/** Classic Spider variant: black + deep red only (no blue accents). */
export const SPIDER_THEME_CLASSIC_OVERRIDE: ThemePalette = {
  id: 'dark',
  name: 'Spider Theme (Classic)',
  background: '#050508',
  backgroundSecondary: '#08080d',
  card: '#0c0c12',
  cardBorder: '#3a0d11',
  primary: '#b91c1c',
  secondary: '#dc2626',
  accent: '#991b1b',
  accent2: '#7f1d1d',
  accent3: '#450a0a',
  text: '#f4f4f5',
  textSecondary: '#a1a1aa',
  textInverse: '#fafafa',
  border: '#3a0d11',
  tabIconDefault: '#a1a1aa',
  tabIconSelected: '#ffffff',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#dc2626',
  focusCard: '#12070a',
  focusCardText: '#fee2e2',
  shortcutColors: ['#991b1b', '#b91c1c', '#7f1d1d'],
};

export function resolveSpiderTheme(useBlueAccents: boolean): ThemePalette {
  return useBlueAccents ? SPIDER_THEME_OVERRIDE : SPIDER_THEME_CLASSIC_OVERRIDE;
}
