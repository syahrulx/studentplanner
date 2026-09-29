import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LOCK_METRICS, lockGridHourSpan } from '@/src/lib/lockScreen/lockScreenGeometry';
import { clockMinutes, lockClassDetail, normalizeClock } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockClassRow, LockShowOptions } from '@/src/lib/lockScreen/types';

import { LockFooterSpacer, LockText, lockLineHeight, lockTemplateStyles as shared, type LockTemplateProps } from './WeekTemplate';

/**
 * The week as a small timetable grid, the way the Timetable tab draws it: a
 * column per day, an hour scale down the left, and each class a soft block
 * placed by its time with the subject colour down its edge. Undated like the
 * Timetable list, so a picture saved once on Android stays right.
 *
 * Its height is the hour span × fit.gridHourH plus LOCK_METRICS.grid.chrome;
 * fitting shrinks the hour, never drops a class.
 */

const BAR_W = 2.5;
const CODE_SIZE = 9.5;
const ROOM_SIZE = 8;
const PAD_TOP = 2.5;

/** '#RRGGBB' at ~30% over the glass; any other colour form as it is. */
function blockFill(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}4D` : color;
}

/** Lane per class so overlapping classes on one day sit side by side; plus the lanes the day needs. */
function assignLanes(classes: LockClassRow[]): { lane: number[]; lanes: number } {
  const laneEnds: number[] = [];
  const lane = classes.map((c) => {
    const start = clockMinutes(c.start);
    let i = laneEnds.findIndex((end) => end <= start);
    if (i < 0) {
      i = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[i] = clockMinutes(c.end);
    return i;
  });
  return { lane, lanes: Math.max(1, laneEnds.length) };
}

function hourLabel(h: number, uses24h: boolean): string {
  if (uses24h) return String(h).padStart(2, '0');
  return String(h % 12 === 0 ? 12 : h % 12);
}

function Block({
  row,
  top,
  height,
  left,
  width,
  show,
  ink,
  s,
}: {
  row: LockClassRow;
  top: number;
  height: number;
  left: number;
  width: number;
  show: LockShowOptions;
  ink: LockInk;
  s: number;
}) {
  const detail = lockClassDetail(row, show);
  // Room lines only where they fit whole: the code's line comes first.
  const roomSpace = height - PAD_TOP * s - lockLineHeight(CODE_SIZE * s);
  const roomLines = detail ? Math.min(2, Math.floor(roomSpace / lockLineHeight(ROOM_SIZE * s))) : 0;
  return (
    <View
      style={[
        styles.block,
        {
          top,
          height,
          left,
          width,
          borderRadius: 5 * s,
          backgroundColor: blockFill(row.color),
        },
      ]}
    >
      <View style={{ width: BAR_W * s, backgroundColor: row.color }} />
      <View style={[shared.flex, { paddingLeft: 3.5 * s, paddingRight: 2 * s, paddingTop: PAD_TOP * s }]}>
        <LockText size={CODE_SIZE * s} weight="800" color={ink.text1} shrink={0.7}>
          {row.label}
        </LockText>
        {roomLines > 0 ? (
          <Text
            allowFontScaling={false}
            numberOfLines={roomLines}
            ellipsizeMode="tail"
            style={[
              styles.room,
              { fontSize: ROOM_SIZE * s, lineHeight: lockLineHeight(ROOM_SIZE * s), color: ink.text2 },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function GridTemplate({ fit, config, ink, W, s, T }: LockTemplateProps) {
  const g = LOCK_METRICS.grid;
  const p = LOCK_METRICS.panel;
  const { timetable, uses24h } = fit.model;
  const hourH = fit.gridHourH;
  const { startHour, endHour } = lockGridHourSpan(fit.model);
  const span = endHour - startHour;

  const n = Math.max(1, timetable.length);
  const gutter = g.gutterW * s;
  const innerW = W - 2 * (p.insetX + p.padX) * s;
  const colW = (innerW - gutter - (n - 1) * g.colGap * s) / n;
  const colLeft = (i: number) => gutter + i * (colW + g.colGap * s);
  // Every hour while there is room for its label, every other hour once the grid is squeezed.
  const labelEvery = hourH >= 28 * s ? 1 : 2;
  const labelLine = lockLineHeight(8.5 * s);

  return (
    <View style={shared.flex}>
      <View style={[shared.header, { height: g.headerH * s }]}>
        <LockText size={12 * s} weight="800" tracking={1 * s} color={ink.text2} style={shared.shrink}>
          {T('lsTimetableTitle')}
        </LockText>
      </View>
      <View style={{ height: g.headerGap * s }} />

      <View style={{ height: g.dayHeadH * s }}>
        {timetable.map((day, i) => (
          <View key={day.weekday} style={[styles.dayHead, { left: colLeft(i), width: colW, height: g.dayHeadH * s }]}>
            <LockText size={10 * s} weight="800" tracking={0.5 * s} color={day.classes.length ? ink.text1 : ink.text3}>
              {day.dayShort}
            </LockText>
          </View>
        ))}
      </View>
      <View style={{ height: g.dayHeadGap * s }} />

      <View style={{ height: span * hourH }}>
        {Array.from({ length: span + 1 }, (_, h) => (
          <View
            key={`line-${h}`}
            style={[styles.hourLine, { top: h * hourH, left: gutter, backgroundColor: ink.divider }]}
          />
        ))}
        {Array.from({ length: span }, (_, h) =>
          h % labelEvery === 0 ? (
            <View key={`label-${h}`} style={[styles.hourLabel, { top: h * hourH, width: gutter - 4 * s, height: labelLine }]}>
              <LockText size={8.5 * s} weight="700" color={ink.text3} tabular style={styles.right}>
                {hourLabel(startHour + h, uses24h)}
              </LockText>
            </View>
          ) : null,
        )}

        {timetable.map((day, i) => {
          const { lane, lanes } = assignLanes(day.classes);
          const laneW = colW / lanes;
          return day.classes.map((row, k) => {
            if (!normalizeClock(row.start) || !normalizeClock(row.end)) return null;
            const start = clockMinutes(row.start) / 60 - startHour;
            const end = clockMinutes(row.end) / 60 - startHour;
            const top = start * hourH + 1 * s;
            const height = Math.max(10 * s, (end - start) * hourH - 2 * s);
            return (
              <Block
                key={row.key}
                row={row}
                top={top}
                height={height}
                left={colLeft(i) + lane[k] * laneW}
                width={laneW - (lanes > 1 ? 1 * s : 0)}
                show={config.show}
                ink={ink}
                s={s}
              />
            );
          });
        })}
      </View>

      {/* Soaks up sub-point rounding so the grid sits on the bottom padding. */}
      <LockFooterSpacer minHeight={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  dayHead: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourLine: {
    position: 'absolute',
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  hourLabel: {
    position: 'absolute',
    left: 0,
    justifyContent: 'flex-start',
  },
  right: {
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  block: {
    position: 'absolute',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  room: {
    includeFontPadding: false,
    fontWeight: '600',
  },
});
