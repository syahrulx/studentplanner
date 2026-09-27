/**
 * Run: npx --yes tsx tests/lockScreenGeometry.test.ts
 *
 * The lock screen card is fitted with arithmetic, not onLayout, so the render
 * host can decide which rows fit before an offscreen capture and the Studio
 * preview trims exactly like the picture. These tests pin that arithmetic to
 * the numbers in the design spec (§3.4, §4.2, §5), because the templates draw
 * with the same numbers: if one side drifts, rows get clipped on the lock
 * screen. A few palette rules ride along at the end.
 */
import assert from 'node:assert/strict';

import { MONO_THEME_OVERRIDE, THEMES, type ThemePalette } from '../constants/Themes';
import type * as GeometryModule from '../src/lib/lockScreen/lockScreenGeometry';
import type * as PaletteModule from '../src/lib/lockScreen/lockScreenPalette';
import {
  DEFAULT_LOCK_SCREEN_CONFIG,
  type LockClassRow,
  type LockScreenConfig,
  type LockScreenDayModel,
  type LockTaskRow,
  type LockWeekCell,
} from '../src/lib/lockScreen/types';

// react-native's entry point is Flow, which tsx can't load. Geometry only reads
// the platform and the screen size from it, so stand those in before loading.
const screen = { width: 393, height: 852, scale: 3 };
const platform = { OS: 'ios' };
require.cache[require.resolve('react-native')] = {
  exports: {
    Platform: platform,
    Dimensions: { get: () => ({ width: screen.width, height: screen.height }) },
    PixelRatio: { get: () => screen.scale },
  },
  loaded: true,
} as unknown as NodeJS.Module;

const {
  LOCK_METRICS,
  clampTopFrac,
  fitModel,
  getLockCanvasSize,
  lockStripHeight,
  lockWeekColumnWidth,
  maxPanelHeight,
  measurePanel,
  recommendedTopFrac,
}: typeof GeometryModule = require('../src/lib/lockScreen/lockScreenGeometry');
const { LOCK_GRADIENTS, LOCK_GRADIENT_ORDER, lockGradientLayers, resolveLockInk, themeGradient }:
  typeof PaletteModule = require('../src/lib/lockScreen/lockScreenPalette');

const H = 852;

function near(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, got ${actual}`);
}

function config(patch: Partial<LockScreenConfig> = {}): LockScreenConfig {
  return {
    ...DEFAULT_LOCK_SCREEN_CONFIG,
    ...patch,
    show: { ...DEFAULT_LOCK_SCREEN_CONFIG.show, ...patch.show },
  };
}

function classRow(i: number, room: string | null = null): LockClassRow {
  const h = String(8 + i).padStart(2, '0');
  return {
    key: `c${i}`,
    start: `${h}:00`,
    end: `${h}:50`,
    label: `SUB${i}`,
    name: null,
    room,
    color: '#7C3AED',
    onColor: '#ffffff',
  };
}

function taskRow(i: number): LockTaskRow {
  return { key: `t${i}`, title: `Task ${i}`, trailing: '5:00 PM', color: '#F472B6' };
}

function week(chipsPerDay: number): LockWeekCell[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dateISO: `2026-09-${String(28 + i).padStart(2, '0')}`,
    dayShort: 'MON',
    initial: 'M',
    dayNum: 28 + i,
    isFocus: i === 1,
    isPast: i < 1,
    chips: Array.from({ length: chipsPerDay }, (_, c) => ({
      label: `SUB${c}`,
      color: '#7C3AED',
      onColor: '#ffffff',
    })),
    hasClasses: chipsPerDay > 0,
    firstColor: chipsPerDay > 0 ? '#7C3AED' : null,
  }));
}

function day(
  opts: { classes?: number; tasks?: number; room?: string | null; chips?: number } = {},
): LockScreenDayModel {
  return {
    kind: 'day',
    dateISO: '2026-09-29',
    weekday: 2,
    headerDate: 'TUE · 29 SEP',
    glanceDate: 'TUE 29 SEP',
    weekLabel: 'WEEK 5',
    noClassesPeriod: false,
    classes: Array.from({ length: opts.classes ?? 0 }, (_, i) => classRow(i, opts.room ?? null)),
    tasks: Array.from({ length: opts.tasks ?? 0 }, (_, i) => taskRow(i)),
    overdueCount: 0,
    next: null,
    week: week(opts.chips ?? 0),
    weekRange: '28 SEP – 4 OCT',
    asOf: 'as of Mon 11:40 PM',
    uses24h: false,
  };
}

function fallback(chips: number): LockScreenDayModel {
  return {
    ...day({ chips }),
    kind: 'fallback',
    dateISO: null,
    weekday: -1,
    headerDate: '',
    glanceDate: '',
    weekLabel: null,
    weekRange: '',
  };
}

// ─── Canvas size (§4.1) ──────────────────────────────────────────────────────

{
  const size = getLockCanvasSize();
  assert.deepEqual(size, { W: 393, H: 852, scale: 3, s: 1, pixelW: 1179, pixelH: 2556 });

  // Landscape at launch still gives a portrait canvas.
  Object.assign(screen, { width: 932, height: 430, scale: 3 });
  const landscape = getLockCanvasSize();
  assert.equal(landscape.W, 430);
  assert.equal(landscape.H, 932);
  near(landscape.s, 430 / 393, 's scales from the 393 pt design width');
  assert.equal(landscape.pixelW, 1290);
  Object.assign(screen, { width: 393, height: 852, scale: 3 });
}

// ─── Shared metrics (§4.2, §5) ───────────────────────────────────────────────

{
  assert.equal(LOCK_METRICS.today.chrome, 84, 'Today chrome is (14+22+10+12+14+12)s');
  assert.equal(LOCK_METRICS.week.chrome, 80, 'Week chrome is (14+18+10+12+14+12)s');
  assert.equal(LOCK_METRICS.today.dueBlockH, 37, 'due block is divider + margins + label');
  assert.equal(LOCK_METRICS.today.overflowIndent, 65, 'overflow line lines up with the labels');
  assert.equal(LOCK_METRICS.week.summaryTopH, 21);
  assert.ok(Object.isFrozen(LOCK_METRICS.today.caps.tall), 'metrics are frozen all the way down');
  near(lockWeekColumnWidth(393, 1), (393 - 32 - 32 - 24) / 7, 'week column width');
  assert.equal(lockStripHeight(3, false, 1), 12 + 14 + 26 + 6 + 3 * 18 + 2 * 3);
  assert.equal(lockStripHeight(3, true, 1), 12 + 14 + 6 + 3 * 18 + 2 * 3, 'fallback has no date row');
  assert.equal(lockStripHeight(0, false, 1), 12 + 14 + 26 + 6 + 18, 'an empty week keeps one slot');
}

// ─── Presets and clamping (§3.4) ─────────────────────────────────────────────

{
  near(recommendedTopFrac('standard'), 0.312, 'standard recommended');
  near(recommendedTopFrac('widgets'), 0.372, 'widgets recommended');
  near(recommendedTopFrac('bigClock'), 0.422, 'big clock recommended');
  near(recommendedTopFrac('compact'), 0.172, 'compact recommended');

  const standard = config({ top: 'standard' });
  const big = config({ top: 'bigClock' });
  near(clampTopFrac(0, standard, 300, H), 0.3, 'never above the clock area');
  near(clampTopFrac(1, standard, 300, H), 0.86 - 300 / H, 'bottom stays above the buttons');
  near(clampTopFrac(0.5, standard, 300, H), 0.5, 'inside the zone is untouched');
  near(clampTopFrac(0, big, 100, H), 0.41, 'big clock pushes the card lower');
  near(clampTopFrac(1, big, 100, H), 0.78 - 100 / H, 'big clock raises the bottom limit');
  near(clampTopFrac(0.5, big, 400, H), 0.41, 'a card taller than the zone keeps the top limit');
  near(clampTopFrac(Number.NaN, standard, 300, H), 0.312, 'a corrupt value falls back to recommended');

  // The drag clamp reserves the tallest day, so every day fits at the lowest spot.
  const cfg = config({ size: 'tall' });
  const days = [day({ classes: 1 }), day({ classes: 5, tasks: 3 }), day({ tasks: 2 })];
  const tallest = maxPanelHeight(days, cfg, 1);
  assert.equal(tallest, measurePanel('today', days[1], cfg, 1));
  // Rounded up to 3 decimals: worse than the Studio's own rounding of the stored value.
  const lowest = Math.ceil(clampTopFrac(1, cfg, tallest, H) * 1000) / 1000;
  for (const d of days) {
    const fit = fitModel(d, { ...cfg, topFrac: lowest }, H, 1);
    assert.equal(fit.hiddenClasses + fit.hiddenTasks, 0, 'nothing is cut at the clamped spot');
    assert.ok(fit.topPx + fit.panelH <= 0.86 * H + 1, 'and the card ends above the buttons');
  }

  // Android ignores the presets: one fixed band.
  platform.OS = 'android';
  near(clampTopFrac(0, big, 0, H), 0.25, 'Android top limit');
  near(clampTopFrac(1, big, 0, H), 0.9, 'Android bottom limit');
  near(recommendedTopFrac('bigClock'), 0.262, 'Android recommended');
  platform.OS = 'ios';
}

// ─── Today fitting (§4.2) ────────────────────────────────────────────────────

{
  // Plenty of room: nothing trimmed, and the same model object comes back.
  const model = day({ classes: 3, tasks: 2 });
  const fit = fitModel(model, config(), H, 1);
  assert.equal(fit.model, model);
  assert.equal(fit.hiddenClasses, 0);
  assert.equal(fit.hiddenTasks, 0);
  assert.equal(fit.panelH, 84 + 3 * 36 + 37 + 2 * 28);
  near(fit.topPx, 0.312 * H, 'unset topFrac sits at the recommended spot');
  assert.equal(fit.size, 'medium');
  assert.equal(fit.roomRows, false);
}

{
  // Caps: medium draws at most 4 classes and 3 tasks, with overflow lines.
  const model = day({ classes: 6, tasks: 5 });
  assert.equal(measurePanel('today', model, config(), 1), 84 + 4 * 36 + 18 + 37 + 3 * 28 + 18);
  const fit = fitModel(model, config(), H, 1);
  assert.equal(fit.model.classes.length, 4);
  assert.equal(fit.model.tasks.length, 3);
  assert.equal(fit.hiddenClasses, 2, 'hidden classes feed "+2 more · ends …"');
  assert.equal(fit.hiddenTasks, 2);
  assert.equal(fit.lastClassEnd, '13:50', 'the end time comes from the untrimmed day');
  assert.equal(fit.dueCount, 5);
}

{
  // Tight spot (top at 0.5 H, bottom limit 0.86 H): tasks go before classes.
  // Room for the body: 0.86·852 − 426 + 1 slack − 84 chrome = 223.72.
  const tight = config({ size: 'tall', topFrac: 0.5 });

  const fewClasses = fitModel(day({ classes: 3, tasks: 4 }), tight, H, 1);
  // 3·36 + 37 + 2·28 + 18 = 219 fits once tasks are down to 2.
  assert.equal(fewClasses.model.classes.length, 3, 'classes are kept while tasks can go');
  assert.equal(fewClasses.model.tasks.length, 2);
  assert.equal(fewClasses.hiddenTasks, 2);
  assert.equal(fewClasses.panelH, 84 + 219);

  const busy = fitModel(day({ classes: 6, tasks: 4 }), tight, H, 1);
  // Tasks drop to 1 first (299), then classes to 3: 3·36 + 18 + 37 + 28 + 18 = 209.
  assert.equal(busy.model.tasks.length, 1, 'one task stays until classes are trimmed');
  assert.equal(busy.model.classes.length, 3);
  assert.equal(busy.hiddenClasses, 3);
  assert.equal(busy.hiddenTasks, 3);
  assert.equal(busy.panelH, 84 + 209);
  assert.ok(busy.topPx + busy.panelH <= 0.86 * H + 1);
  assert.equal(busy.size, 'tall', 'trimming inside the size is enough here');
}

{
  // Rooms: 44s rows only when rooms are on and the day has one.
  const withRoom = day({ classes: 3, room: 'DK1' });
  assert.equal(fitModel(withRoom, config({ show: { tasks: true, rooms: true, weekNo: true } }), H, 1).panelH, 84 + 3 * 44);
  assert.equal(fitModel(withRoom, config(), H, 1).panelH, 84 + 3 * 36, 'rooms off keeps 36s rows');
  const roomless = fitModel(day({ classes: 3 }), config({ show: { tasks: true, rooms: true, weekNo: true } }), H, 1);
  assert.equal(roomless.roomRows, false);
}

{
  // Tasks switched off aren't "hidden": no due block, nothing counted.
  const fit = fitModel(day({ classes: 2, tasks: 5 }), config({ show: { tasks: false, rooms: false, weekNo: true } }), H, 1);
  assert.equal(fit.panelH, 84 + 2 * 36);
  assert.equal(fit.hiddenTasks, 0);
  assert.equal(fit.model.tasks.length, 5);
}

{
  // An empty day draws the 52s block; everything scales with s.
  const s = 430 / 393;
  assert.equal(measurePanel('today', day(), config(), 1), 84 + 52);
  near(measurePanel('today', day({ classes: 3, tasks: 2 }), config(), s), 285 * s, 'heights scale with s');
}

// ─── Week fitting and the size step-down (§4.2) ──────────────────────────────

{
  const busyWeek = day({ classes: 4, tasks: 3, chips: 5 });
  const tall = config({ template: 'week', size: 'tall', top: 'bigClock' });
  const strip = (n: number) => 12 + 14 + 26 + 6 + n * 18 + (n - 1) * 3;

  // Untrimmed tall: 3 class rows, 2 task rows and an overflow line under a 5-row strip.
  assert.equal(measurePanel('week', busyWeek, tall, 1), 80 + strip(5) + 21 + 3 * 30 + 2 * 26 + 18);

  // At the recommended spot (avail 306.02): rows shrink to 1 class and no
  // tasks (309) before the strip loses a chip row (288).
  const rec = fitModel(busyWeek, tall, H, 1);
  assert.equal(rec.size, 'tall');
  assert.equal(rec.summary, 'rows');
  assert.equal(rec.model.classes.length, 1);
  assert.equal(rec.model.tasks.length, 0);
  assert.equal(rec.hiddenClasses, 3);
  assert.equal(rec.hiddenTasks, 3);
  assert.equal(rec.chipRows, 4);
  assert.equal(rec.dueCount, 3, 'the due pill still counts every task');
  assert.equal(rec.panelH, 80 + strip(4) + 21 + 30 + 18);

  // Lower (avail 242.97): the leanest tall layout is 246, so it steps down to
  // the medium two-line summary with 2 chip rows (238).
  const medium = fitModel(busyWeek, { ...tall, topFrac: 0.496 }, H, 1);
  assert.equal(medium.size, 'medium');
  assert.equal(medium.summary, 'lines');
  assert.equal(medium.chipRows, 2);
  assert.equal(medium.panelH, 80 + strip(2) + 21 + 20 + 20);
  assert.equal(medium.hiddenClasses, 0, 'the medium summary never cuts rows');
  assert.equal(medium.model, busyWeek);

  // Lower still (avail 231.04): only the bare strip fits.
  const short = fitModel(busyWeek, { ...tall, topFrac: 0.51 }, H, 1);
  assert.equal(short.size, 'short');
  assert.equal(short.summary, 'none');
  assert.equal(short.chipRows, 2);
  assert.equal(short.panelH, 80 + strip(2));

  // A stored spot below what even the leanest card allows moves the card up.
  const tooLow = fitModel(busyWeek, { ...tall, topFrac: 0.7 }, H, 1);
  near(tooLow.topPx, (0.78 - (80 + strip(2)) / H) * H, 'card is lifted just enough');
}

{
  // Break weeks and empty timetables have no chips but keep one slot.
  const empty = day({ chips: 0 });
  assert.equal(measurePanel('week', empty, config({ template: 'week', size: 'short' }), 1), 80 + 76);
  // The medium due line disappears with tasks switched off.
  const noTasks = config({ template: 'week', show: { tasks: false, rooms: false, weekNo: true } });
  assert.equal(measurePanel('week', day({ chips: 1 }), noTasks, 1), 80 + (12 + 14 + 26 + 6 + 18) + 21 + 20);
}

// ─── Fallback and Glance ─────────────────────────────────────────────────────

{
  const fb = fallback(5);
  const dateless = 12 + 14 + 6 + 3 * 18 + 2 * 3;
  assert.equal(measurePanel('today', fb, config(), 1), 84 + dateless, 'Today fallback is the dateless strip');
  assert.equal(measurePanel('week', fb, config({ template: 'week' }), 1), 80 + dateless);
  const fit = fitModel(fb, config({ template: 'week' }), H, 1);
  assert.equal(fit.summary, 'none', 'the fallback never has a summary');
  assert.equal(fit.chipRows, 3);

  const glanceCfg = config({ template: 'glance', size: 'tall' });
  const busy = day({ classes: 6, tasks: 6, chips: 5 });
  const glance = fitModel(busy, glanceCfg, H, 1);
  assert.equal(glance.panelH, 104, 'Glance is always 104s');
  assert.equal(glance.model, busy, 'Glance never trims');
  assert.equal(glance.chipRows, 0);
  near(glance.topPx, 0.312 * H, 'Glance sits under the clock by default');
}

// ─── Palette ─────────────────────────────────────────────────────────────────

{
  assert.deepEqual([...LOCK_GRADIENT_ORDER].sort(), Object.keys(LOCK_GRADIENTS).sort());
  assert.equal(LOCK_GRADIENTS.dusk.name, 'Dusk');

  const layers = lockGradientLayers(LOCK_GRADIENTS.dusk.c);
  assert.deepEqual(layers[1].colors, ['#F472B6D9', '#F472B600']);
  assert.deepEqual(layers[2].colors, ['#FB923C00', '#FB923CB3']);

  const nearWhite: ThemePalette = { ...THEMES.light, primary: '#F0F0F0' };
  assert.equal(resolveLockInk('light', nearWhite, false).accent, '#0B0C0E', 'a white accent turns ink on light glass');
  assert.equal(resolveLockInk('dark', nearWhite, false).accent, '#F0F0F0', 'but stays on dark glass');
  assert.equal(resolveLockInk('dark', THEMES.light, false).accent, '#2563EB');
  assert.equal(resolveLockInk('dark', THEMES.light, false).onAccent, '#ffffff');

  const spider = { ...THEMES.dark, primary: '#b91c1c' };
  const mono = resolveLockInk('dark', spider, true);
  assert.equal(mono.accent, '#FFFFFF', 'dark minimal packs use white on dark glass');
  assert.equal(mono.onAccent, '#0a0a0a');
  assert.equal(resolveLockInk('light', spider, true).accent, '#0B0C0E');
  assert.equal(resolveLockInk('light', spider, true).text1, 'rgba(11,12,14,0.94)');

  assert.deepEqual(themeGradient(THEMES.light), ['#2563EB', '#60A5FA', '#1D4ED8', '#F8FAFC']);
  assert.equal(themeGradient(MONO_THEME_OVERRIDE)[0], '#000000', 'Mono is not an all-white picture');
  assert.equal(themeGradient({ ...THEMES.dark, primary: '#abc' })[0], '#AABBCC', 'short hex is expanded');
}

console.log('lockScreenGeometry: all assertions passed');
