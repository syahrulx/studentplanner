import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

type Tab = 'quiz' | 'task';

const quizRankings = [
  { rank: 1, name: 'Sarah Amin', sub: 'Quiz Master', score: '1,250 XP', isYou: false },
  { rank: 2, name: 'Syahrul Izwan', sub: 'Top 5%', score: '1,180 XP', isYou: true },
  { rank: 3, name: 'Zul Hilmi', sub: 'Rising Star', score: '950 XP', isYou: false },
  { rank: 4, name: 'Farah Wahida', sub: 'Consistent', score: '820 XP', isYou: false },
  { rank: 5, name: 'Iskandar Z.', sub: 'Rookie', score: '790 XP', isYou: false },
];

const taskRankings = [
  { rank: 1, name: 'Farah Wahida', sub: 'Efficiency Pro', score: '98% Done', isYou: false },
  { rank: 2, name: 'Syahrul Izwan', sub: 'Productive', score: '92% Done', isYou: true },
  { rank: 3, name: 'Sarah Amin', sub: 'On Track', score: '88% Done', isYou: false },
  { rank: 4, name: 'Iskandar Z.', sub: 'Catching Up', score: '75% Done', isYou: false },
  { rank: 5, name: 'Zul Hilmi', sub: 'Need Focus', score: '60% Done', isYou: false },
];

export default function Leaderboard() {
  const { user } = useApp();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('quiz');

  const rankings = activeTab === 'quiz' ? quizRankings : taskRankings;
  const displayRankings = rankings.map((r) => (r.isYou ? { ...r, name: `${user.name.split(' ')[0]} (You)` } : r));

  const rankColors = [theme.accent3, theme.primary, theme.secondary];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemeIcon name="arrowRight" size={20} color={theme.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <ThemeIcon name="leaderboard" size={24} color={theme.accent3} />
          <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <Pressable
          style={[styles.tab, activeTab === 'quiz' && { backgroundColor: theme.card, borderColor: theme.primary }]}
          onPress={() => setActiveTab('quiz')}
        >
          <ThemeIcon name="target" size={14} color={activeTab === 'quiz' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'quiz' ? theme.text : theme.textSecondary }]}>Quiz Rank</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'task' && { backgroundColor: theme.card, borderColor: theme.primary }]}
          onPress={() => setActiveTab('task')}
        >
          <ThemeIcon name="checkCircle" size={14} color={activeTab === 'task' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'task' ? theme.text : theme.textSecondary }]}>Task Rank</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {displayRankings.map((p, i) => {
          const isHighlight = p.rank <= 3;
          const rankColor = rankColors[p.rank - 1];
          return (
            <View
              key={`${activeTab}-${p.rank}`}
              style={[
                styles.row,
                {
                  backgroundColor: p.isYou ? theme.primary : theme.card,
                  borderColor: p.isYou ? theme.primary : theme.border,
                  borderWidth: 2,
                },
              ]}
            >
              <View style={[styles.rankBadge, { backgroundColor: isHighlight ? (p.isYou ? theme.textInverse : rankColor + '33') : theme.backgroundSecondary }]}>
                {p.rank === 1 && <ThemeIcon name="award" size={18} color={theme.accent3} />}
                {p.rank !== 1 && <Text style={[styles.rankNum, { color: isHighlight ? rankColor : theme.textSecondary }]}>{p.rank}</Text>}
              </View>
              <View style={styles.rowCenter}>
                <Text style={[styles.name, { color: p.isYou ? theme.textInverse : theme.text }]}>{p.name}</Text>
                <Text style={[styles.sub, { color: p.isYou ? theme.textInverse + 'cc' : theme.textSecondary }]}>{p.sub}</Text>
              </View>
              <Text style={[styles.score, { color: p.isYou ? theme.textInverse : theme.text }]}>{p.score}</Text>
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <ThemeIcon name="star" size={16} color={theme.accent3} />
        <Text style={[styles.footerText, { color: theme.textSecondary }]}>
          &ldquo;The best way to predict your future is to create it.&rdquo; — Keep going!
        </Text>
      </View>
      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  placeholder: { width: 44 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 20, marginBottom: 24, borderWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  tabText: { fontSize: 12, fontWeight: '800' },
  list: { gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
  },
  rankBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  rankNum: { fontSize: 18, fontWeight: '800' },
  rowCenter: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  score: { fontSize: 15, fontWeight: '800' },
  footer: { marginTop: 24, padding: 20, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerText: { flex: 1, fontSize: 12, fontStyle: 'italic' },
});
