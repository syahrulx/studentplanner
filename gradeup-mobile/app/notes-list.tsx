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
        <Text style={styles.title}>{course?.name ?? subjectId}</Text>
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
            <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.noteMeta}>{item.tag} • {item.updatedAt}</Text>
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
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },
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
  noteCard: { backgroundColor: COLORS.card, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  pressed: { opacity: 0.95 },
  noteTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  noteMeta: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
});
