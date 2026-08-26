import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { TimelineBar } from './TimelineBar';
import {
  PERIOD_TYPE_OPTIONS,
  periodTypeColor,
  periodTypeLabel,
  sortPeriods,
  type PeriodRow,
} from '@/src/lib/calendarTimeline';
import { validateCalendarTimeline } from '@/src/lib/calendarTimelineValidation';

/**
 * Replaces the raw JSON textarea students used to face on the submit screen. Nobody hand-writes
 * `[{"type":"lecture","startDate":…}]`, so they left it empty and published a calendar with no
 * timeline at all — 22 of 57 stored calendars had none, and every student who applied one got a
 * blank planner.
 *
 * Problems are shown while the timeline is being built rather than at publish time, using the same
 * `validateCalendarTimeline` rules that gate submission.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function PeriodListEditor({
  rows,
  onChange,
  startDate,
  endDate,
}: {
  rows: PeriodRow[];
  onChange: (next: PeriodRow[]) => void;
  startDate: string;
  endDate: string;
}) {
  const theme = useTheme();

  const [type, setType] = useState<string>('lecture');
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [rowError, setRowError] = useState('');
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const sorted = useMemo(() => sortPeriods(rows), [rows]);

  const problems = useMemo(() => {
    if (rows.length === 0) return [];
    return validateCalendarTimeline({ periods: rows, startDate, endDate });
  }, [rows, startDate, endDate]);

  const addRow = () => {
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      setRowError('Enter both dates as YYYY-MM-DD.');
      return;
    }
    if (start > end) {
      setRowError('The end date is before the start date.');
      return;
    }
    setRowError('');
    onChange([
      ...rows,
      { type, label: label.trim() || periodTypeLabel(type), startDate: start, endDate: end },
    ]);
    setLabel('');
    setStart('');
    setEnd('');
  };

  const removeRow = (target: PeriodRow) => {
    const index = rows.findIndex(
      (r) =>
        r.type === target.type &&
        r.startDate === target.startDate &&
        r.endDate === target.endDate &&
        r.label === target.label,
    );
    if (index < 0) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <View>
      {rows.length > 0 ? (
        <View style={styles.preview}>
          <TimelineBar periods={rows} />
        </View>
      ) : (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Add each row of your university&apos;s calendar — registration, each block of lectures,
          the mid-semester break, revision week and exams. Other students at your university will
          use this, so a missing block leaves their planner blank.
        </Text>
      )}

      {problems.length > 0 ? (
        <View style={[styles.problems, { borderColor: '#f97316' }]}>
          {problems.map((problem) => (
            <Text key={problem} style={[styles.problemText, { color: '#f97316' }]}>
              {problem}
            </Text>
          ))}
        </View>
      ) : null}

      {sorted.map((row, index) => (
        <View
          key={`${row.startDate}-${row.type}-${index}`}
          style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <View style={[styles.swatch, { backgroundColor: periodTypeColor(row.type) }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              {row.label || periodTypeLabel(row.type)}
            </Text>
            <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
              {periodTypeLabel(row.type)} · {row.startDate} → {row.endDate}
            </Text>
          </View>
          <Pressable onPress={() => removeRow(row)} hitSlop={10}>
            <Feather name="trash-2" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}

      <View style={[styles.adder, { borderColor: theme.border }]}>
        <Pressable
          onPress={() => setTypePickerOpen((open) => !open)}
          style={[styles.typeBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
        >
          <View style={[styles.swatch, { backgroundColor: periodTypeColor(type) }]} />
          <Text style={[styles.typeBtnText, { color: theme.text }]}>{periodTypeLabel(type)}</Text>
          <Feather
            name={typePickerOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textSecondary}
          />
        </Pressable>

        {typePickerOpen ? (
          <ScrollView style={styles.typeList} nestedScrollEnabled>
            {PERIOD_TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => {
                  setType(option.value);
                  setTypePickerOpen(false);
                }}
                style={styles.typeOption}
              >
                <View style={[styles.swatch, { backgroundColor: periodTypeColor(option.value) }]} />
                <Text style={[styles.typeOptionText, { color: theme.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={`Name (optional) — e.g. "${periodTypeLabel(type)}"`}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
        />
        <View style={styles.dateRow}>
          <TextInput
            value={start}
            onChangeText={setStart}
            placeholder="Start YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={[styles.input, styles.dateInput, { borderColor: theme.border, color: theme.text }]}
          />
          <TextInput
            value={end}
            onChangeText={setEnd}
            placeholder="End YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={[styles.input, styles.dateInput, { borderColor: theme.border, color: theme.text }]}
          />
        </View>

        {rowError ? <Text style={styles.rowError}>{rowError}</Text> : null}

        <Pressable
          onPress={addRow}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Feather name="plus" size={16} color={theme.textInverse} />
          <Text style={[styles.addBtnText, { color: theme.textInverse }]}>Add period</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginBottom: 14,
  },
  empty: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  problems: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  problemText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  adder: {
    marginTop: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  typeBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  typeList: {
    maxHeight: 190,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInput: {
    flex: 1,
  },
  rowError: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
