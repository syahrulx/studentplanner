import {
  buildCustomTheme,
  CAT_THEME_OVERRIDE,
  MONO_THEME_OVERRIDE,
  PURPLE_THEME_OVERRIDE,
  resolveSpiderTheme,
  THEME_IDS,
  THEMES,
  type ThemeId,
  type ThemePalette,
} from '../domain/themes';

export type ThemePackId = 'none' | 'cat' | 'mono' | 'spider' | 'purple' | 'custom';

export interface CustomThemeColors {
  primary: string;
  card: string;
  background: string;
  text?: string;
  textSecondary?: string;
  textInverse?: string;
  border?: string;
  focusCard?: string;
  focusCardText?: string;
}

export interface ThemePreferences {
  theme: ThemeId;
  themePack: ThemePackId;
  spiderBlueAccents?: boolean;
  customThemeColors?: CustomThemeColors | null;
}

export const THEME_STORAGE_KEYS = {
  theme: 'appTheme',
  themePack: 'appThemePack',
  spiderBlueAccents: 'spiderBlueAccents',
  customThemeColors: '@custom_theme_colors',
} as const;

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  theme: 'light',
  themePack: 'none',
  spiderBlueAccents: true,
  customThemeColors: null,
};

const VALID_PACKS: ThemePackId[] = ['none', 'cat', 'mono', 'spider', 'purple', 'custom'];

export function normalizeThemeId(raw: unknown): ThemeId {
  if (typeof raw === 'string' && (THEME_IDS as string[]).includes(raw)) {
    return raw as ThemeId;
  }
  return 'light';
}

export function normalizeThemePack(raw: unknown): ThemePackId {
  if (typeof raw === 'string' && (VALID_PACKS as string[]).includes(raw)) {
    return raw as ThemePackId;
  }
  return 'none';
}

export function parseThemePreferences(raw: unknown): ThemePreferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    theme: normalizeThemeId(o.theme),
    themePack: normalizeThemePack(o.themePack),
    spiderBlueAccents: o.spiderBlueAccents !== false,
    customThemeColors:
      o.customThemeColors && typeof o.customThemeColors === 'object'
        ? (o.customThemeColors as CustomThemeColors)
        : null,
  };
}

export function resolveThemePalette(prefs: ThemePreferences): ThemePalette {
  const { theme, themePack, spiderBlueAccents = true, customThemeColors } = prefs;
  if (themePack === 'custom' && customThemeColors) {
    return buildCustomTheme(customThemeColors, theme);
  }
  if (themePack === 'cat') return CAT_THEME_OVERRIDE;
  if (themePack === 'mono') return MONO_THEME_OVERRIDE;
  if (themePack === 'spider') return resolveSpiderTheme(spiderBlueAccents);
  if (themePack === 'purple') return PURPLE_THEME_OVERRIDE;
  return THEMES[theme];
}
