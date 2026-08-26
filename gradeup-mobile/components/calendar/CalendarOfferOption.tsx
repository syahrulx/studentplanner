import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { TimelineBar } from './TimelineBar';
import { termStatus, type PeriodRow } from '@/src/lib/calendarTimeline';
import type { UniversityCalendarOffer } from '@/src/lib/universityCalendarOffersDb';

/**
 * One calendar in the picker, described by its own data rather than by its label. Labels are free
 * text typed by whoever submitted the calendar — real ones on file include "s1 26/27", "SEM 1" and
 * "Sem 3 Xbme 3" — so the dates, the week count, where today falls, and whether there is a timeline
 * at all are what a student can actually choose from.
 */
export function CalendarOfferOption({
  offer,
  selected,
  onSelect,
  onReport,
}: {
  offer: UniversityCalendarOffer;
  selected: boolean;
  onSelect: () => void;
  onReport?: () => void;
}) {
  const theme = useTheme();

  const periods = useMemo<PeriodRow[]>(
    () =>
      (offer.periods ?? []).map((p) => ({
        type: String(p.type),
        label: String(p.label ?? ''),
        startDate: String(p.startDate),
        endDate: String(p.endDate),
      })),
    [offer.periods],
  );

  const status = useMemo(
    () => termStatus(offer.startDate, offer.endDate),
    [offer.startDate, offer.endDate],
  );

  const hasTimeline = periods.length > 0;

  const statusText =
    status.kind === 'running'
      ? `Running now · ${status.weekLabel}`
      : status.kind === 'upcoming'
        ? status.monthLabel
          ? `Starts ${status.monthLabel}`
          : status.weeksAway === 1
            ? 'Starts next week'
            : `Starts in ${status.weeksAway} weeks`
        : status.kind === 'ended'
          ? `Ended ${status.weeksAgo} week${status.weeksAgo === 1 ? '' : 's'} ago`
          : '';

  const statusColor =
    status.kind === 'running' ? '#22c55e' : status.kind === 'ended' ? '#94a3b8' : theme.textSecondary;

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primary + '1A' : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <Feather
          name={selected ? 'check-circle' : 'circle'}
          size={18}
          color={selected ? theme.primary : theme.textSecondary}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {offer.semesterLabel}
          </Text>
          <Text style={[styles.dates, { color: theme.textSecondary }]}>
            {offer.startDate} → {offer.endDate}
            {/* The stored `total_weeks` and the weeks the timeline actually spans disagree often
                enough to look like a bug (17 vs 18 on one UKM calendar). When there is a timeline
                the summary below counts the real dates, so only fall back to the stored number. */}
            {hasTimeline ? '' : ` · ${offer.totalWeeks} weeks`}
          </Text>
        </View>
        {onReport && offer.source === 'crowdsourced' ? (
          <TouchableOpacity
            hitSlop={15}
            onPress={(e) => {
              e.stopPropagation();
              onReport();
            }}
            style={styles.flag}
          >
            <Feather name="flag" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.badges}>
        {statusText ? (
          <Text style={[styles.badge, { color: statusColor }]}>{statusText}</Text>
        ) : null}
        {offer.programLevel ? (
          <Text style={[styles.badge, { color: theme.textSecondary }]}>{offer.programLevel}</Text>
        ) : null}
        {!hasTimeline ? (
          <Text style={[styles.badge, { color: '#f97316' }]}>No timeline</Text>
        ) : null}
      </View>

      {hasTimeline ? (
        <View style={styles.timeline}>
          <TimelineBar periods={periods} height={10} />
        </View>
      ) : (
        <Text style={[styles.noTimeline, { color: theme.textSecondary }]}>
          Only the start and end dates were published, so weeks will count straight through with no
          lecture, break or exam markers.
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  dates: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  flag: {
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginLeft: 28,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timeline: {
    marginTop: 10,
    marginLeft: 28,
  },
  noTimeline: {
    marginTop: 8,
    marginLeft: 28,
    fontSize: 12,
    lineHeight: 17,
  },
});
