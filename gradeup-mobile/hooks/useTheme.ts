import { useApp } from '@/src/context/AppContext';
import { THEMES, type ThemePalette, type ThemeId } from '@/constants/Themes';

const CAT_THEME_OVERRIDE: ThemePalette = {
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

const MONO_THEME_OVERRIDE: ThemePalette = {
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
const PURPLE_THEME_OVERRIDE: ThemePalette = {
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
const SPIDER_THEME_OVERRIDE: ThemePalette = {
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
  tabIconDefault: '#4a6fbd',
  tabIconSelected: '#fca5a5',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#dc2626',
  focusCard: '#0a0c18',
  focusCardText: '#dbeafe',
  shortcutColors: ['#991b1b', '#b91c1c', '#7f1d1d'],
};

export function useTheme(): ThemePalette {
  const { theme, themePack } = useApp();
  if (themePack === 'cat') return CAT_THEME_OVERRIDE;
  if (themePack === 'mono') return MONO_THEME_OVERRIDE;
  if (themePack === 'spider') return SPIDER_THEME_OVERRIDE;
  if (themePack === 'purple') return PURPLE_THEME_OVERRIDE;
  return THEMES[theme];
}

/** Mono + Spider: neutral subject colors, planner greyscale, shared “dark minimal” UI rules. */
export function useDarkMinimalThemePack(): boolean {
  const { themePack } = useApp();
  return themePack === 'mono' || themePack === 'spider';
}

export function useThemeId(): ThemeId {
  const { theme } = useApp();
  return theme;
}

export function useThemePack() {
  const { themePack } = useApp();
  return themePack;
}

export function useSetTheme(): (theme: ThemeId) => void {
  const { setTheme } = useApp();
  return setTheme;
}
