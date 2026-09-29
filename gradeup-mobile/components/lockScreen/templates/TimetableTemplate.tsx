import React from 'react';
import { StyleSheet, View } from 'react-native';

import { LOCK_METRICS } from '@/src/lib/lockScreen/lockScreenGeometry';
import { fmtTime, lockClassDetail } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockClassRow, LockShowOptions, LockTimetableDay } from '@/src/lib/lockScreen/types';

import {
  CLASS_TIME_GAP,
  ClassTime,
  LockDivider,
  LockFooterSpacer,
  LockText,
  classTimeColumnWidth,
  lockTemplateStyles as shared,
  type ClockParts,
  type LockTemplateProps,
} from './WeekTemplate';

/**
 * The whole week as a timetable: each day's classes with their times and
 * rooms. Nothing on it is dated — no today, no week number, no tasks — so a
 * picture saved once stays right all semester. That is the point: Android has
 * no way to refresh a wallpaper, so there the picture is saved and kept.
 *
 * Every day is `lines × lineH` tall (one line for a free day) with a divider
 * block between days, which is exactly what timetableUnits measures.
 */

const BAR_W = 3;
const BAR_GAP = 8;

/** What one day draws: its visible classes, and how many were left for "+n more". */
function dayLines(day: LockTimetableDay, ttLines: number): { shown: LockClassRow[]; hidden: number } {
  if (day.classes.length <= ttLines) return { shown: day.classes, hidden: 0 };
  const shown = day.classes.slice(0, Math.max(0, ttLines - 1));
  return { shown, hidden: day.classes.length - shown.length };
}

function ClassLine({
  row,
  time,
  timeW,
  show,
  ink,
  s,
}: {
  row: LockClassRow;
  time: ClockParts;
  timeW: number;
  show: LockShowOptions;
  ink: LockInk;
  s: number;
}) {
  const detail = lockClassDetail(row, show);
  return (
    <View style={[shared.row, { height: LOCK_METRICS.timetable.lineH * s }]}>
      <View style={[shared.timeCol, { width: timeW, paddingRight: CLASS_TIME_GAP * s }]}>
        <ClassTime
          time={time}
          mainSize={12.5 * s}
          suffixSize={8 * s}
          weight="700"
          color={ink.text2}
          suffixColor={ink.text3}
        />
      </View>
      <View
        style={{
          width: BAR_W * s,
          height: 14 * s,
          borderRadius: (BAR_W * s) / 2,
          backgroundColor: row.color,
          marginRight: BAR_GAP * s,
        }}
      />
      <LockText size={13.5 * s} weight="800" color={ink.text1} style={shared.flex}>
        {row.label}
      </LockText>
      {detail ? (
        <LockText
          size={11.5 * s}
          weight="600"
          color={ink.text3}
          style={[styles.detail, { marginLeft: 6 * s }]}
        >
          {detail}
        </LockText>
      ) : null}
    </View>
  );
}

export default function TimetableTemplate({ fit, config, ink, s, T }: LockTemplateProps) {
  const t = LOCK_METRICS.timetable;
  const { timetable, uses24h } = fit.model;
  const lineH = t.lineH * s;

  const days = timetable.map((day) => ({ day, ...dayLines(day, fit.ttLines) }));
  // One time column for the whole card, so every bar and code lines up.
  const allTimes = days.flatMap((d) => d.shown.map((c) => fmtTime(c.start, uses24h, T)));
  const timeW = classTimeColumnWidth(allTimes, 12.5 * s, 8 * s, t.timeColW * s, s);
  const labelX = timeW + (BAR_W + BAR_GAP) * s;

  return (
    <View style={shared.flex}>
      <View style={[shared.header, { height: t.headerH * s }]}>
        <LockText size={12 * s} weight="800" tracking={1 * s} color={ink.text2} style={shared.shrink}>
          {T('lsTimetableTitle')}
        </LockText>
      </View>
      <View style={{ height: t.headerGap * s }} />

      {days.map(({ day, shown, hidden }, i) => {
        const lines = Math.max(1, shown.length + (hidden > 0 ? 1 : 0));
        return (
          <React.Fragment key={day.weekday}>
            {i > 0 ? <LockDivider ink={ink} s={s} gap={t.dayGap} /> : null}
            <View style={[styles.day, { height: lines * lineH }]}>
              <View style={[styles.dayCol, { width: t.dayColW * s, marginRight: t.dayColGap * s, height: lineH }]}>
                <LockText size={10.5 * s} weight="800" tracking={0.5 * s} color={day.classes.length ? ink.text2 : ink.text3}>
                  {day.dayShort}
                </LockText>
              </View>
              <View style={shared.flex}>
                {shown.length === 0 && hidden === 0 ? (
                  <View style={[styles.centerLeft, { height: lineH }]}>
                    <LockText size={12 * s} weight="600" color={ink.text3}>
                      {T('lsTtNoClasses')}
                    </LockText>
                  </View>
                ) : null}
                {shown.map((row) => {
                  const time = fmtTime(row.start, uses24h, T);
                  return <ClassLine key={row.key} row={row} time={time} timeW={timeW} show={config.show} ink={ink} s={s} />;
                })}
                {hidden > 0 ? (
                  <View style={[styles.centerLeft, { height: lineH, paddingLeft: labelX }]}>
                    <LockText size={12 * s} weight="700" color={ink.text3} tabular>
                      {T('lsMore').replace('{n}', String(hidden))}
                    </LockText>
                  </View>
                ) : null}
              </View>
            </View>
          </React.Fragment>
        );
      })}

      {/* Soaks up sub-point rounding so the last day sits on the bottom padding. */}
      <LockFooterSpacer minHeight={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    flexDirection: 'row',
  },
  dayCol: {
    justifyContent: 'center',
  },
  centerLeft: {
    justifyContent: 'center',
  },
  detail: {
    flexShrink: 0,
    maxWidth: '58%',
    textAlign: 'right',
  },
});
