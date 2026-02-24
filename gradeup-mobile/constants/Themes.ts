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

export const THEMES: Record<ThemeId, ThemePalette> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    background: '#0f172a',
    backgroundSecondary: '#1e293b',
    card: '#1e293b',
    cardBorder: '#334155',
    primary: '#818cf8',
    secondary: '#a78bfa',
    accent: '#f472b6',
    accent2: '#34d399',
    accent3: '#fbbf24',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textInverse: '#0f172a',
    border: '#334155',
    tabIconDefault: '#64748b',
    tabIconSelected: '#818cf8',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    focusCard: '#4338ca',
    focusCardText: '#e0e7ff',
    shortcutColors: ['#818cf8', '#a78bfa', '#f472b6'],
  },
  light: {
    id: 'light',
    name: 'Light',
    background: '#f8fafc',
    backgroundSecondary: '#f1f5f9',
    card: '#ffffff',
    cardBorder: '#e2e8f0',
    primary: '#2563eb',
    secondary: '#7c3aed',
    accent: '#ec4899',
    accent2: '#10b981',
    accent3: '#f59e0b',
    text: '#0f172a',
    textSecondary: '#64748b',
    textInverse: '#ffffff',
    border: '#e2e8f0',
    tabIconDefault: '#94a3b8',
    tabIconSelected: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    focusCard: '#1e40af',
    focusCardText: '#dbeafe',
    shortcutColors: ['#2563eb', '#7c3aed', '#ec4899'],
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    background: '#fafafa',
    backgroundSecondary: '#f5f5f5',
    card: '#ffffff',
    cardBorder: '#e5e5e5',
    primary: '#525252',
    secondary: '#737373',
    accent: '#a3a3a3',
    accent2: '#737373',
    accent3: '#525252',
    text: '#171717',
    textSecondary: '#737373',
    textInverse: '#fafafa',
    border: '#e5e5e5',
    tabIconDefault: '#a3a3a3',
    tabIconSelected: '#404040',
    success: '#22c55e',
    warning: '#eab308',
    danger: '#dc2626',
    focusCard: '#404040',
    focusCardText: '#fafafa',
    shortcutColors: ['#737373', '#525252', '#a3a3a3'],
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    background: '#ecfdf5',
    backgroundSecondary: '#d1fae5',
    card: '#ffffff',
    cardBorder: '#a7f3d0',
    primary: '#059669',
    secondary: '#0d9488',
    accent: '#06b6d4',
    accent2: '#8b5cf6',
    accent3: '#f43f5e',
    text: '#064e3b',
    textSecondary: '#047857',
    textInverse: '#ecfdf5',
    border: '#a7f3d0',
    tabIconDefault: '#34d399',
    tabIconSelected: '#059669',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#f43f5e',
    focusCard: '#047857',
    focusCardText: '#d1fae5',
    shortcutColors: ['#059669', '#0d9488', '#8b5cf6'],
  },
  retro: {
    id: 'retro',
    name: 'Retro',
    background: '#fef3c7',
    backgroundSecondary: '#fde68a',
    card: '#fffbeb',
    cardBorder: '#fcd34d',
    primary: '#b45309',
    secondary: '#92400e',
    accent: '#dc2626',
    accent2: '#059669',
    accent3: '#7c3aed',
    text: '#451a03',
    textSecondary: '#92400e',
    textInverse: '#fffbeb',
    border: '#fcd34d',
    tabIconDefault: '#d97706',
    tabIconSelected: '#b45309',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    focusCard: '#c2410c',
    focusCardText: '#ffedd5',
    shortcutColors: ['#b45309', '#dc2626', '#7c3aed'],
  },
};

export const THEME_IDS: ThemeId[] = ['dark', 'light', 'minimal', 'modern', 'retro'];
