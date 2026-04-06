import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';

const ACCENT_PALETTE = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#6366f1',
];

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 60 : 44,
      paddingBottom: 8,
      gap: 12,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    headerInfo: { flex: 1 },
    headerIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
    headerSub: { fontSize: 13, fontWeight: '500', color: theme.textSecondary, marginTop: 2 },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 24 },

    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      letterSpacing: 1,
      marginBottom: 8,
      paddingLeft: 4,
      textTransform: 'uppercase',
    },

    groupCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
      position: 'relative',
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: theme.text },
    rowSub: { fontSize: 13, fontWeight: '400', color: theme.textSecondary, marginTop: 1 },
    rowCount: { fontSize: 15, fontWeight: '500', color: theme.textSecondary, marginRight: 4 },

    divider: {
      position: 'absolute',
      bottom: 0,
      left: 54,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
    },
  });
}

export default function NotesHub() {
  const { courses, notes, language, getSubjectColor } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const getColor = (courseId: string, idx: number): string => {
    const custom = getSubjectColor?.(courseId);
    if (custom && custom !== '#003366') return custom;
    return ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <View style={s.headerRow}>
          <View style={s.headerIconWrap}>
            <Feather name="book-open" size={20} color={theme.primary} />
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerTitle}>{T('studyTitle')}</Text>
            <Text style={s.headerSub}>{courses.length} subjects · {notes.length} notes</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Grouped Subject List */}
        <Text style={s.sectionLabel}>{T('yourSubjects')}</Text>
        <View style={s.groupCard}>
          {courses.map((course, idx) => {
            const count = notes.filter((n) => n.subjectId === course.id).length;
            const color = getColor(course.id, idx);

            return (
              <Pressable
                key={course.id}
                style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/notes-list' as any, params: { subjectId: course.id } })}
              >
                <View style={[s.colorDot, { backgroundColor: color }]} />
                <View style={s.rowBody}>
                  <Text style={s.rowTitle}>{course.id}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{course.name}</Text>
                </View>
                <Text style={s.rowCount}>{count}</Text>
                <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                <View style={s.divider} />
              </Pressable>
            );
          })}

          {/* Add Subject — last row inside the group */}
          <Pressable
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/add-subject' as any)}
          >
            <View style={[s.colorDot, { backgroundColor: theme.primary, borderRadius: 5 }]}>
              <Feather name="plus" size={10} color="#ffffff" />
            </View>
            <View style={s.rowBody}>
              <Text style={[s.rowTitle, { color: theme.primary }]}>{T('addSubject')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* Leaderboard */}
        <Text style={s.sectionLabel}>{T('leaderboard').toUpperCase()}</Text>
        <View style={s.groupCard}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/leaderboard' as any)}
          >
            <View style={[s.colorDot, { backgroundColor: '#f59e0b' }]} />
            <View style={s.rowBody}>
              <Text style={s.rowTitle}>{T('quizTaskRank')}</Text>
              <Text style={s.rowSub}>{T('viewLeaderboard')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
