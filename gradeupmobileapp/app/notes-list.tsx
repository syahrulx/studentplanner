import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../src/constants';
import { useAppContext } from '../src/context/AppContext';
import { Note } from '../src/types';

const FILTER_TABS = ['Lecture', 'Tutorial', 'Exam', 'Important'] as const;

export default function NotesListScreen() {
  const router = useRouter();
  const { notes, selectedSubjectId, setSelectedNote } = useAppContext();

  const handleAddNote = () => {
    setSelectedNote(null);
    router.push('/notes-editor');
  };
  const [activeFilter, setActiveFilter] = useState<'Lecture' | 'Tutorial' | 'Exam' | 'Important'>('Lecture');

  const subjectId = selectedSubjectId || '';
  const filteredNotes = notes.filter(
    (n) => n.subjectId === subjectId && n.tag === activeFilter
  );

  const onPressNote = (note: Note) => {
    setSelectedNote(note);
    router.push('/notes-editor');
  };

  const getTagColor = (tag: string) =>
    tag === 'Lecture' ? COLORS.blue : COLORS.gold;

  const renderNoteCard = ({ item }: { item: Note }) => (
    <Pressable style={styles.noteCard} onPress={() => onPressNote(item)}>
      <View style={[styles.tagBadge, { backgroundColor: getTagColor(item.tag) }]}>
        <Text style={styles.tagText}>{item.tag}</Text>
      </View>
      <Text style={styles.noteDate}>{item.updatedAt}</Text>
      <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.notePreview} numberOfLines={2}>{item.content}</Text>
    </Pressable>
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Feather name="list" size={48} color={COLORS.textSecondary} />
      <Text style={styles.emptyText}>No notes yet</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={COLORS.navy} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{subjectId} Notes</Text>
          <Text style={styles.subtitle}>Study Repository</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={handleAddNote}>
          <Feather name="plus" size={24} color={COLORS.white} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.filterTab, activeFilter === tab && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab)}
          >
            <Text style={[styles.filterText, activeFilter === tab && styles.filterTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerCenter: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.navy,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: COLORS.white,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
  },
  filterTabActive: {
    backgroundColor: COLORS.navy,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterTextActive: {
    color: COLORS.white,
  },
  listContent: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  noteCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  noteDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 6,
  },
  notePreview: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 16,
  },
});
