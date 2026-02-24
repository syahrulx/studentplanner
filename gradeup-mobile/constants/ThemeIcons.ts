/**
 * Per-theme icon mapping. Each theme uses different symbols for the same concept
 * so the app's look changes by theme, not just colors.
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
  | 'themeDark'
  | 'themeLight'
  | 'themeMinimal'
  | 'themeModern'
  | 'themeRetro';

export type IconDef = { family: IconFamily; name: string };

/** Icon (family + name) per theme for each logical key. Different icon per theme for distinct look. */
export const THEME_ICON_MAP: Record<ThemeId, Record<ThemeIconKey, IconDef>> = {
  dark: {
    home: { family: 'Feather', name: 'moon' },
    tasks: { family: 'Feather', name: 'check-square' },
    notes: { family: 'Feather', name: 'book' },
    profile: { family: 'Feather', name: 'user' },
    add: { family: 'Feather', name: 'plus' },
    calendar: { family: 'Feather', name: 'calendar' },
    checkCircle: { family: 'Feather', name: 'check-circle' },
    sparkles: { family: 'Feather', name: 'zap' },
    user: { family: 'Feather', name: 'user' },
    layers: { family: 'Feather', name: 'layers' },
    target: { family: 'Feather', name: 'target' },
    award: { family: 'Feather', name: 'award' },
    star: { family: 'Feather', name: 'star' },
    clock: { family: 'Feather', name: 'clock' },
    pieChart: { family: 'Feather', name: 'pie-chart' },
    settings: { family: 'Feather', name: 'settings' },
    arrowRight: { family: 'Feather', name: 'arrow-right' },
    bookOpen: { family: 'Feather', name: 'book-open' },
    helpCircle: { family: 'Feather', name: 'help-circle' },
    stressMap: { family: 'Feather', name: 'layers' },
    weeklySummary: { family: 'Feather', name: 'calendar' },
    leaderboard: { family: 'Feather', name: 'award' },
    themeDark: { family: 'Feather', name: 'moon' },
    themeLight: { family: 'Feather', name: 'sun' },
    themeMinimal: { family: 'Feather', name: 'circle' },
    themeModern: { family: 'Feather', name: 'zap' },
    themeRetro: { family: 'Feather', name: 'film' },
  },
  light: {
    home: { family: 'Feather', name: 'sun' },
    tasks: { family: 'Feather', name: 'check-circle' },
    notes: { family: 'Feather', name: 'book-open' },
    profile: { family: 'Feather', name: 'user' },
    add: { family: 'FontAwesome', name: 'plus-circle' },
    calendar: { family: 'Feather', name: 'calendar' },
    checkCircle: { family: 'Feather', name: 'check-circle' },
    sparkles: { family: 'Feather', name: 'zap' },
    user: { family: 'Feather', name: 'user' },
    layers: { family: 'Feather', name: 'layers' },
    target: { family: 'Feather', name: 'target' },
    award: { family: 'Feather', name: 'award' },
    star: { family: 'Feather', name: 'star' },
    clock: { family: 'Feather', name: 'clock' },
    pieChart: { family: 'Feather', name: 'pie-chart' },
    settings: { family: 'Feather', name: 'settings' },
    arrowRight: { family: 'Feather', name: 'arrow-right' },
    bookOpen: { family: 'Feather', name: 'book-open' },
    helpCircle: { family: 'Feather', name: 'help-circle' },
    stressMap: { family: 'Feather', name: 'layers' },
    weeklySummary: { family: 'Feather', name: 'calendar' },
    leaderboard: { family: 'Feather', name: 'award' },
    themeDark: { family: 'Feather', name: 'moon' },
    themeLight: { family: 'Feather', name: 'sun' },
    themeMinimal: { family: 'Feather', name: 'circle' },
    themeModern: { family: 'Feather', name: 'zap' },
    themeRetro: { family: 'Feather', name: 'film' },
  },
  minimal: {
    home: { family: 'Feather', name: 'circle' },
    tasks: { family: 'Feather', name: 'minus' },
    notes: { family: 'Feather', name: 'file-text' },
    profile: { family: 'Feather', name: 'user' },
    add: { family: 'Feather', name: 'plus' },
    calendar: { family: 'Feather', name: 'calendar' },
    checkCircle: { family: 'Feather', name: 'check' },
    sparkles: { family: 'Feather', name: 'circle' },
    user: { family: 'Feather', name: 'user' },
    layers: { family: 'Feather', name: 'grid' },
    target: { family: 'Feather', name: 'circle' },
    award: { family: 'Feather', name: 'star' },
    star: { family: 'Feather', name: 'star' },
    clock: { family: 'Feather', name: 'clock' },
    pieChart: { family: 'Feather', name: 'bar-chart-2' },
    settings: { family: 'Feather', name: 'settings' },
    arrowRight: { family: 'Feather', name: 'chevron-right' },
    bookOpen: { family: 'Feather', name: 'file-text' },
    helpCircle: { family: 'Feather', name: 'help-circle' },
    stressMap: { family: 'Feather', name: 'grid' },
    weeklySummary: { family: 'Feather', name: 'calendar' },
    leaderboard: { family: 'Feather', name: 'star' },
    themeDark: { family: 'Feather', name: 'moon' },
    themeLight: { family: 'Feather', name: 'sun' },
    themeMinimal: { family: 'Feather', name: 'circle' },
    themeModern: { family: 'Feather', name: 'zap' },
    themeRetro: { family: 'Feather', name: 'film' },
  },
  modern: {
    home: { family: 'Feather', name: 'zap' },
    tasks: { family: 'Feather', name: 'target' },
    notes: { family: 'Feather', name: 'layers' },
    profile: { family: 'Feather', name: 'user' },
    add: { family: 'Feather', name: 'plus' },
    calendar: { family: 'Feather', name: 'calendar' },
    checkCircle: { family: 'Feather', name: 'check-circle' },
    sparkles: { family: 'Feather', name: 'zap' },
    user: { family: 'Feather', name: 'user' },
    layers: { family: 'Feather', name: 'layers' },
    target: { family: 'Feather', name: 'target' },
    award: { family: 'Feather', name: 'award' },
    star: { family: 'Feather', name: 'star' },
    clock: { family: 'Feather', name: 'clock' },
    pieChart: { family: 'Feather', name: 'pie-chart' },
    settings: { family: 'Feather', name: 'settings' },
    arrowRight: { family: 'Feather', name: 'arrow-right' },
    bookOpen: { family: 'Feather', name: 'book-open' },
    helpCircle: { family: 'Feather', name: 'help-circle' },
    stressMap: { family: 'Feather', name: 'activity' },
    weeklySummary: { family: 'Feather', name: 'trending-up' },
    leaderboard: { family: 'Feather', name: 'trending-up' },
    themeDark: { family: 'Feather', name: 'moon' },
    themeLight: { family: 'Feather', name: 'sun' },
    themeMinimal: { family: 'Feather', name: 'circle' },
    themeModern: { family: 'Feather', name: 'zap' },
    themeRetro: { family: 'Feather', name: 'film' },
  },
  retro: {
    home: { family: 'Feather', name: 'film' },
    tasks: { family: 'Feather', name: 'list' },
    notes: { family: 'Feather', name: 'book-open' },
    profile: { family: 'Feather', name: 'user' },
    add: { family: 'Feather', name: 'plus' },
    calendar: { family: 'Feather', name: 'calendar' },
    checkCircle: { family: 'Feather', name: 'check-circle' },
    sparkles: { family: 'Feather', name: 'film' },
    user: { family: 'Feather', name: 'user' },
    layers: { family: 'Feather', name: 'layers' },
    target: { family: 'Feather', name: 'award' },
    award: { family: 'Feather', name: 'award' },
    star: { family: 'Feather', name: 'star' },
    clock: { family: 'Feather', name: 'clock' },
    pieChart: { family: 'Feather', name: 'pie-chart' },
    settings: { family: 'Feather', name: 'settings' },
    arrowRight: { family: 'Feather', name: 'chevron-right' },
    bookOpen: { family: 'Feather', name: 'book-open' },
    helpCircle: { family: 'Feather', name: 'help-circle' },
    stressMap: { family: 'Feather', name: 'layers' },
    weeklySummary: { family: 'Feather', name: 'calendar' },
    leaderboard: { family: 'Feather', name: 'award' },
    themeDark: { family: 'Feather', name: 'moon' },
    themeLight: { family: 'Feather', name: 'sun' },
    themeMinimal: { family: 'Feather', name: 'circle' },
    themeModern: { family: 'Feather', name: 'zap' },
    themeRetro: { family: 'Feather', name: 'film' },
  },
};

export const THEME_DISPLAY_ICON_KEY: Record<ThemeId, ThemeIconKey> = {
  dark: 'themeDark',
  light: 'themeLight',
  minimal: 'themeMinimal',
  modern: 'themeModern',
  retro: 'themeRetro',
};
