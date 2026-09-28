import React from 'react';
import { StyleSheet, View } from 'react-native';

import { LOCK_METRICS } from '@/src/lib/lockScreen/lockScreenGeometry';
import { fmtTime, fmtTimeInline, lockClassDetail } from '@/src/lib/lockScreen/lockScreenFormat';
import { lockScreenEmptyTitle, lockScreenNextLine } from '@/src/lib/lockScreen/lockScreenModel';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockWeekCell } from '@/src/lib/lockScreen/types';

import {
  CLASS_TIME_GAP,
  ClassTime,
  LockDivider,
  LockFallbackFooter,
  LockFooterSpacer,
  LockPill,
  LockSpan,
  LockText,
  TASK_TEXT_INSET,
  TaskLine,
  WeekStrip,
  classTimeColumnWidth,
  lockLineHeight,
  lockTemplateStyles as shared,
  type LockTemplateProps,
} from './WeekTemplate';

/**
 * The default picture: the day's classes, then what's due, under a dated
 * header. The date is explicit because the picture is drawn days ahead and
 * shown by an automation; a student glancing at it should never have to
 * trust that it is today's.
 */

/** Seven dots for the week, the drawn day as a wider pill. */
function WeekDots({ cells, ink, s }: { cells: LockWeekCell[]; ink: LockInk; s: number }) {
  const dot = 6 * s;
  return (
    <View style={[shared.row, { columnGap: 6 * s }]}>
      {cells.map((cell, i) =>
        cell.isFocus ? (
          <View key={i} style={{ width: 16 * s, height: dot, borderRadius: dot / 2, backgroundColor: ink.text1 }} />
        ) : (
          <View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: cell.hasClasses ? ink.text2 : ink.text3,
              opacity: cell.hasClasses ? 1 : 0.5,
            }}
          />
        ),
      )}
    </View>
  );
}

function TodayFallback({ fit, ink, W, s, T }: LockTemplateProps) {
  const m = LOCK_METRICS.today;
  return (
    <View style={shared.flex}>
      <View style={[shared.header, { height: m.headerH * s }]}>
        <LockText size={12 * s} weight="800" tracking={1.2 * s} color={ink.text2} style={shared.shrink}>
          {T('lsYourWeek')}
        </LockText>
      </View>
      <View style={{ height: m.headerGap * s }} />
      <WeekStrip cells={fit.model.week} chipRows={fit.chipRows} fallback ink={ink} W={W} s={s} />
      <LockFooterSpacer minHeight={m.footerGap * s} />
      <LockFallbackFooter ink={ink} s={s} T={T} />
    </View>
  );
}

export default function TodayTemplate(props: LockTemplateProps) {
  const { fit, source, config, ink, s, T } = props;
  const m = LOCK_METRICS.today;
  const model = fit.model;
  if (model.kind === 'fallback') return <TodayFallback {...props} />;

  const { classes, tasks, uses24h } = model;
  const showTasks = config.show.tasks;

  // ── Header pills ──
  const overdue = showTasks && model.overdueCount > 0;
  // Fitting drops the last task row only when nothing else fits; the count
  // moves up here so what's due never disappears from the picture.
  const dueInPill = showTasks && tasks.length === 0 && fit.dueCount > 0;
  const week = config.show.weekNo && !!model.weekLabel;
  const pill = { height: 20 * s, padX: 8 * s, size: 10.5 * s };

  // ── Class rows ──
  const rowH = (fit.roomRows ? m.classRowRoomH : m.classRowH) * s;
  // The end time (11s) and the room (12s) share one line box so the two columns stay level.
  const secondLineH = lockLineHeight(12 * s);
  const times = classes.map((c) => fmtTime(c.start, uses24h, T));
  const ends = fit.roomRows ? classes.map((c) => fmtTimeInline(c.end, uses24h, T)) : [];
  const timeW = classTimeColumnWidth(times, 15 * s, 9 * s, m.timeColW * s, s, ends, 11 * s);
  const labelX = timeW + (m.barW + m.barGap) * s;

  let classOverflow = '';
  if (fit.hiddenClasses > 0) {
    classOverflow = T('lsMore').replace('{n}', String(fit.hiddenClasses));
    if (fit.lastClassEnd) {
      classOverflow += ` · ${T('lsEnds').replace('{time}', fmtTimeInline(fit.lastClassEnd, uses24h, T))}`;
    }
  }

  // ── Empty day ──
  let emptySub: string | null = null;
  if (source.next) {
    emptySub = lockScreenNextLine(source.next, T, config.show);
  } else if (source.tasks.length === 0) {
    emptySub = T('lsNothingDue');
  }

  return (
    <View style={shared.flex}>
      {/* Header */}
      <View style={[shared.header, { height: m.headerH * s }]}>
        <LockText size={12 * s} weight="800" tracking={1.2 * s} color={ink.text2} style={shared.shrink}>
          {model.headerDate}
        </LockText>
        {dueInPill || overdue || week ? (
          <View style={[shared.row, { columnGap: 6 * s, marginLeft: 8 * s }]}>
            {dueInPill ? (
              <LockPill
                {...pill}
                label={T('lsDueCount').replace('{n}', String(fit.dueCount))}
                bg={ink.neutralChip}
                color={ink.text1}
              />
            ) : null}
            {overdue ? (
              <LockPill
                {...pill}
                label={T('lsOverdueCount').replace('{n}', String(model.overdueCount))}
                bg={ink.overdue}
                color={ink.onOverdue}
              />
            ) : null}
            {week ? (
              <LockPill
                {...pill}
                label={model.weekLabel ?? ''}
                tracking={0.6 * s}
                bg={model.noClassesPeriod ? ink.neutralChip : ink.accent}
                color={model.noClassesPeriod ? ink.text1 : ink.onAccent}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={{ height: m.headerGap * s }} />

      {/* Classes, or the empty block */}
      {classes.length > 0 ? (
        classes.map((c, i) => (
          <View key={c.key} style={[shared.row, { height: rowH }]}>
            <View style={[shared.timeCol, { width: timeW, paddingRight: CLASS_TIME_GAP * s }]}>
              <ClassTime
                time={times[i]}
                mainSize={15 * s}
                suffixSize={9 * s}
                weight="800"
                color={ink.text1}
                suffixColor={ink.text3}
              />
              {fit.roomRows ? (
                <LockText
                  size={11 * s}
                  weight="600"
                  color={ink.text3}
                  tabular
                  style={[shared.right, { lineHeight: secondLineH }]}
                >
                  {ends[i]}
                </LockText>
              ) : null}
            </View>
            <View
              style={{
                width: m.barW * s,
                height: rowH - 12 * s,
                borderRadius: (m.barW * s) / 2,
                backgroundColor: c.color,
                marginRight: m.barGap * s,
              }}
            />
            <View style={styles.label}>
              <LockText size={15 * s} weight="800" color={ink.text1}>
                {c.label}
                {c.name ? (
                  <LockSpan style={{ fontWeight: '600', color: ink.text2 }}>{` · ${c.name}`}</LockSpan>
                ) : null}
              </LockText>
              {fit.roomRows ? (
                <View style={{ height: secondLineH }}>
                  {lockClassDetail(c, config.show) ? (
                    <LockText size={12 * s} weight="600" color={ink.text3}>
                      {lockClassDetail(c, config.show)}
                    </LockText>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        ))
      ) : (
        <View style={[shared.centerLeft, { height: m.emptyH * s }]}>
          <LockText size={17 * s} weight="800" color={ink.text1}>
            {lockScreenEmptyTitle(source, T)}
          </LockText>
          {emptySub ? (
            <LockText size={13 * s} weight="600" color={ink.text2} style={{ marginTop: 2 * s }}>
              {emptySub}
            </LockText>
          ) : null}
        </View>
      )}

      {classOverflow ? (
        <View style={[shared.centerLeft, { height: m.overflowH * s, paddingLeft: labelX }]}>
          <LockText size={12 * s} weight="700" color={ink.text3} tabular>
            {classOverflow}
          </LockText>
        </View>
      ) : null}

      {/* Due today */}
      {showTasks && tasks.length > 0 ? (
        <>
          <LockDivider ink={ink} s={s} gap={m.dueGap} />
          <View style={[shared.centerLeft, { height: m.dueLabelH * s }]}>
            <LockText size={10.5 * s} weight="800" tracking={1 * s} color={ink.text3}>
              {T('lsDueToday')}
            </LockText>
          </View>
          {tasks.map((task) => (
            <TaskLine key={task.key} task={task} height={m.taskRowH * s} ink={ink} s={s} />
          ))}
          {fit.hiddenTasks > 0 ? (
            <View style={[shared.centerLeft, { height: m.overflowH * s, paddingLeft: TASK_TEXT_INSET * s }]}>
              <LockText size={12 * s} weight="700" color={ink.text3} tabular>
                {T('lsMore').replace('{n}', String(fit.hiddenTasks))}
              </LockText>
            </View>
          ) : null}
        </>
      ) : null}

      {/* Footer */}
      <LockFooterSpacer minHeight={m.footerGap * s} />
      <View style={[shared.header, { height: m.footerH * s }]}>
        <WeekDots cells={model.week} ink={ink} s={s} />
        <LockText
          size={9 * s}
          weight="600"
          color={ink.text3}
          tabular
          style={[shared.shrink, { marginLeft: 8 * s }]}
        >
          {model.asOf}
        </LockText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    flex: 1,
    justifyContent: 'center',
  },
});
