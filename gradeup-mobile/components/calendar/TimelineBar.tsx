import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import {
  periodTypeColor,
  summarizeTimeline,
  timelineSegments,
  type PeriodRow,
} from '@/src/lib/calendarTimeline';

/**
 * The whole semester as one bar, proportional to days. Unscheduled stretches are drawn hatched and
 * called out underneath — a calendar that stops at the mid-semester break reads as a long blank
 * band, which is the thing nobody could see until after they had applied it.
 */
const MIN_NOTABLE_GAP_DAYS = 7;

export function TimelineBar({
  periods,
  showSummary = true,
  height = 12,
}: {
  periods: PeriodRow[];
  showSummary?: boolean;
  height?: number;
}) {
  const theme = useTheme();
  const segments = useMemo(() => timelineSegments(periods), [periods]);
  const summary = useMemo(() => summarizeTimeline(periods), [periods]);

  const totalDays = useMemo(
    () => segments.reduce((sum, s) => sum + s.days, 0),
    [segments],
  );
  // A few days between registration and the first lecture is a weekend, not a missing block.
  // Only a gap long enough to be a lost week is worth putting in front of a student.
  const biggestGap = useMemo(
    () =>
      segments
        .filter((s) => s.type === 'gap' && s.days >= MIN_NOTABLE_GAP_DAYS)
        .sort((a, b) => b.days - a.days)[0] ?? null,
    [segments],
  );

  if (segments.length === 0 || totalDays <= 0) return null;

  return (
    <View>
      <View style={[styles.bar, { height, backgroundColor: theme.border }]}>
        {segments.map((segment, index) => (
          <View
            key={`${segment.startDate}-${index}`}
            style={{
              flex: segment.days,
              backgroundColor:
                segment.type === 'gap' ? 'transparent' : periodTypeColor(segment.type),
              borderColor: segment.type === 'gap' ? theme.textSecondary : 'transparent',
              borderWidth: segment.type === 'gap' ? StyleSheet.hairlineWidth : 0,
              borderStyle: 'dashed',
            }}
          />
        ))}
      </View>

      {showSummary && summary.text ? (
        <Text style={[styles.summary, { color: theme.textSecondary }]}>
          {summary.text}
          {summary.holidayCount > 0
            ? ` · ${summary.holidayCount} public holiday${summary.holidayCount === 1 ? '' : 's'}`
            : ''}
        </Text>
      ) : null}

      {biggestGap ? (
        <Text style={[styles.gap, { color: '#f97316' }]}>
          {biggestGap.days} days with nothing scheduled, {biggestGap.startDate} to{' '}
          {biggestGap.endDate}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
  },
  summary: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  gap: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
});
