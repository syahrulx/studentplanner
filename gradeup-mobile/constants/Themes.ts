/**
 * Theme palettes: Dark, Light, Minimal, Modern, Retro
 * Each theme defines colors used across the app for a consistent, colorful look.
 */

export type ThemeId = 'dark' | 'light' | 'minimal' | 'modern' | 'retro';

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
  shortcutColors: [string, string, string]; // for 3 shortcut icons
}

/**
 * Deep sea blue theme palette:
 * - Primary: deep sea (cyan-900)
 * - Secondary: teal/cyan (ocean mid-tone)
 * - Accent: bright cyan (highlights, CTAs)
 * - Surfaces: white with cyan-tinted greys
 */
export const DEEP_SEA_PALETTE = {
  primary: '#0c4a6e',
  primaryLight: '#155e75',
  secondary: '#0e7490',
  accent: '#06b6d4',
  accentLight: '#22d3ee',
  sage: '#0891b2',
  success: '#059669',
  warning: '#d97706',
  danger: '#b91c1c',
  text: '#0c4a6e',
  textSecondary: '#475569',
  border: '#a5f3fc',
  borderLight: '#e0f2fe',
  focusCard: '#0e7490',
  focusCardText: '#cffafe',
  bgSecondary: '#f0f9ff',
  tabBarBg: '#0c4a6e',
  tabBarPill: 'rgba(255,255,255,0.12)',
  addBtn: '#0e7490',
} as const;

/** @deprecated Use DEEP_SEA_PALETTE */
export const NAVY_PALETTE = DEEP_SEA_PALETTE;

/** @deprecated Use DEEP_SEA_PALETTE */
export const STUDY_PALETTE = DEEP_SEA_PALETTE;

export const THEMES: Record<ThemeId, ThemePalette> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    background: '#ffffff',
    backgroundSecondary: STUDY_PALETTE.bgSecondary,
    card: '#ffffff',
    cardBorder: STUDY_PALETTE.borderLight,
    primary: STUDY_PALETTE.primary,
    secondary: STUDY_PALETTE.secondary,
    accent: STUDY_PALETTE.accent,
    accent2: STUDY_PALETTE.sage,
    accent3: STUDY_PALETTE.accentLight,
    text: STUDY_PALETTE.text,
    textSecondary: STUDY_PALETTE.textSecondary,
    textInverse: '#ffffff',
    border: STUDY_PALETTE.borderLight,
    tabIconDefault: STUDY_PALETTE.textSecondary,
    tabIconSelected: STUDY_PALETTE.accent,
    success: STUDY_PALETTE.success,
    warning: STUDY_PALETTE.warning,
    danger: STUDY_PALETTE.danger,
    focusCard: STUDY_PALETTE.focusCard,
    focusCardText: STUDY_PALETTE.focusCardText,
    shortcutColors: [STUDY_PALETTE.primary, STUDY_PALETTE.accent, STUDY_PALETTE.secondary],
  },
  light: {
    id: 'light',
    name: 'Light',
    background: '#ffffff',
    backgroundSecondary: STUDY_PALETTE.bgSecondary,
    card: '#ffffff',
    cardBorder: STUDY_PALETTE.borderLight,
    primary: STUDY_PALETTE.primary,
    secondary: STUDY_PALETTE.primaryLight,
    accent: STUDY_PALETTE.accent,
    accent2: STUDY_PALETTE.secondary,
    accent3: STUDY_PALETTE.accentLight,
    text: STUDY_PALETTE.text,
    textSecondary: STUDY_PALETTE.textSecondary,
    textInverse: '#ffffff',
    border: STUDY_PALETTE.borderLight,
    tabIconDefault: STUDY_PALETTE.textSecondary,
    tabIconSelected: STUDY_PALETTE.primary,
    success: STUDY_PALETTE.success,
    warning: STUDY_PALETTE.warning,
    danger: STUDY_PALETTE.danger,
    focusCard: STUDY_PALETTE.focusCard,
    focusCardText: STUDY_PALETTE.focusCardText,
    shortcutColors: [STUDY_PALETTE.primary, STUDY_PALETTE.accent, STUDY_PALETTE.primaryLight],
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    background: '#ffffff',
    backgroundSecondary: STUDY_PALETTE.bgSecondary,
    card: '#ffffff',
    cardBorder: STUDY_PALETTE.borderLight,
    primary: STUDY_PALETTE.textSecondary,
    secondary: STUDY_PALETTE.primary,
    accent: STUDY_PALETTE.accent,
    accent2: STUDY_PALETTE.sage,
    accent3: STUDY_PALETTE.accentLight,
    text: STUDY_PALETTE.text,
    textSecondary: STUDY_PALETTE.textSecondary,
    textInverse: '#ffffff',
    border: STUDY_PALETTE.borderLight,
    tabIconDefault: STUDY_PALETTE.textSecondary,
    tabIconSelected: STUDY_PALETTE.accent,
    success: STUDY_PALETTE.success,
    warning: STUDY_PALETTE.warning,
    danger: STUDY_PALETTE.danger,
    focusCard: STUDY_PALETTE.primary,
    focusCardText: STUDY_PALETTE.focusCardText,
    shortcutColors: [STUDY_PALETTE.primary, STUDY_PALETTE.accent, STUDY_PALETTE.textSecondary],
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    background: '#ffffff',
    backgroundSecondary: STUDY_PALETTE.bgSecondary,
    card: '#ffffff',
    cardBorder: STUDY_PALETTE.border,
    primary: STUDY_PALETTE.primary,
    secondary: STUDY_PALETTE.secondary,
    accent: STUDY_PALETTE.accent,
    accent2: STUDY_PALETTE.sage,
    accent3: STUDY_PALETTE.accentLight,
    text: STUDY_PALETTE.text,
    textSecondary: STUDY_PALETTE.textSecondary,
    textInverse: '#ffffff',
    border: STUDY_PALETTE.border,
    tabIconDefault: STUDY_PALETTE.sage,
    tabIconSelected: STUDY_PALETTE.accent,
    success: STUDY_PALETTE.success,
    warning: STUDY_PALETTE.warning,
    danger: STUDY_PALETTE.danger,
    focusCard: STUDY_PALETTE.focusCard,
    focusCardText: STUDY_PALETTE.focusCardText,
    shortcutColors: [STUDY_PALETTE.primary, STUDY_PALETTE.accent, STUDY_PALETTE.sage],
  },
  retro: {
    id: 'retro',
    name: 'Retro',
    background: '#ffffff',
    backgroundSecondary: '#fef9f0',
    card: '#ffffff',
    cardBorder: '#e8ddc8',
    primary: STUDY_PALETTE.primary,
    secondary: '#92400e',
    accent: STUDY_PALETTE.accent,
    accent2: STUDY_PALETTE.secondary,
    accent3: STUDY_PALETTE.accentLight,
    text: '#451a03',
    textSecondary: '#92400e',
    textInverse: '#ffffff',
    border: '#e8ddc8',
    tabIconDefault: '#6b6150',
    tabIconSelected: STUDY_PALETTE.accent,
    success: STUDY_PALETTE.success,
    warning: STUDY_PALETTE.warning,
    danger: STUDY_PALETTE.danger,
    focusCard: '#a16207',
    focusCardText: '#fefce8',
    shortcutColors: [STUDY_PALETTE.accent, STUDY_PALETTE.primary, STUDY_PALETTE.secondary],
  },
};

export const THEME_IDS: ThemeId[] = ['dark', 'light', 'minimal', 'modern', 'retro'];
