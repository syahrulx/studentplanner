import { View, Text, Pressable, FlatList, StyleSheet, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';

const NAVY = '#003366';
const BG = '#f8fafc';
const CARD = '#ffffff';
const TEXT_PRIMARY = '#0f172a';
const TEXT_SECONDARY = '#94a3b8';
const DIVIDER = '#f1f5f9';

export default function NotesList() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const { notes, courses } = useApp();
  
  const list = notes.filter((n) => n.subjectId === subjectId);
  const course = courses.find((c) => c.id === subjectId);

  const openNewNote = () => router.push({ pathname: '/notes-editor' as any, params: { subjectId } });

  const emptyComponent = (
    <View style={styles.emptyWrap}>
      <Feather name="folder" size={42} color="#cbd5e1" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No Notes Yet</Text>
      <Text style={styles.emptySub}>
        Tap the + icon in the top right to create your first note for {subjectId}.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* iOS Style Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={NAVY} />
            <Text style={styles.backText}>Study</Text>
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/flashcard-review' as any)}>
            <Feather name="layers" size={22} color={NAVY} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={openNewNote}>
            <Feather name="plus" size={24} color={NAVY} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.pageTitle}>{subjectId} Notes</Text>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, list.length === 0 && styles.listEmpty]}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item, index }) => {
          const isLast = index === list.length - 1;
          return (
            <View style={[styles.cardGroup, index === 0 && styles.cardGroupFirst, isLast && styles.cardGroupLast]}>
              <Pressable
                style={({ pressed }) => [styles.noteRow, pressed && { backgroundColor: '#f8fafc' }]}
                onPress={() => router.push({ pathname: '/notes-editor' as any, params: { subjectId, noteId: item.id } })}
              >
                <View style={styles.noteRowBody}>
                  <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.noteSnippet} numberOfLines={2}>{item.content}</Text>
                </View>
                <View style={styles.noteRowMeta}>
                  <Text style={styles.noteDate}>{item.updatedAt}</Text>
                  <Feather name="chevron-right" size={16} color="#cbd5e1" />
                </View>

                {!isLast && <View style={styles.divider} />}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header (Apple Notes style)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: { fontSize: 17, color: NAVY, fontWeight: '400', marginTop: -1 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingRight: 8,
  },
  iconBtn: {
    padding: 4,
  },

  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: 4,
  },

  // List & Cards
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },

  cardGroup: {
    backgroundColor: CARD,
    overflow: 'hidden',
  },
  cardGroupFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardGroupLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  noteRowBody: { flex: 1, paddingRight: 16 },
  noteTitle: { fontSize: 17, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 2 },
  noteSnippet: { fontSize: 13, color: TEXT_SECONDARY, lineHeight: 18 },
  
  noteRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteDate: { fontSize: 14, color: TEXT_SECONDARY },

  divider: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },

  // Empty State
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: 60,
  },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
});
