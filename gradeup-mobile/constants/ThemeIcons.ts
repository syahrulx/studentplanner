/**
 * Per-theme icon mapping for tab bar and chrome.
 */

import type { ThemeId } from './Themes';

export type IconFamily = 'Feather' | 'FontAwesome';

export type ThemeIconKey =
  | 'home'
  | 'tasks'
  | 'notes'
  | 'profile'
  | 'add'
  | 'calendar'
  | 'checkCircle'
  | 'sparkles'
  | 'user'
  | 'layers'
  | 'target'
  | 'award'
  | 'star'
  | 'clock'
  | 'pieChart'
  | 'settings'
  | 'arrowRight'
  | 'bookOpen'
  | 'helpCircle'
  | 'stressMap'
  | 'weeklySummary'
  | 'leaderboard'
  | 'themeLight'
  | 'themeDark'
  | 'themeBlush'
  | 'themeMidnight'
  | 'themeEmerald';

export type IconDef = { family: IconFamily; name: string };

const F = (name: string): IconDef => ({ family: 'Feather', name });

function iconsForTone(
  home: string,
  tasks: string,
  notes: string,
  add: { family: IconFamily; name: string },
): Record<ThemeIconKey, IconDef> {
  return {
    home: F(home),
    tasks: F(tasks),
    notes: F(notes),
    profile: F('user'),
    add,
    calendar: F('calendar'),
    checkCircle: F('check-circle'),
    sparkles: F('zap'),
    user: F('user'),
    layers: F('layers'),
    target: F('target'),
    award: F('award'),
    star: F('star'),
    clock: F('clock'),
    pieChart: F('pie-chart'),
    settings: F('settings'),
    arrowRight: F('arrow-right'),
    bookOpen: F('book-open'),
    helpCircle: F('help-circle'),
    stressMap: F('layers'),
    weeklySummary: F('calendar'),
    leaderboard: F('award'),
    themeLight: F('sun'),
    themeDark: F('moon'),
    themeBlush: F('heart'),
    themeMidnight: F('star'),
    themeEmerald: F('droplet'),
  };
}

export const THEME_ICON_MAP: Record<ThemeId, Record<ThemeIconKey, IconDef>> = {
  light: iconsForTone('home', 'check-square', 'book-open', { family: 'FontAwesome', name: 'plus-circle' }),
  dark: iconsForTone('moon', 'check-square', 'book', F('plus')),
  blush: iconsForTone('heart', 'check-square', 'book-open', { family: 'FontAwesome', name: 'plus-circle' }),
  midnight: iconsForTone('moon', 'check-square', 'book', F('plus')),
  emerald: iconsForTone('sun', 'check-circle', 'book-open', { family: 'FontAwesome', name: 'plus-circle' }),
};

export const THEME_DISPLAY_ICON_KEY: Record<ThemeId, ThemeIconKey> = {
  light: 'themeLight',
  dark: 'themeDark',
  blush: 'themeBlush',
  midnight: 'themeMidnight',
  emerald: 'themeEmerald',
};
