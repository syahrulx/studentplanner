import { Dimensions, PixelRatio, Platform } from 'react-native';

import { lockClassDetail } from './lockScreenFormat';

import type {
  LockScreenConfig,
  LockScreenDayModel,
  LockSize,
  LockTemplateId,
  LockTopPreset,
} from './types';

/**
 * Where the lock screen card sits and how much of a day fits in it.
 *
 * Fitting is arithmetic rather than onLayout: the render host has to know which
 * rows fit before it captures an offscreen view, and the Studio preview has to
 * trim exactly like the captured picture. That only holds if the templates draw
 * every block at the heights in LOCK_METRICS (× s) and size the panel to
 * fit.panelH, so these numbers are the single source for both sides.
 *
 * Units: every length in LOCK_METRICS is in design points on a 393 pt wide
 * screen; multiply by s = W / 393. Vertical positions (topPx, the safe zones)
 * are fractions of the screen height H.
 */

const panel = {
  /** Today and Week cards: left 16s, width W − 32s. */
  insetX: 16,
  padTop: 14,
  padBottom: 12,
  padX: 16,
  radius: 28,
  shadowRadius: 24,
  shadowOffsetY: 10,
} as const;

/**
 * Divider lines are drawn at dividerH·s, not hairlineWidth, so the measured
 * height stays exact on every screen width.
 */
const dividerH = 1;

const todayParts = {
  headerH: 22,
  headerGap: 10,
  /** Class row without a room line / with one (only when rooms are shown and D has any). */
  classRowH: 36,
  classRowRoomH: 44,
  timeColW: 52,
  barW: 3,
  barGap: 10,
  /** Replaces the class rows when D has none (free day, break week, "Next:" line). */
  emptyH: 52,
  /** "+3 more · ends 6:00 PM" under the classes, and "+2 more" under the tasks. */
  overflowH: 18,
  /** Margin above and below the divider that opens the due block. */
  dueGap: 10,
  dueLabelH: 16,
  taskRowH: 28,
  footerGap: 12,
  footerH: 14,
  /** Rows drawn before trimming: [classes, tasks]. */
  caps: { short: [2, 1], medium: [4, 3], tall: [6, 4] },
} as const;

const weekParts = {
  headerH: 18,
  headerGap: 10,
  /** Seven columns: colW = (W − 2·insetX·s − 2·padX·s − 6·colGap·s) / 7. */
  colGap: 4,
  colPadV: 6,
  colRadius: 14,
  dayShortH: 14,
  /** Date circle row; omitted in the fallback, which has no dates. */
  dateH: 26,
  chipsGap: 6,
  chipH: 18,
  chipGap: 3,
  /** Chip width is colW − chipInset·s. */
  chipInset: 6,
  /**
   * A column with no classes still occupies one chip slot; its 4s dot sits
   * 7s down, centred in the slot. So a week with no chips at all (break
   * weeks, empty timetable) is exactly one slot tall.
   */
  emptySlotH: 18,
  /** Chip rows per column before trimming; the last visible chip becomes "+n". */
  chipRows: { short: 2, medium: 3, tall: 5 },
  /** Trimming never goes below this many chip rows. */
  minChipRows: 2,
  /** Margin above and below the divider that opens the summary. */
  summaryGap: 10,
  /** Medium summary lines, and the one-line "No classes" / "Nothing due" in tall. */
  lineH: 20,
  /** Tall summary: class rows, task rows, and the overflow line after them. */
  rowH: 30,
  rowTimeColW: 58,
  maxRows: 3,
  taskRowH: 26,
  maxTaskRows: 2,
  overflowH: 18,
  footerGap: 12,
  footerH: 14,
} as const;

const glance = {
  /** Glance card: left 24s, width W − 48s, fixed height. */
  insetX: 24,
  height: 104,
  radius: 24,
  padV: 14,
  padX: 16,
} as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const LOCK_METRICS = deepFreeze({
  /** Screen width the design numbers are drawn at. */
  designWidth: 393,
  dividerH,
  panel,
  today: {
    ...todayParts,
    /** Everything but the body: padding, header, gaps, footer (84). */
    chrome:
      panel.padTop +
      todayParts.headerH +
      todayParts.headerGap +
      todayParts.footerGap +
      todayParts.footerH +
      panel.padBottom,
    /** Divider with its margins plus the "DUE TODAY" label (37). */
    dueBlockH: todayParts.dueGap * 2 + dividerH + todayParts.dueLabelH,
    /** Left inset of the class overflow line, aligned with the row labels (65). */
    overflowIndent: todayParts.timeColW + todayParts.barW + todayParts.barGap,
  },
  week: {
    ...weekParts,
    /** Everything but the strip and summary (80). */
    chrome:
      panel.padTop +
      weekParts.headerH +
      weekParts.headerGap +
      weekParts.footerGap +
      weekParts.footerH +
      panel.padBottom,
    /** Divider with its margins, above either summary (21). */
    summaryTopH: weekParts.summaryGap * 2 + dividerH,
  },
  glance,
} as const);

/** What the Week template draws under its strip. */
export type LockWeekSummary = 'none' | 'lines' | 'rows';

export interface LockFit {
  /** Copy of the model with classes/tasks cut to the rows that are drawn. */
  model: LockScreenDayModel;
  /** Rows cut by fitting (for the "+n more" lines). Tasks hidden by show.tasks don't count. */
  hiddenClasses: number;
  hiddenTasks: number;
  /** Panel top in pt. */
  topPx: number;
  /** Panel height in pt; templates size the panel to exactly this. */
  panelH: number;
  /** Size actually drawn, after the auto step-down. Can be smaller than config.size. */
  size: LockSize;
  /** Chip rows per column in the week strip (Week template and Today fallback), else 0. */
  chipRows: number;
  /** Week template only; 'none' for the other templates and the fallback. */
  summary: LockWeekSummary;
  /** Today class rows are the 44s kind with a room line. */
  roomRows: boolean;
  /** Latest class end on the day ('HH:MM'), from the untrimmed model, for "ends 6:00 PM". */
  lastClassEnd: string | null;
  /** Tasks due on the day before trimming (the Week due pill, the Glance ring). */
  dueCount: number;
}

export interface LockSafeZone {
  minTop: number;
  maxBottom: number;
}

/** Fractions of H that the card must stay between, per what sits at the top of the lock screen. */
export const TOP_PRESETS: Readonly<Record<LockTopPreset, LockSafeZone>> = deepFreeze({
  standard: { minTop: 0.3, maxBottom: 0.86 },
  widgets: { minTop: 0.36, maxBottom: 0.86 },
  bigClock: { minTop: 0.41, maxBottom: 0.78 },
  // Only offered on iOS 27+, where the time can sit inline in the top row.
  compact: { minTop: 0.16, maxBottom: 0.86 },
});

// Android has no presets: its lock screens vary too much by maker to model, so
// one conservative band keeps clear of the clock and the shortcut buttons.
// iPad gets it too: the presets are iPhone lock screen layouts (the iPad has
// no flashlight and camera buttons), and there the wallpaper is only saved.
const FIXED_ZONE: LockSafeZone = Object.freeze({ minTop: 0.25, maxBottom: 0.9 });

/** Snap target just under the clock area. */
const RECOMMENDED_OFFSET = 0.012;

// A stored topFrac is rounded to 3 decimals, which can land up to 0.4 pt below
// the lowest allowed spot. Without this slack that rounding alone would cut a
// row that the drag clamp had room for.
const FIT_SLACK_PT = 1;

const SIZES_DESC: readonly LockSize[] = ['tall', 'medium', 'short'];

/** The safe zone on this platform. */
export function lockSafeZone(top: LockTopPreset): LockSafeZone {
  if (Platform.OS === 'android' || (Platform.OS === 'ios' && Platform.isPad)) return FIXED_ZONE;
  return TOP_PRESETS[top] ?? TOP_PRESETS.standard;
}

export function getLockCanvasSize(): {
  W: number;
  H: number;
  scale: number;
  s: number;
  pixelW: number;
  pixelH: number;
} {
  // 'screen', not 'window': the picture covers the whole display, and the
  // capture comes out at points × scale, which is the wallpaper's pixel size.
  const { width, height } = Dimensions.get('screen');
  const W = Math.min(width, height);
  const H = Math.max(width, height);
  const scale = PixelRatio.get();
  return {
    W,
    H,
    scale,
    s: W / LOCK_METRICS.designWidth,
    pixelW: Math.round(W * scale),
    pixelH: Math.round(H * scale),
  };
}

export function recommendedTopFrac(top: LockTopPreset): number {
  return lockSafeZone(top).minTop + RECOMMENDED_OFFSET;
}

/** Week column width in pt. */
export function lockWeekColumnWidth(W: number, s: number): number {
  const { panel: p, week } = LOCK_METRICS;
  return (W - (2 * p.insetX + 2 * p.padX + 6 * week.colGap) * s) / 7;
}

/**
 * Height in pt of the week strip's columns. Templates can give the strip this
 * height outright; it is the number measurePanel uses.
 */
export function lockStripHeight(chipRows: number, fallback: boolean, s: number): number {
  return stripUnits(chipRows, fallback) * s;
}

function stripUnits(chipRows: number, fallback: boolean): number {
  const w = LOCK_METRICS.week;
  const chips = chipRows > 0 ? chipRows * w.chipH + (chipRows - 1) * w.chipGap : w.emptySlotH;
  return w.colPadV * 2 + w.dayShortH + (fallback ? 0 : w.dateH) + w.chipsGap + chips;
}

/** One way to lay a panel out. Heights are in design units. */
interface Layout {
  size: LockSize;
  /** Class rows drawn: Today rows, or the Week tall summary rows. */
  classes: number;
  tasks: number;
  chipRows: number;
  summary: LockWeekSummary;
  roomRows: boolean;
  height: number;
}

function normalizedSize(size: LockSize): LockSize {
  return SIZES_DESC.includes(size) ? size : 'medium';
}

function maxChips(model: LockScreenDayModel): number {
  return model.week.reduce((max, cell) => Math.max(max, cell.chips.length), 0);
}

/** Today and Week-tall draw class and task rows; those are trimmed first. */
function hasRows(template: LockTemplateId, model: LockScreenDayModel, l: Layout): boolean {
  return (template === 'today' && model.kind === 'day') || l.summary === 'rows';
}

/** The Week template and the Today fallback draw the week strip. */
function hasStrip(template: LockTemplateId, model: LockScreenDayModel): boolean {
  return template === 'week' || (template === 'today' && model.kind === 'fallback');
}

/**
 * What each body is made of, which the templates must mirror:
 *
 * Today: class rows (36s, or 44s with rooms) or the 52s empty block; an
 * overflow line when a class row was cut; then, only when at least one task
 * row is drawn, the due block (divider, label), the task rows and an overflow
 * line when a task row was cut. The fallback body is the dateless strip.
 *
 * Week: the strip; then 'lines' = divider block, the first-class line and,
 * with show.tasks, the due line; or 'rows' = divider block, class rows (one
 * line instead when the day has none), with show.tasks the task rows (one
 * "Nothing due" line instead when dueCount is 0), and one overflow line when
 * any class or task row was cut.
 */
function measureUnits(
  template: LockTemplateId,
  model: LockScreenDayModel,
  config: LockScreenConfig,
  l: Layout,
): number {
  if (template === 'glance') return LOCK_METRICS.glance.height;
  const fallback = model.kind === 'fallback';

  if (template === 'today') {
    const m = LOCK_METRICS.today;
    // The Today fallback swaps its body for the dateless week strip.
    if (fallback) return m.chrome + stripUnits(l.chipRows, true);
    const rowH = l.roomRows ? m.classRowRoomH : m.classRowH;
    let h = l.classes > 0 ? l.classes * rowH : m.emptyH;
    if (model.classes.length > l.classes) h += m.overflowH;
    if (l.tasks > 0) {
      h += m.dueBlockH + l.tasks * m.taskRowH;
      if (model.tasks.length > l.tasks) h += m.overflowH;
    }
    return m.chrome + h;
  }

  const w = LOCK_METRICS.week;
  let h = w.chrome + stripUnits(l.chipRows, fallback);
  if (l.summary === 'lines') {
    h += w.summaryTopH + w.lineH + (config.show.tasks ? w.lineH : 0);
  } else if (l.summary === 'rows') {
    h += w.summaryTopH + (l.classes > 0 ? l.classes * w.rowH : w.lineH);
    if (config.show.tasks) {
      if (l.tasks > 0) h += l.tasks * w.taskRowH;
      else if (model.tasks.length === 0) h += w.lineH;
    }
    const cutTasks = config.show.tasks && model.tasks.length > l.tasks;
    if (model.classes.length > l.classes || cutTasks) h += w.overflowH;
  }
  return h;
}

/** Removes one row or chip row, in the order the spec trims. False when nothing is left to cut. */
function trimOnce(template: LockTemplateId, model: LockScreenDayModel, l: Layout): boolean {
  if (hasRows(template, model, l)) {
    // Tasks go down to one first, then classes, then the last task: the due
    // count stays visible in the header pills either way.
    if (l.tasks > 1) {
      l.tasks--;
      return true;
    }
    if (l.classes > 1) {
      l.classes--;
      return true;
    }
    if (l.tasks === 1) {
      l.tasks = 0;
      return true;
    }
  }
  if (hasStrip(template, model) && l.chipRows > LOCK_METRICS.week.minChipRows) {
    l.chipRows--;
    return true;
  }
  return false;
}

/** Lays out at one size, trimming until the panel is at most `avail` design units tall. */
function layoutAt(
  template: LockTemplateId,
  model: LockScreenDayModel,
  config: LockScreenConfig,
  size: LockSize,
  avail: number,
): { layout: Layout; fits: boolean } {
  const l: Layout = {
    size,
    classes: 0,
    tasks: 0,
    chipRows: hasStrip(template, model)
      ? Math.min(maxChips(model), LOCK_METRICS.week.chipRows[size])
      : 0,
    summary: 'none',
    roomRows: false,
    height: 0,
  };
  if (template === 'week' && model.kind === 'day') {
    l.summary = size === 'tall' ? 'rows' : size === 'medium' ? 'lines' : 'none';
  }
  if (hasRows(template, model, l)) {
    const [capC, capT] =
      template === 'today'
        ? LOCK_METRICS.today.caps[size]
        : [LOCK_METRICS.week.maxRows, LOCK_METRICS.week.maxTaskRows];
    l.classes = Math.min(model.classes.length, capC);
    l.tasks = config.show.tasks ? Math.min(model.tasks.length, capT) : 0;
    l.roomRows =
      template === 'today' && model.classes.some((c) => lockClassDetail(c, config.show) != null);
  }

  l.height = measureUnits(template, model, config, l);
  while (l.height > avail && trimOnce(template, model, l)) {
    l.height = measureUnits(template, model, config, l);
  }
  return { layout: l, fits: l.height <= avail };
}

/**
 * Trims at config.size, then steps down (tall → medium → short) while the
 * panel still doesn't fit. For Week this is what drops the summary: tall rows
 * give way to the medium two-line summary before the strip is left alone.
 * When nothing fits, the leanest short layout comes back.
 */
function fitLayout(
  template: LockTemplateId,
  model: LockScreenDayModel,
  config: LockScreenConfig,
  avail: number,
): Layout {
  const start = normalizedSize(config.size);
  if (template === 'glance') return layoutAt(template, model, config, start, Infinity).layout;
  const sizes = SIZES_DESC.slice(SIZES_DESC.indexOf(start));
  for (let i = 0; ; i++) {
    const { layout, fits } = layoutAt(template, model, config, sizes[i], avail);
    if (fits || i === sizes.length - 1) return layout;
  }
}

/** Panel height in pt at config.size, untrimmed. */
export function measurePanel(
  template: LockTemplateId,
  model: LockScreenDayModel,
  config: LockScreenConfig,
  s: number,
): number {
  return layoutAt(template, model, config, normalizedSize(config.size), Infinity).layout.height * s;
}

/** Tallest panel across the given days at the current size: what the drag clamp reserves. */
export function maxPanelHeight(
  models: LockScreenDayModel[],
  config: LockScreenConfig,
  s: number,
): number {
  return models.reduce((max, m) => Math.max(max, measurePanel(config.template, m, config, s)), 0);
}

/**
 * Keeps the card below the clock area and its bottom above the flashlight and
 * camera buttons. When the panel is taller than the zone, the top wins and
 * fitModel trims the rows instead.
 */
export function clampTopFrac(
  frac: number,
  config: LockScreenConfig,
  panelMaxH: number,
  H: number,
): number {
  const { minTop, maxBottom } = lockSafeZone(config.top);
  const value = Number.isFinite(frac) ? frac : recommendedTopFrac(config.top);
  return Math.max(minTop, Math.min(value, maxBottom - panelMaxH / H));
}

export function fitModel(
  model: LockScreenDayModel,
  config: LockScreenConfig,
  H: number,
  s: number,
): LockFit {
  const { template } = config;
  const { maxBottom } = lockSafeZone(config.top);

  // The stored position was clamped against the tallest day when it was
  // dragged, but data can grow since. Only reserve room for this day's leanest
  // layout, so the card holds its place and loses rows rather than jumping up.
  const leanest = fitLayout(template, model, config, 0);
  const frac = config.topFrac ?? recommendedTopFrac(config.top);
  const topPx = H * clampTopFrac(frac, config, leanest.height * s, H);

  const layout = fitLayout(template, model, config, (maxBottom * H - topPx + FIT_SLACK_PT) / s);

  const sliced = hasRows(template, model, layout);
  const shownClasses = sliced ? layout.classes : model.classes.length;
  const shownTasks = sliced && config.show.tasks ? layout.tasks : model.tasks.length;
  const trimmed =
    shownClasses === model.classes.length && shownTasks === model.tasks.length
      ? model
      : {
          ...model,
          classes: model.classes.slice(0, shownClasses),
          tasks: model.tasks.slice(0, shownTasks),
        };

  const lastClassEnd = model.classes.reduce<string | null>(
    (latest, c) => (latest === null || c.end > latest ? c.end : latest),
    null,
  );

  return {
    model: trimmed,
    hiddenClasses: model.classes.length - shownClasses,
    hiddenTasks: model.tasks.length - shownTasks,
    topPx,
    panelH: layout.height * s,
    size: layout.size,
    chipRows: layout.chipRows,
    summary: layout.summary,
    roomRows: layout.roomRows,
    lastClassEnd,
    dueCount: model.tasks.length,
  };
}
