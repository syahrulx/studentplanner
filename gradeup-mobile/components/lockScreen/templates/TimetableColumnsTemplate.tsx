import React from 'react';
import { StyleSheet, View } from 'react-native';

import { LANDSCAPE_TT } from '@/src/lib/lockScreen/lockLandscape';
import { fmtTimeInline, lockClassDetail } from '@/src/lib/lockScreen/lockScreenFormat';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockScreenConfig, LockScreenDayModel } from '@/src/lib/lockScreen/types';

import { LockText, type LockTemplateProps } from './WeekTemplate';

/**
 * The Timetable template turned sideways for a tablet or laptop: one column
 * per day, each class as time, code and room. Undated, like the phone's
 * Timetable, so a picture saved once stays right all semester.
 *
 * Every day is drawn `rows` classes tall (see landscapeLayout): a day with
 * more ends on "+n more", which is exactly what landscapeTimetableUnits
 * measures.
 */
export default function TimetableColumnsTemplate({
  model,
  config,
  ink,
  s,
  T,
  rows,
}: {
  model: LockScreenDayModel;
  config: LockScreenConfig;
  ink: LockInk;
  s: number;
  T: LockTemplateProps['T'];
  rows: number;
}) {
  const t = LANDSCAPE_TT;
  return (
    <View style={styles.flex}>
      <View style={{ height: t.headerH * s, justifyContent: 'center' }}>
        <LockText size={12 * s} weight="800" tracking={1 * s} color={ink.text2}>
          {T('lsTimetableTitle')}
        </LockText>
      </View>
      <View style={{ height: t.headerGap * s }} />
      <View style={[styles.row, styles.flex, { gap: t.colGap * s }]}>
        {model.timetable.map((day) => {
          const shown = day.classes.slice(0, rows);
          const hidden = day.classes.length - shown.length;
          return (
            <View
              key={day.weekday}
              style={[styles.col, { padding: t.colPad * s, borderRadius: 14 * s, backgroundColor: ink.neutralChip }]}
            >
              <View style={{ height: t.dayHeadH * s, justifyContent: 'center', marginBottom: t.dayHeadGap * s }}>
                <LockText size={10.5 * s} weight="800" tracking={0.5 * s} color={day.classes.length ? ink.text2 : ink.text3}>
                  {day.dayShort}
                </LockText>
              </View>
              {shown.length === 0 ? (
                <View style={{ height: t.noteH * s, justifyContent: 'center' }}>
                  <LockText size={11.5 * s} weight="600" color={ink.text3}>
                    {T('lsTtNoClasses')}
                  </LockText>
                </View>
              ) : null}
              {shown.map((row, i) => {
                const detail = lockClassDetail(row, config.show);
                return (
                  <View
                    key={row.key}
                    style={[
                      styles.classRow,
                      { height: t.rowH * s, marginTop: i > 0 ? t.rowGap * s : 0, paddingLeft: 7 * s },
                    ]}
                  >
                    <View style={[styles.bar, { width: 3 * s, borderRadius: 1.5 * s, backgroundColor: row.color }]} />
                    <LockText size={10 * s} weight="700" color={ink.text3} tabular>
                      {fmtTimeInline(row.start, model.uses24h, T)}
                    </LockText>
                    <LockText size={13.5 * s} weight="800" color={ink.text1}>
                      {row.label}
                    </LockText>
                    {detail ? (
                      <LockText size={10 * s} weight="600" color={ink.text3}>
                        {detail}
                      </LockText>
                    ) : null}
                  </View>
                );
              })}
              {hidden > 0 ? (
                <View style={{ height: t.noteH * s, marginTop: t.rowGap * s, justifyContent: 'center', paddingLeft: 7 * s }}>
                  <LockText size={11 * s} weight="700" color={ink.text3} tabular>
                    {T('lsMore').replace('{n}', String(hidden))}
                  </LockText>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  col: { flex: 1, minWidth: 0, overflow: 'hidden' },
  classRow: { justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: '12%', bottom: '12%' },
});
