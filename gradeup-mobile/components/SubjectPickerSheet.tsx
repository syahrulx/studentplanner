import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import {
  buildSubjectOptions,
  courseFromCode,
  isUsableSubjectCode,
  subjectKey,
  type SubjectOption,
} from '@/src/lib/subjectOptions';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Currently chosen subject id, so the row can be ticked. */
  selectedId: string;
  onSelect: (courseId: string) => void;
  /** Listed even when it is not a saved course — the task's existing subject. */
  includeId?: string;
  /** Add Task offers "no subject"; Task Details does not. */
  allowNoSubject?: boolean;
  noSubjectId?: string;
  noSubjectLabel?: string;
  noSubjectHint?: string;
  title?: string;
};

type Row =
  | { kind: 'none' }
  | { kind: 'heading'; label: string }
  | { kind: 'subject'; option: SubjectOption }
  | { kind: 'add' };

/**
 * One subject picker for Add Task and Task Details.
 *
 * Both screens used to list `courses` and nothing else, so a subject that
 * exists only in the class timetable could not be chosen — the reported case
 * was CCS21003, present in Timetable and absent here, which left a new
 * assignment with nowhere to file itself. Timetable subjects are now offered
 * under their own heading, and anything in neither list can be typed in.
 *
 * Choosing a timetable subject, or typing a new code, saves it as a course, so
 * it is a real subject everywhere from then on rather than a one-off string.
 */
export default function SubjectPickerSheet({
  visible,
  onClose,
  selectedId,
  onSelect,
  includeId,
  allowNoSubject = false,
  noSubjectId = '',
  noSubjectLabel = 'No subject',
  noSubjectHint = 'Not related to any subject',
  title,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { courses, timetable, addCourse, language } = useApp();
  const T = useTranslations(language);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // A sheet that reopens should start from the list, not from a half-typed code.
  useEffect(() => {
    if (!visible) {
      setAdding(false);
      setDraft('');
      setError(null);
    }
  }, [visible]);

  const options = useMemo(
    () => buildSubjectOptions({ courses, timetable, includeId }),
    [courses, timetable, includeId],
  );

  const rows = useMemo<Row[]>(() => {
    const saved = options.filter((o) => o.source === 'course');
    const fromTimetable = options.filter((o) => o.source === 'timetable');
    const list: Row[] = [];
    if (allowNoSubject) list.push({ kind: 'none' });
    for (const option of saved) list.push({ kind: 'subject', option });
    if (fromTimetable.length > 0) {
      list.push({ kind: 'heading', label: 'FROM YOUR TIMETABLE' });
      for (const option of fromTimetable) list.push({ kind: 'subject', option });
    }
    // While the field is open the add box is rendered under the list, not in
    // it: as a last row it sat on the sheet's bottom edge, with its own Add
    // button below the fold and the keyboard about to cover what was left.
    if (!adding) list.push({ kind: 'add' });
    return list;
  }, [options, allowNoSubject, adding]);

  const choose = (option: SubjectOption) => {
    // A timetable subject is only a row until it is picked; then it becomes a
    // course, so the planner, grades and the next task all know it.
    if (option.source === 'timetable') {
      addCourse({ id: option.id, name: option.name || option.id, creditHours: 0, workload: [] });
    }
    onSelect(option.id);
    onClose();
  };

  const commitDraft = () => {
    const code = draft.trim();
    if (!isUsableSubjectCode(code)) {
      setError('Enter the subject code, e.g. CCS21003.');
      return;
    }
    const existing = options.find((o) => subjectKey(o.id) === subjectKey(code));
    if (existing) {
      choose(existing);
      return;
    }
    const course = courseFromCode(code);
    addCourse(course);
    onSelect(course.id);
    onClose();
  };


  const addBox = adding ? (
    <View style={styles.addBox}>
      <Text style={[styles.addTitle, { color: theme.text }]}>New subject</Text>
      <Text style={[styles.addHint, { color: theme.textSecondary }]}>
        Type the code exactly as your faculty writes it. It is saved as a subject, so
        the next task can pick it from the list.
      </Text>
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={(v) => {
          setDraft(v);
          if (error) setError(null);
        }}
        placeholder="Subject code, e.g. CCS21003"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={commitDraft}
        style={[
          styles.input,
          { borderColor: error ? '#FF453A' : theme.border, color: theme.text, backgroundColor: theme.background },
        ]}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.addActions}>
        <Pressable
          onPress={() => {
            setAdding(false);
            setDraft('');
            setError(null);
          }}
          hitSlop={8}
          style={styles.addCancel}
        >
          <Text style={[styles.addCancelText, { color: theme.textSecondary }]}>{T('cancel')}</Text>
        </Pressable>
        <Pressable
          onPress={commitDraft}
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.addBtnText, { color: theme.textInverse }]}>Add subject</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const renderRow = (row: Row, index: number) => {
    const divider =
      index < rows.length - 1
        ? { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }
        : null;

    if (row.kind === 'none') {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            divider,
            pressed && { backgroundColor: theme.backgroundSecondary },
          ]}
          onPress={() => {
            onSelect(noSubjectId);
            onClose();
          }}
        >
          <View style={styles.rowMain}>
            <Feather name="slash" size={16} color={theme.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{noSubjectLabel}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{noSubjectHint}</Text>
            </View>
          </View>
          {selectedId === noSubjectId ? <Feather name="check" size={20} color={theme.primary} /> : null}
        </Pressable>
      );
    }

    if (row.kind === 'heading') {
      return (
        <View style={styles.heading}>
          <Text style={[styles.headingText, { color: theme.textSecondary }]}>{row.label}</Text>
        </View>
      );
    }

    if (row.kind === 'add') {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: theme.backgroundSecondary },
          ]}
          onPress={() => {
            setAdding(true);
            setError(null);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <View style={styles.rowMain}>
            <Feather name="plus-circle" size={16} color={theme.primary} />
            <Text style={[styles.rowTitle, { color: theme.primary }]}>Add a subject</Text>
          </View>
        </Pressable>
      );
    }
    
    const { option } = row;
    const showName = option.name && subjectKey(option.name) !== subjectKey(option.id);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          divider,
          pressed && { backgroundColor: theme.backgroundSecondary },
        ]}
        onPress={() => choose(option)}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{option.id}</Text>
            {showName ? (
              <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                {option.name}
              </Text>
            ) : null}
          </View>
        </View>
        {subjectKey(selectedId) === subjectKey(option.id) ? (
          <Feather name="check" size={20} color={theme.primary} />
        ) : null}
      </Pressable>
    );
  };

  // iOS fills its page sheet; the Android sheet is content-sized, so the list
  // must be capped rather than flexed — `flex: 1` inside a height-less bottom
  // sheet measures as zero and the rows never appear.
  const list = (
    <FlatList
      data={rows}
      keyExtractor={(row, i) => `${row.kind}-${row.kind === 'subject' ? row.option.id : i}-${i}`}
      keyboardShouldPersistTaps="handled"
      style={Platform.OS === 'ios' ? styles.list : styles.listAndroid}
      renderItem={({ item, index }) => renderRow(item, index)}
    />
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      {...(Platform.OS === 'ios' ? { presentationStyle: 'pageSheet' as const } : { transparent: true })}
      onRequestClose={onClose}
    >
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          behavior="padding"
          style={[styles.iosContainer, { paddingTop: insets.top, backgroundColor: theme.backgroundSecondary }]}
        >
          <View style={[styles.grab, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.textSecondary }]}>
              {title ?? T('subjectLabel')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={[styles.headerDone, { color: theme.primary }]}>{T('done')}</Text>
            </Pressable>
          </View>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            {adding ? addBox : list}
          </View>
        </KeyboardAvoidingView>
      ) : (
        // An RN Modal is its own Android window and does not inherit
        // adjustResize, so nothing moves when the keyboard opens: anchored to
        // the bottom, the typing step sat behind it. While typing the sheet
        // becomes a dialog near the top, which no keyboard can reach.
        <Pressable style={[styles.androidBg, adding && styles.androidBgAdding]} onPress={onClose}>
          <Pressable
            style={[
              styles.androidSheet,
              adding && styles.androidSheetAdding,
              { backgroundColor: theme.card, paddingBottom: adding ? 8 : Math.max(insets.bottom, 12) },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.androidHeader}>
              <Text style={[styles.androidTitle, { color: theme.text }]}>{title ?? T('subjectLabel')}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            {adding ? addBox : list}
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  iosContainer: { flex: 1 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  headerDone: { fontSize: 16, fontWeight: '700' },
  card: { flex: 1, marginHorizontal: 16, marginBottom: 16, borderRadius: 16, overflow: 'hidden' },
  list: { flex: 1 },
  listAndroid: { flexGrow: 0, maxHeight: 420 },

  androidBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  androidBgAdding: { justifyContent: 'flex-start', paddingTop: '16%' },
  androidSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 8,
    paddingTop: 14,
    maxHeight: '75%',
  },
  androidSheetAdding: {
    marginHorizontal: 16,
    borderRadius: 22,
  },
  androidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  androidTitle: { fontSize: 17, fontWeight: '800' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 2 },

  heading: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  headingText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },

  // Replaces the list rather than sitting under it: Android resizes the window
  // for the keyboard, and a 420 pt list above this pushed the field and both
  // buttons out of what was left.
  addBox: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  addTitle: { fontSize: 17, fontWeight: '800' },
  addHint: { fontSize: 13, lineHeight: 19, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  error: { color: '#FF453A', fontSize: 13, fontWeight: '600' },
  addActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  addCancel: { paddingVertical: 10, paddingHorizontal: 6 },
  addCancelText: { fontSize: 15, fontWeight: '600' },
  addBtn: { borderRadius: 100, paddingVertical: 11, paddingHorizontal: 20 },
  addBtnText: { fontSize: 15, fontWeight: '700' },
});
