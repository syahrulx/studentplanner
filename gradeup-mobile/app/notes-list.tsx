import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { COLORS, Icons } from '@/src/constants';

export default function NotesList() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { notes, courses } = useApp();
  const list = notes.filter((n) => n.subjectId === subjectId);
  const course = courses.find((c) => c.id === subjectId);

  const openNewNote = () => router.push({ pathname: '/notes-editor' as any, params: { subjectId } });

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Feather name="file-text" size={48} color={COLORS.navy} />
      </View>
      <Text style={styles.emptyTitle}>No notes yet</Text>
      <Text style={styles.emptySub}>
        Add notes from lectures and tutorials. You can turn them into flashcards or a quiz later.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
        onPress={openNewNote}
      >
        <Icons.Plus size={20} color={COLORS.white} />
        <Text style={styles.emptyBtnText}>Add your first note</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icons.ArrowRight size={20} color={COLORS.gray} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{subjectId} Notes</Text>
          <Text style={styles.subtitle}>STUDY REPOSITORY</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconRound}
            onPress={openNewNote}
          >
            <Icons.Plus size={20} color={COLORS.white} />
          </Pressable>
          <Pressable
            style={[styles.iconRound, styles.iconRoundSecondary]}
            onPress={() => router.push('/flashcard-review' as any)}
          >
            <Feather name="layers" size={20} color={COLORS.white} />
          </Pressable>
        </View>
      </View>
      <View style={styles.filterRow}>
        <View style={styles.filterChipActive}>
          <Text style={styles.filterChipText}>LECTURE</Text>
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, list.length === 0 && styles.listEmpty]}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.noteCard, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId: item.id } })}
          >
            <View style={styles.noteCardTop}>
              <View style={styles.noteTagPill}>
                <Text style={styles.noteTagText}>{item.tag.toUpperCase()}</Text>
              </View>
              <Text style={styles.noteDate}>{item.updatedAt}</Text>
            </View>
            <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.noteSnippet} numberOfLines={2}>{item.content}</Text>
          </Pressable>
        )}
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        onPress={openNewNote}
      >
        <Icons.Plus size={24} color={COLORS.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: 24, paddingTop: 48 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  headerTextWrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '700', color: COLORS.gray, letterSpacing: 1.2, marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
  iconRound: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRoundSecondary: {
    backgroundColor: COLORS.gray,
  },
  filterRow: { paddingHorizontal: 24, marginTop: 8, marginBottom: 8 },
  filterChipActive: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.navy,
  },
  filterChipText: { fontSize: 12, fontWeight: '800', color: COLORS.white, letterSpacing: 1 },
  list: { padding: 24, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    minHeight: 320,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: COLORS.navy + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 280,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.navy,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  emptyBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  noteCard: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: { opacity: 0.95 },
  noteCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteTagPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.navy + '10',
  },
  noteTagText: { fontSize: 10, fontWeight: '800', color: COLORS.navy, letterSpacing: 1 },
  noteDate: { fontSize: 11, fontWeight: '700', color: COLORS.gray },
  noteTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  noteSnippet: { fontSize: 13, color: COLORS.gray, lineHeight: 20 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
});
