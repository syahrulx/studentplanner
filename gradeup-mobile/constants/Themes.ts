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
 * Study-focused colour palette:
 * - Primary: dark green (focus, growth)
 * - Secondary: medium green
 * - Accent: gold (achievement, warmth)
 * - Accent2: sage/teal (calm)
 * - Surfaces: white with subtle green-tinted greys where suitable
 */
export const STUDY_PALETTE = {
  primary: '#14532d',
  primaryLight: '#166534',
  secondary: '#15803d',
  accent: '#ca8a04',
  accentLight: '#d4a843',
  sage: '#0d9488',
  success: '#15803d',
  warning: '#ca8a04',
  danger: '#b91c1c',
  text: '#1a2e1a',
  textSecondary: '#4a6b5a',
  border: '#bbd9ce',
  borderLight: '#e2efe8',
  focusCard: '#14532d',
  focusCardText: '#dcfce7',
  bgSecondary: '#f0f7f2',
} as const;

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
