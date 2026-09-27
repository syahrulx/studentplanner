import React from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtTime } from '@/src/lib/lockScreen/lockScreenFormat';
import { lockScreenEmptyTitle, lockScreenNextLine } from '@/src/lib/lockScreen/lockScreenModel';
import type { LockInk } from '@/src/lib/lockScreen/lockScreenPalette';
import type { LockScreenDayModel } from '@/src/lib/lockScreen/types';

import {
  LockDot,
  LockSpan,
  LockText,
  lockTemplateStyles as shared,
  type LockTemplateProps,
} from './WeekTemplate';

/**
 * One short card: the first class and a ring with the due count. Small
 * enough to sit under a widget row, and fixed at 104s so it never needs
 * fitting.
 */

const RING = 52;
const RING_BORDER = 3;
const OVERDUE_DOT = 8;
// The overdue dot sits on the ring at 45°, top right.
const OVERDUE_INSET = (RING / 2) * (1 - Math.SQRT1_2) - OVERDUE_DOT / 2;

function DueRing({ due, overdue, ink, s, label }: { due: number; overdue: boolean; ink: LockInk; s: number; label: string }) {
  const size = RING * s;
  return (
    <View style={[styles.ringColumn, { marginLeft: 14 * s }]}>
      <View style={[shared.center, { width: size, height: size }]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: RING_BORDER * s,
              borderColor: due > 0 ? ink.accent : ink.text3,
              opacity: due > 0 ? 1 : 0.35,
            },
          ]}
        />
        <LockText size={20 * s} weight="800" color={ink.text1} tabular>
          {due}
        </LockText>
        {overdue ? (
          <LockDot
            size={OVERDUE_DOT * s}
            color={ink.overdue}
            style={[styles.overdueDot, { top: OVERDUE_INSET * s, right: OVERDUE_INSET * s }]}
          />
        ) : null}
      </View>
      <LockText size={10 * s} weight="700" color={ink.text3} style={{ marginTop: 4 * s }}>
        {label}
      </LockText>
    </View>
  );
}

/** Backup card: the week as initials, each with its first class's colour. */
function FallbackRows({ model, ink, s, T }: { model: LockScreenDayModel; ink: LockInk; s: number; T: LockTemplateProps['T'] }) {
  return (
    <>
      <View style={[shared.centerLeft, { height: 16 * s }]}>
        <LockText size={11 * s} weight="800" tracking={1 * s} color={ink.text2}>
          {T('lsYourWeek')}
        </LockText>
      </View>
      <View style={[shared.row, { height: 32 * s, marginTop: 4 * s }]}>
        {model.week.map((cell, i) => (
          // Backup cells have no date, so the index is the only stable key.
          <View key={i} style={[styles.initial, shared.center]}>
            <LockText size={14 * s} weight="800" color={ink.text1}>
              {cell.initial}
            </LockText>
            <LockDot size={6 * s} color={cell.firstColor ?? ink.text3} style={{ marginTop: 4 * s }} />
          </View>
        ))}
      </View>
      <View style={[shared.centerLeft, { height: 18 * s, marginTop: 2 * s }]}>
        <LockText size={13 * s} weight="600" color={ink.text2}>
          {T('lsFallbackFooter')}
        </LockText>
      </View>
    </>
  );
}

export default function GlanceTemplate({ fit, source, config, ink, s, T }: LockTemplateProps) {
  const model = fit.model;
  const fallback = model.kind === 'fallback';
  const showRing = !fallback && config.show.tasks;

  let body: React.ReactNode;
  if (fallback) {
    body = <FallbackRows model={model} ink={ink} s={s} T={T} />;
  } else {
    const first = model.classes[0];
    const dateLine = `${model.glanceDate}${config.show.weekNo && model.weekLabel ? ` · ${model.weekLabel}` : ''}`;

    let detail = '';
    if (first) {
      const parts: string[] = [];
      if (config.show.rooms && first.room) parts.push(first.room);
      if (model.classes.length > 1) {
        parts.push(T('lsThenMore').replace('{n}', String(model.classes.length - 1)));
      } else if (first.name) {
        parts.push(first.name);
      }
      detail = parts.join(' · ');
    } else if (source.next) {
      detail = lockScreenNextLine(source.next, T, config.show.rooms);
    } else if (source.tasks.length === 0) {
      detail = T('lsNothingDue');
    }

    const time = first ? fmtTime(first.start, model.uses24h, T) : null;

    body = (
      <>
        <View style={[shared.centerLeft, { height: 16 * s }]}>
          <LockText size={11 * s} weight="800" tracking={1 * s} color={ink.text2}>
            {dateLine}
          </LockText>
        </View>
        <View style={[shared.row, { height: 32 * s, marginTop: 4 * s }]}>
          {first && time ? (
            <>
              <LockDot size={8 * s} color={first.color} style={{ marginRight: 8 * s }} />
              <LockText size={24 * s} weight="800" color={ink.text1} tabular style={shared.noShrink}>
                {time.main}
                {time.suffix ? (
                  <LockSpan style={{ fontSize: 11 * s, color: ink.text3 }}>{` ${time.suffix}`}</LockSpan>
                ) : null}
              </LockText>
              <LockText
                size={24 * s}
                weight="800"
                color={ink.text1}
                shrink={0.7}
                style={[shared.flex, { marginLeft: 8 * s }]}
              >
                {first.label}
              </LockText>
            </>
          ) : (
            <LockText size={20 * s} weight="800" color={ink.text1} style={shared.flex}>
              {lockScreenEmptyTitle(source, T)}
            </LockText>
          )}
        </View>
        <View style={[shared.centerLeft, { height: 18 * s, marginTop: 2 * s }]}>
          {detail ? (
            <LockText size={13 * s} weight="600" color={ink.text2}>
              {detail}
            </LockText>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <View style={[shared.flex, shared.row]}>
      <View style={styles.main}>{body}</View>
      {showRing ? (
        <DueRing
          due={fit.dueCount}
          overdue={model.overdueCount > 0}
          ink={ink}
          s={s}
          label={T('lsDueLabel')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    justifyContent: 'center',
  },
  ringColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overdueDot: {
    position: 'absolute',
  },
  initial: {
    flex: 1,
  },
});
