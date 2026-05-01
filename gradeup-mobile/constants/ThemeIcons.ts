/**
 * Theme-aware icon mapping.
 *
 * Two-tier resolution:
 *   1. ALL FREE THEMES (light / dark / blush / midnight / emerald) share ONE
 *      minimalist icon set (Feather + SF Symbols on iOS) so the system feels
 *      consistent regardless of which palette the user picks.
 *   2. EACH IN-APP THEME PACK (cat / mono / spider / purple) gets its own
 *      distinct icon family chosen for that pack's personality:
 *        - Cat     -> Ionicons (outline, rounded, soft)
 *        - Mono    -> Octicons (geometric, sharp, monochromatic)
 *        - Spider  -> MaterialCommunityIcons (bolder strokes, web motifs)
 *        - Purple  -> AntDesign (clean, slightly playful)
 *      This keeps the hierarchy: free themes feel native; paid packs feel
 *      crafted and visually unique.
 */

import type { ThemeId } from './Themes';
import type { ThemePackId } from '@/src/storage';

export type IconFamily =
  | 'Feather'
  | 'FontAwesome'
  | 'Ionicons'
  | 'Octicons'
  | 'MaterialCommunityIcons'
  | 'AntDesign';

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

const make =
  (family: IconFamily) =>
  (name: string): IconDef => ({ family, name });

const F = make('Feather');
const I = make('Ionicons');
const O = make('Octicons');
const M = make('MaterialCommunityIcons');
const A = make('AntDesign');

// ── DEFAULT (all 5 free themes) ─────────────────────────────────────────────
// Clean Feather line icons. iOS additionally upgrades to SF Symbols inside the
// renderer for that native polish — see SFSymbols.ts.
export const DEFAULT_ICON_MAP: Record<ThemeIconKey, IconDef> = {
  home:           F('home'),
  tasks:          F('check-square'),
  notes:          F('book'),
  profile:        F('user'),
  add:            F('plus-circle'),
  calendar:       F('calendar'),
  checkCircle:    F('check-circle'),
  sparkles:       F('zap'),
  user:           F('user'),
  layers:         F('layers'),
  target:         F('target'),
  award:          F('award'),
  star:           F('star'),
  clock:          F('clock'),
  pieChart:       F('pie-chart'),
  settings:       F('settings'),
  arrowRight:     F('chevron-right'),
  bookOpen:       F('book-open'),
  helpCircle:     F('help-circle'),
  stressMap:      F('activity'),
  weeklySummary:  F('bar-chart-2'),
  leaderboard:    F('award'),
  themeLight:     F('sun'),
  themeDark:      F('moon'),
  themeBlush:     F('heart'),
  themeMidnight:  F('star'),
  themeEmerald:   F('droplet'),
};

// ── PACK: CAT ─ Ionicons outline (warm + rounded) ───────────────────────────
const CAT_ICON_MAP: Record<ThemeIconKey, IconDef> = {
  home:           I('home-outline'),
  tasks:          I('checkmark-done-circle-outline'),
  notes:          I('reader-outline'),
  profile:        I('happy-outline'),
  add:            I('add-circle-outline'),
  calendar:       I('calendar-outline'),
  checkCircle:    I('checkmark-circle-outline'),
  sparkles:       I('sparkles-outline'),
  user:           I('person-outline'),
  layers:         I('albums-outline'),
  target:         I('locate-outline'),
  award:          I('ribbon-outline'),
  star:           I('star-outline'),
  clock:          I('time-outline'),
  pieChart:       I('pie-chart-outline'),
  settings:       I('settings-outline'),
  arrowRight:     I('chevron-forward-outline'),
  bookOpen:       I('book-outline'),
  helpCircle:     I('help-circle-outline'),
  stressMap:      I('analytics-outline'),
  weeklySummary:  I('bar-chart-outline'),
  leaderboard:    I('trophy-outline'),
  themeLight:     I('sunny-outline'),
  themeDark:      I('moon-outline'),
  themeBlush:     I('heart-outline'),
  themeMidnight:  I('star-outline'),
  themeEmerald:   I('leaf-outline'),
};

// ── PACK: MONO ─ Octicons (sharp, geometric, monochrome) ────────────────────
const MONO_ICON_MAP: Record<ThemeIconKey, IconDef> = {
  home:           O('home'),
  tasks:          O('checklist'),
  notes:          O('book'),
  profile:        O('person'),
  add:            O('plus-circle'),
  calendar:       O('calendar'),
  checkCircle:    O('check-circle'),
  sparkles:       O('zap'),
  user:           O('person'),
  layers:         O('stack'),
  target:         O('goal'),
  award:          O('trophy'),
  star:           O('star'),
  clock:          O('clock'),
  pieChart:       O('graph'),
  settings:       O('gear'),
  arrowRight:     O('chevron-right'),
  bookOpen:       O('book'),
  helpCircle:     O('question'),
  stressMap:      O('pulse'),
  weeklySummary:  O('graph'),
  leaderboard:    O('trophy'),
  themeLight:     O('sun'),
  themeDark:      O('moon'),
  themeBlush:     O('heart'),
  themeMidnight:  O('star'),
  themeEmerald:   O('project'), // Octicons has no 'leaf'; 'project' reads as a tidy mono card
};

// ── PACK: SPIDER ─ MaterialCommunityIcons (bolder, includes web motif) ─────
const SPIDER_ICON_MAP: Record<ThemeIconKey, IconDef> = {
  home:           M('home-variant'),
  tasks:          M('checkbox-marked-circle-outline'),
  notes:          M('notebook-outline'),
  profile:        M('account-circle-outline'),
  add:            M('plus-circle-outline'),
  calendar:       M('calendar-blank-outline'),
  checkCircle:    M('check-circle-outline'),
  sparkles:       M('flash-outline'),
  user:           M('account-outline'),
  layers:         M('layers-outline'),
  target:         M('target'),
  award:          M('medal-outline'),
  star:           M('star-outline'),
  clock:          M('clock-outline'),
  pieChart:       M('chart-pie'),
  settings:       M('cog-outline'),
  arrowRight:     M('chevron-right'),
  bookOpen:       M('book-open-outline'),
  helpCircle:     M('help-circle-outline'),
  stressMap:      M('web'), // signature spider-web glyph
  weeklySummary:  M('chart-bar'),
  leaderboard:    M('trophy-outline'),
  themeLight:     M('white-balance-sunny'),
  themeDark:      M('moon-waning-crescent'),
  themeBlush:     M('heart-outline'),
  themeMidnight:  M('star-four-points-outline'),
  themeEmerald:   M('leaf'),
};

// ── PACK: PURPLE ─ AntDesign (clean lines with playful accents) ────────────
const PURPLE_ICON_MAP: Record<ThemeIconKey, IconDef> = {
  home:           A('home'),
  tasks:          A('check-square'),
  notes:          A('book'),
  profile:        A('smile'),
  add:            A('plus-circle'),
  calendar:       A('calendar'),
  checkCircle:    A('check-circle'),
  sparkles:       A('star'),
  user:           A('user'),
  layers:         A('account-book'),
  target:         A('aim'),
  award:          A('trophy'),
  star:           A('star'),
  clock:          A('clock-circle'),
  pieChart:       A('pie-chart'),
  settings:       A('setting'),
  arrowRight:     A('right'),
  bookOpen:       A('book'),
  helpCircle:     A('question-circle'),
  stressMap:      A('line-chart'),
  weeklySummary:  A('bar-chart'),
  leaderboard:    A('crown'),
  themeLight:     A('sun'),
  themeDark:      A('moon'),
  themeBlush:     A('heart'),
  themeMidnight:  A('star'),
  themeEmerald:   A('cloud'),
};

// Public icon-pack registry. Indexed by ThemePackId so the renderer can pick
// the right family without a switch.
export const PACK_ICON_MAPS: Record<Exclude<ThemePackId, 'none'>, Record<ThemeIconKey, IconDef>> = {
  cat: CAT_ICON_MAP,
  mono: MONO_ICON_MAP,
  spider: SPIDER_ICON_MAP,
  purple: PURPLE_ICON_MAP,
};

/**
 * Resolve an icon for the active theme pack. When no pack is active (or pack
 * value is 'none'), all five free themes share `DEFAULT_ICON_MAP` so the look
 * stays unified across light/dark/blush/midnight/emerald.
 */
export function resolveIconDef(key: ThemeIconKey, pack?: ThemePackId): IconDef {
  if (pack && pack !== 'none') {
    const map = PACK_ICON_MAPS[pack];
    if (map?.[key]) return map[key];
  }
  return DEFAULT_ICON_MAP[key] ?? F('help-circle');
}

/**
 * Legacy compatibility: a single shared icon map for any free theme. We keep
 * the per-ThemeId shape so older imports still type-check, but every entry now
 * points at the same DEFAULT map (the user-requested "all free themes use the
 * same icon" rule).
 */
export const THEME_ICON_MAP: Record<ThemeId, Record<ThemeIconKey, IconDef>> = {
  light:    DEFAULT_ICON_MAP,
  dark:     DEFAULT_ICON_MAP,
  blush:    DEFAULT_ICON_MAP,
  midnight: DEFAULT_ICON_MAP,
  emerald:  DEFAULT_ICON_MAP,
};

export const THEME_DISPLAY_ICON_KEY: Record<ThemeId, ThemeIconKey> = {
  light: 'themeLight',
  dark: 'themeDark',
  blush: 'themeBlush',
  midnight: 'themeMidnight',
  emerald: 'themeEmerald',
};
