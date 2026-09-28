import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  LOCK_METRICS,
  lockStripHeight,
  lockWeekColumnWidth,
  type LockFit,
} from '@/src/lib/lockScreen/lockScreenGeometry';
import {
  fmtTime,
  fmtTimeInline,
  lockClassDetail,
  type LockTranslate,
} from '@/src/lib/lockScreen/lockScreenFormat';
import { lockScreenEmptyTitle, lockScreenNextLine } from '@/src/lib/lockScreen/lockScreenModel';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type {
  LockClassRow,
  LockScreenConfig,
  LockScreenDayModel,
  LockShowOptions,
  LockTaskRow,
  LockWeekCell,
} from '@/src/lib/lockScreen/types';

/**
 * The Week template (Izwan's strip, refined), plus the pieces every template
 * draws with. They live here rather than in their own module because the
 * strip is the one piece all of them share: Today's backup picture is this
 * strip, and Week's tall rows reuse Today's task row. One home avoids an
 * import cycle between the templates.
 *
 * Every vertical size comes from LOCK_METRICS, which is what fitModel
 * measured; a block drawn at any other height would make the card overflow
 * or leave a gap. Horizontal sizes and fonts are design points × s.
 */

// ─── Shared by all templates ─────────────────────────────────────────────────

export interface LockTemplateProps {
  /** Rows already cut to what fits, plus the numbers the cut lost. */
  fit: LockFit;
  /** The day before fitting: titles and counts must not change when rows are cut. */
  source: LockScreenDayModel;
  config: LockScreenConfig;
  ink: LockInk;
  W: number;
  s: number;
  T: LockTranslate;
}

/** SF's natural line height is ~1.19 em; 1.2 keeps each line box exact without shifting glyphs. */
const LINE = 1.2;
const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];
/** Clearance between a right-aligned class time and its colour bar (design pt). */
export const CLASS_TIME_GAP = 8;

/** The line box LockText gives a font size; for lining up a second line across columns. */
export function lockLineHeight(size: number): number {
  return size * LINE;
}

type Weight = '600' | '700' | '800';

interface LockTextProps extends Omit<TextProps, 'allowFontScaling' | 'numberOfLines'> {
  size: number;
  weight: Weight;
  color: string;
  tracking?: number;
  tabular?: boolean;
  /** Shrink to fit down to this scale before truncating. */
  shrink?: number;
}

/**
 * One line of canvas text. The picture must look the same for every student,
 * so Dynamic Type never applies, and a long line truncates instead of wrapping
 * into the next block.
 */
export function LockText({ size, weight, color, tracking, tabular, shrink, style, ...rest }: LockTextProps) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      ellipsizeMode="tail"
      adjustsFontSizeToFit={shrink != null}
      minimumFontScale={shrink}
      {...rest}
      style={[
        styles.text,
        {
          fontSize: size,
          lineHeight: lockLineHeight(size),
          fontWeight: weight,
          color,
          letterSpacing: tracking,
          fontVariant: tabular ? TABULAR : undefined,
        },
        style,
      ]}
    />
  );
}

/** A differently styled run inside a LockText (a class's name, a time's AM/PM). */
export function LockSpan({ style, ...rest }: Omit<TextProps, 'allowFontScaling'>) {
  return <Text allowFontScaling={false} {...rest} style={style} />;
}

/** '#RRGGBB' + alpha; any other colour form is used as it is, since appending would break it. */
function lockTint(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function LockPill({
  label,
  height,
  padX,
  size,
  tracking,
  bg,
  color,
}: {
  label: string;
  height: number;
  padX: number;
  size: number;
  tracking?: number;
  bg: string;
  color: string;
}) {
  return (
    <View
      style={[
        styles.pill,
        { height, borderRadius: height / 2, paddingHorizontal: padX, backgroundColor: bg },
      ]}
    >
      <LockText size={size} weight="800" color={color} tracking={tracking} tabular>
        {label}
      </LockText>
    </View>
  );
}

export function LockDot({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

function LockRing({
  size,
  border,
  color,
  style,
}: {
  size: number;
  border: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: border, borderColor: color },
        style,
      ]}
    />
  );
}

/** A divider with `gap` design pt above and below it. */
export function LockDivider({ ink, s, gap }: { ink: LockInk; s: number; gap: number }) {
  return (
    <View
      style={{
        height: LOCK_METRICS.dividerH * s,
        marginVertical: gap * s,
        backgroundColor: ink.divider,
      }}
    />
  );
}

/**
 * The gap above the footer. It also soaks up any sub-point rounding, so the
 * footer always sits on the card's bottom padding.
 */
export function LockFooterSpacer({ minHeight }: { minHeight: number }) {
  return <View style={{ flexGrow: 1, flexShrink: 0, minHeight }} />;
}

/** "Open Rencana to refresh", the backup picture's whole footer. */
export function LockFallbackFooter({ ink, s, T }: { ink: LockInk; s: number; T: LockTranslate }) {
  return (
    <View style={[styles.center, { height: LOCK_METRICS.today.footerH * s }]}>
      <LockText size={11 * s} weight="600" color={ink.text3} style={styles.stretchCenter}>
        {T('lsFallbackFooter')}
      </LockText>
    </View>
  );
}

// Class times: SF Pro widths in em, measured with CoreText at the sizes the
// templates use (heavy tabular digits 0.678, colon 0.36, AM/PM letters up to
// 0.93), rounded up so the estimate errs wide.
const EM = { digit: 0.68, colon: 0.36, space: 0.28, letter: 0.86 } as const;

function textEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    em += /\d/.test(ch) ? EM.digit : ch === ':' || ch === '.' ? EM.colon : ch === ' ' ? EM.space : EM.letter;
  }
  return em;
}

export type ClockParts = { main: string; suffix: string };

/**
 * Width of the time column for these rows. The design's 52s fits "08:00" but
 * not "10:30 AM" at 15s heavy, and 12-hour is what most students here use, so
 * the column grows to the widest time on the card. All rows share it, so the
 * colour bars and labels still line up.
 */
export function classTimeColumnWidth(
  times: ClockParts[],
  mainSize: number,
  suffixSize: number,
  minWidth: number,
  s: number,
  /** Other lines in the column (the end time under a 44s row) and their size. */
  extraTexts: string[] = [],
  extraSize = 0,
): number {
  let widest = 0;
  for (const t of times) {
    const w = textEm(t.main) * mainSize + (t.suffix ? (EM.space + textEm(t.suffix)) * suffixSize : 0);
    widest = Math.max(widest, w);
  }
  for (const text of extraTexts) widest = Math.max(widest, textEm(text) * extraSize);
  return Math.ceil(Math.max(minWidth, widest + CLASS_TIME_GAP * s));
}

/** "8:00" with a small "AM", right-aligned so the colons line up down the column. */
export function ClassTime({
  time,
  mainSize,
  suffixSize,
  weight,
  color,
  suffixColor,
}: {
  time: ClockParts;
  mainSize: number;
  suffixSize: number;
  weight: Weight;
  color: string;
  suffixColor: string;
}) {
  return (
    <LockText size={mainSize} weight={weight} color={color} tabular shrink={0.85} style={styles.right}>
      {time.main}
      {time.suffix ? (
        <LockSpan style={{ fontSize: suffixSize, fontWeight: '700', color: suffixColor }}>
          {` ${time.suffix}`}
        </LockSpan>
      ) : null}
    </LockText>
  );
}

const TASK_RING = 13;
const TASK_RING_GAP = 10;
/** Left inset of a task title (design pt), for lines that align with it. */
export const TASK_TEXT_INSET = TASK_RING + TASK_RING_GAP;

/** A due task: subject-coloured ring, title, and its time or course on the right. */
export function TaskLine({
  task,
  height,
  ink,
  s,
}: {
  task: LockTaskRow;
  height: number;
  ink: LockInk;
  s: number;
}) {
  return (
    <View style={[styles.row, { height }]}>
      <LockRing
        size={TASK_RING * s}
        border={1.5 * s}
        color={task.color}
        style={{ marginRight: TASK_RING_GAP * s }}
      />
      <LockText size={14 * s} weight="600" color={ink.text1} style={styles.flex}>
        {task.title}
      </LockText>
      {task.trailing ? (
        <LockText
          size={12 * s}
          weight="600"
          color={ink.text3}
          tabular
          style={[styles.trailing, { marginLeft: 8 * s }]}
        >
          {task.trailing}
        </LockText>
      ) : null}
    </View>
  );
}

// ─── Week strip ──────────────────────────────────────────────────────────────

function StripChip({
  label,
  bg,
  color,
  width,
  s,
}: {
  label: string;
  bg: string;
  color: string;
  width: number;
  s: number;
}) {
  const w = LOCK_METRICS.week;
  return (
    <View
      style={[
        styles.center,
        // Only a hair of padding: it keeps a code like "MAT183" inside the 0.8
        // shrink limit on a 393 pt screen, where more would truncate it.
        { width, height: w.chipH * s, borderRadius: 6 * s, backgroundColor: bg, paddingHorizontal: 1.5 * s },
      ]}
    >
      <LockText size={9.5 * s} weight="800" color={color} shrink={0.8} style={styles.stretchCenter}>
        {label}
      </LockText>
    </View>
  );
}

function StripColumn({
  cell,
  chipRows,
  fallback,
  width,
  height,
  ink,
  s,
}: {
  cell: LockWeekCell;
  chipRows: number;
  fallback: boolean;
  width: number;
  height: number;
  ink: LockInk;
  s: number;
}) {
  const w = LOCK_METRICS.week;
  const chipW = width - w.chipInset * s;
  // When a day has more classes than rows, its last row says how many are
  // left instead of showing one more.
  const overflowing = cell.chips.length > chipRows;
  const visible = overflowing ? cell.chips.slice(0, Math.max(0, chipRows - 1)) : cell.chips;
  const hidden = cell.chips.length - visible.length;

  return (
    <View
      style={[
        styles.column,
        {
          width,
          height,
          paddingVertical: w.colPadV * s,
          borderRadius: w.colRadius * s,
          backgroundColor: cell.isFocus ? ink.todayTint : undefined,
          opacity: cell.isPast ? 0.45 : 1,
        },
      ]}
    >
      <View style={[styles.center, { height: w.dayShortH * s }]}>
        <LockText
          size={10 * s}
          weight="800"
          tracking={0.4 * s}
          color={cell.isFocus ? ink.text1 : ink.text3}
        >
          {cell.dayShort}
        </LockText>
      </View>

      {fallback ? null : (
        <View style={[styles.center, { height: w.dateH * s }]}>
          {cell.isFocus ? (
            <View
              style={[
                styles.center,
                {
                  width: w.dateH * s,
                  height: w.dateH * s,
                  borderRadius: (w.dateH * s) / 2,
                  backgroundColor: ink.accent,
                },
              ]}
            >
              <LockText size={15 * s} weight="800" color={ink.onAccent} tabular>
                {cell.dayNum}
              </LockText>
            </View>
          ) : (
            <LockText size={17 * s} weight="800" color={ink.text1} tabular>
              {cell.dayNum}
            </LockText>
          )}
        </View>
      )}

      <View style={[styles.chips, { marginTop: w.chipsGap * s, rowGap: w.chipGap * s }]}>
        {visible.map((chip, i) => (
          <StripChip
            key={i}
            label={chip.label}
            bg={lockTint(chip.color, 'EB')}
            color={chip.onColor}
            width={chipW}
            s={s}
          />
        ))}
        {hidden > 0 ? (
          <StripChip label={`+${hidden}`} bg={ink.neutralChip} color={ink.text1} width={chipW} s={s} />
        ) : null}
        {cell.chips.length === 0 ? (
          <LockDot size={4 * s} color={ink.text3} style={{ opacity: 0.5, marginTop: 7 * s }} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Seven day columns in the student's week order. The backup picture drops the
 * date row and has no focus day, since it may be shown in any week.
 */
export function WeekStrip({
  cells,
  chipRows,
  fallback,
  ink,
  W,
  s,
}: {
  cells: LockWeekCell[];
  chipRows: number;
  fallback: boolean;
  ink: LockInk;
  W: number;
  s: number;
}) {
  const width = lockWeekColumnWidth(W, s);
  const height = lockStripHeight(chipRows, fallback, s);
  return (
    <View style={[styles.row, { height, columnGap: LOCK_METRICS.week.colGap * s }]}>
      {cells.map((cell, i) => (
        // Backup cells have no date, so the index is the only stable key.
        <StripColumn
          key={i}
          cell={cell}
          chipRows={chipRows}
          fallback={fallback}
          width={width}
          height={height}
          ink={ink}
          s={s}
        />
      ))}
    </View>
  );
}

// ─── Week summary ────────────────────────────────────────────────────────────

/** "No classes today · Next: Wed 8:00 AM · CSC301", or the break week's name. */
function noClassesLine(source: LockScreenDayModel, T: LockTranslate, show: LockShowOptions): string {
  const title = source.noClassesPeriod ? lockScreenEmptyTitle(source, T) : T('lsNoClasses');
  if (!source.next) return title;
  return `${title} · ${lockScreenNextLine(source.next, T, show)}`;
}

function SummaryLine({
  marker,
  text,
  weight,
  color,
  s,
}: {
  marker: React.ReactNode;
  text: string;
  weight: Weight;
  color: string;
  s: number;
}) {
  return (
    <View style={[styles.row, { height: LOCK_METRICS.week.lineH * s }]}>
      {marker}
      <LockText size={13 * s} weight={weight} color={color} style={styles.flex}>
        {text}
      </LockText>
    </View>
  );
}

/** Medium: the first class, then what's due, one line each. */
function LinesSummary({ source, config, ink, s, T }: LockTemplateProps) {
  const first = source.classes[0];
  const firstTask = source.tasks[0];
  const markerGap = { marginRight: 6 * s };

  let classLine: string;
  if (first) {
    classLine = T('lsFirstLine')
      .replace('{time}', fmtTimeInline(first.start, source.uses24h, T))
      .replace('{subject}', first.label);
    const detail = lockClassDetail(first, config.show);
    if (detail) classLine += ` · ${detail}`;
  } else {
    classLine = noClassesLine(source, T, config.show);
  }

  let taskLine = T('lsNothingDue');
  if (firstTask) {
    const count = T('lsDueCount').replace('{n}', String(source.tasks.length));
    taskLine = `${count} · ${firstTask.title}${firstTask.trailing ? ` ${firstTask.trailing}` : ''}`;
  }

  return (
    <>
      <LockDivider ink={ink} s={s} gap={LOCK_METRICS.week.summaryGap} />
      <SummaryLine
        marker={<LockDot size={8 * s} color={first ? first.color : ink.text3} style={markerGap} />}
        text={classLine}
        weight="700"
        color={ink.text1}
        s={s}
      />
      {config.show.tasks ? (
        <SummaryLine
          marker={
            <LockRing
              size={8 * s}
              border={1.5 * s}
              color={firstTask ? firstTask.color : ink.text3}
              style={markerGap}
            />
          }
          text={taskLine}
          weight="600"
          color={ink.text2}
          s={s}
        />
      ) : null}
    </>
  );
}

function WeekClassRow({
  row,
  time,
  timeW,
  detail,
  ink,
  s,
}: {
  row: LockClassRow;
  time: ClockParts;
  timeW: number;
  /** Room and/or group, per the Show tab; null draws nothing. */
  detail: string | null;
  ink: LockInk;
  s: number;
}) {
  const w = LOCK_METRICS.week;
  return (
    <View style={[styles.row, { height: w.rowH * s }]}>
      <View style={[styles.timeCol, { width: timeW, paddingRight: CLASS_TIME_GAP * s }]}>
        <ClassTime
          time={time}
          mainSize={13 * s}
          suffixSize={9 * s}
          weight="700"
          color={ink.text2}
          suffixColor={ink.text3}
        />
      </View>
      <View
        style={{
          width: 3 * s,
          height: 18 * s,
          borderRadius: 1.5 * s,
          backgroundColor: row.color,
          marginRight: 10 * s,
        }}
      />
      <LockText size={14 * s} weight="800" color={ink.text1} style={styles.flex}>
        {row.label}
        {row.name ? (
          <LockSpan style={{ fontWeight: '600', color: ink.text2 }}>{` · ${row.name}`}</LockSpan>
        ) : null}
      </LockText>
      {detail ? (
        <LockText
          size={12 * s}
          weight="600"
          color={ink.text3}
          style={[styles.noShrink, { maxWidth: 90 * s, marginLeft: 8 * s }]}
        >
          {detail}
        </LockText>
      ) : null}
    </View>
  );
}

/** Tall: up to three class rows and two task rows under the strip. */
function RowsSummary({ fit, source, config, ink, s, T }: LockTemplateProps) {
  const w = LOCK_METRICS.week;
  const { classes, tasks, uses24h } = fit.model;
  const times = classes.map((c) => fmtTime(c.start, uses24h, T));
  const timeW = classTimeColumnWidth(times, 13 * s, 9 * s, w.rowTimeColW * s, s);
  const labelX = timeW + 13 * s;

  const hiddenTasks = config.show.tasks ? fit.hiddenTasks : 0;
  const overflow: string[] = [];
  if (fit.hiddenClasses > 0) {
    let line = T('lsMore').replace('{n}', String(fit.hiddenClasses));
    if (fit.lastClassEnd) {
      line += ` · ${T('lsEnds').replace('{time}', fmtTimeInline(fit.lastClassEnd, uses24h, T))}`;
    }
    overflow.push(line);
  }
  if (hiddenTasks > 0) {
    // Next to a class count, "+1 more" would be ambiguous; say what it counts.
    overflow.push(
      fit.hiddenClasses > 0
        ? `+${T('lsDueCount').replace('{n}', String(hiddenTasks))}`
        : T('lsMore').replace('{n}', String(hiddenTasks)),
    );
  }

  return (
    <>
      <LockDivider ink={ink} s={s} gap={LOCK_METRICS.week.summaryGap} />
      {classes.length > 0 ? (
        classes.map((row, i) => (
          <WeekClassRow
            key={row.key}
            row={row}
            time={times[i]}
            timeW={timeW}
            detail={lockClassDetail(row, config.show)}
            ink={ink}
            s={s}
          />
        ))
      ) : (
        <SummaryLine
          marker={<LockDot size={8 * s} color={ink.text3} style={{ marginRight: 6 * s }} />}
          text={noClassesLine(source, T, config.show)}
          weight="700"
          color={ink.text1}
          s={s}
        />
      )}
      {config.show.tasks && tasks.length > 0
        ? tasks.map((task) => <TaskLine key={task.key} task={task} height={w.taskRowH * s} ink={ink} s={s} />)
        : null}
      {config.show.tasks && fit.dueCount === 0 ? (
        <SummaryLine
          marker={<LockRing size={8 * s} border={1.5 * s} color={ink.text3} style={{ marginRight: 6 * s }} />}
          text={T('lsNothingDue')}
          weight="600"
          color={ink.text2}
          s={s}
        />
      ) : null}
      {overflow.length > 0 ? (
        <View
          style={[
            styles.centerLeft,
            {
              height: w.overflowH * s,
              paddingLeft: fit.hiddenClasses > 0 ? labelX : TASK_TEXT_INSET * s,
            },
          ]}
        >
          <LockText size={12 * s} weight="700" color={ink.text3} tabular>
            {overflow.join(' · ')}
          </LockText>
        </View>
      ) : null}
    </>
  );
}

// ─── Template ────────────────────────────────────────────────────────────────

export default function WeekTemplate(props: LockTemplateProps) {
  const { fit, config, ink, W, s, T } = props;
  const w = LOCK_METRICS.week;
  const model = fit.model;
  const fallback = model.kind === 'fallback';

  const title = fallback
    ? T('lsYourWeek')
    : `${config.show.weekNo && model.weekLabel ? `${model.weekLabel} · ` : ''}${model.weekRange}`;
  const showPills = !fallback && config.show.tasks;

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { height: w.headerH * s }]}>
        <LockText size={12 * s} weight="800" tracking={1 * s} color={ink.text2} style={styles.shrink}>
          {title}
        </LockText>
        {showPills ? (
          <View style={[styles.row, { columnGap: 4 * s, marginLeft: 8 * s }]}>
            {/* "0 due" says nothing the summary's "Nothing due" line doesn't. */}
            {fit.dueCount > 0 ? (
              <LockPill
                label={T('lsDueCount').replace('{n}', String(fit.dueCount))}
                height={18 * s}
                padX={7 * s}
                size={10.5 * s}
                bg={ink.neutralChip}
                color={ink.text1}
              />
            ) : null}
            {model.overdueCount > 0 ? (
              <LockPill
                label={T('lsOverdueCount').replace('{n}', String(model.overdueCount))}
                height={18 * s}
                padX={7 * s}
                size={10.5 * s}
                bg={ink.overdue}
                color={ink.onOverdue}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ height: w.headerGap * s }} />
      <WeekStrip cells={model.week} chipRows={fit.chipRows} fallback={fallback} ink={ink} W={W} s={s} />

      {fit.summary === 'lines' ? <LinesSummary {...props} /> : null}
      {fit.summary === 'rows' ? <RowsSummary {...props} /> : null}

      <LockFooterSpacer minHeight={w.footerGap * s} />
      {fallback ? (
        <LockFallbackFooter ink={ink} s={s} T={T} />
      ) : (
        <View style={[styles.centerRight, { height: w.footerH * s }]}>
          <LockText size={9 * s} weight="600" color={ink.text3} tabular>
            {model.asOf}
          </LockText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    includeFontPadding: false,
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  noShrink: {
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLeft: {
    justifyContent: 'center',
  },
  centerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  stretchCenter: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  right: {
    textAlign: 'right',
  },
  pill: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    flexShrink: 0,
    maxWidth: '40%',
  },
  timeCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  column: {
    alignItems: 'center',
  },
  chips: {
    alignItems: 'center',
  },
});

/** Shared styles the other templates reuse, so every card lays out alike. */
export const lockTemplateStyles = styles;
