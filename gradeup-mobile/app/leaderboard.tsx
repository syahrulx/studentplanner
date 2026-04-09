import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { useCommunity } from '@/src/context/CommunityContext';
import * as quizApi from '@/src/lib/quizApi';
import type { LeaderboardEntry } from '@/src/lib/quizApi';

type Tab = 'friends' | 'global';
type TimeFilter = 'all' | 'week' | 'today';

const PODIUM_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];
const PODIUM_ICONS: Record<number, string> = { 0: 'award', 1: 'award', 2: 'award' };

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 48 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[idx], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function Leaderboard() {
  const { user } = useApp();
  const theme = useTheme();
  const { friends, userId } = useCommunity();

  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const friendIds = friends.map((f) => f.id);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await quizApi.getLeaderboard(activeTab, userId, friendIds, timeFilter);
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [activeTab, timeFilter, userId, friendIds.length]);

  useEffect(() => { loadData(); }, [loadData]);

  const myEntry = entries.find((e) => e.user_id === userId);
  const myRank = myEntry ? entries.indexOf(myEntry) + 1 : null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <ScrollView style={[s.container, { backgroundColor: theme.background }]} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>
        <View style={s.headerTitleRow}>
          <ThemeIcon name="leaderboard" size={24} color="#f59e0b" />
          <Text style={[s.title, { color: theme.text }]}>Leaderboard</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        {(['friends', 'global'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[s.tab, activeTab === tab && { backgroundColor: theme.card, borderColor: theme.primary }]}
            onPress={() => setActiveTab(tab)}
          >
            <Feather
              name={tab === 'friends' ? 'users' : 'globe'}
              size={14}
              color={activeTab === tab ? theme.primary : theme.textSecondary}
            />
            <Text style={[s.tabText, { color: activeTab === tab ? theme.text : theme.textSecondary }]}>
              {tab === 'friends' ? 'Friends' : 'Global'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Time filter */}
      <View style={s.filterRow}>
        {(['all', 'week', 'today'] as TimeFilter[]).map((f) => (
          <Pressable
            key={f}
            style={[
              s.filterPill,
              timeFilter === f
                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                : { backgroundColor: theme.card, borderColor: theme.border },
            ]}
            onPress={() => setTimeFilter(f)}
          >
            <Text style={[s.filterText, { color: timeFilter === f ? '#fff' : theme.textSecondary }]}>
              {f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'Today'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* My rank card */}
      {myEntry && (
        <View style={[s.myCard, { backgroundColor: theme.primary }]}>
          <View style={s.myCardLeft}>
            <Text style={s.myRank}>#{myRank}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.myName} numberOfLines={1}>{user.name}</Text>
              <Text style={s.mySub}>{myEntry.games_played} games played</Text>
            </View>
          </View>
          <View style={s.myXP}>
            <Feather name="zap" size={16} color="#fff" />
            <Text style={s.myXPText}>{myEntry.total_xp} XP</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.emptyState}>
          <Feather name="bar-chart-2" size={40} color={theme.textSecondary} />
          <Text style={[s.emptyText, { color: theme.textSecondary }]}>No quiz scores yet.</Text>
          <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Play a quiz to appear on the leaderboard!</Text>
        </View>
      ) : (
        <>
          {/* Podium */}
          {podium.length >= 3 && (
            <View style={s.podium}>
              {[1, 0, 2].map((idx) => {
                const entry = podium[idx];
                if (!entry) return <View key={idx} style={s.podiumSlot} />;
                const isCenter = idx === 0;
                return (
                  <View key={entry.user_id} style={[s.podiumSlot, isCenter && s.podiumCenter]}>
                    <View style={[s.podiumCrown, { borderColor: PODIUM_COLORS[idx] }]}>
                      <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={isCenter ? 56 : 44} />
                    </View>
                    {idx === 0 && <Feather name="award" size={20} color="#f59e0b" style={{ marginTop: 4 }} />}
                    <Text style={[s.podiumName, { color: theme.text }]} numberOfLines={1}>{entry.name?.split(' ')[0]}</Text>
                    <Text style={[s.podiumXP, { color: theme.textSecondary }]}>{entry.total_xp} XP</Text>
                    <View style={[s.podiumBar, { backgroundColor: PODIUM_COLORS[idx] + '25', height: isCenter ? 60 : idx === 1 ? 44 : 32 }]}>
                      <Text style={[s.podiumRank, { color: PODIUM_COLORS[idx] }]}>#{idx + 1}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Rest of the list */}
          <View style={s.list}>
            {rest.map((entry, idx) => {
              const rank = idx + 4;
              const isMe = entry.user_id === userId;
              return (
                <View
                  key={entry.user_id}
                  style={[
                    s.row,
                    {
                      backgroundColor: isMe ? theme.primary + '10' : theme.card,
                      borderColor: isMe ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[s.rowRank, { color: theme.textSecondary }]}>{rank}</Text>
                  <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={36} />
                  <View style={s.rowBody}>
                    <Text style={[s.rowName, { color: theme.text }]} numberOfLines={1}>{isMe ? `${entry.name} (You)` : entry.name}</Text>
                    <Text style={[s.rowSub, { color: theme.textSecondary }]}>{entry.games_played} games</Text>
                  </View>
                  <Text style={[s.rowXP, { color: isMe ? theme.primary : theme.text }]}>{entry.total_xp} XP</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Footer */}
      <View style={[s.footer, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        <ThemeIcon name="star" size={16} color="#f59e0b" />
        <Text style={[s.footerText, { color: theme.textSecondary }]}>
          Play more quizzes to climb the rankings!
        </Text>
      </View>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 24 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },

  tabs: { flexDirection: 'row', padding: 4, borderRadius: 18, marginBottom: 14, borderWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '700' },

  myCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 18, marginBottom: 20 },
  myCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 10 },
  myRank: { fontSize: 24, fontWeight: '800', color: '#fff' },
  myName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  mySub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  myXP: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  myXPText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '700' },
  emptyHint: { fontSize: 13 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24, gap: 8 },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumCenter: { marginBottom: 0 },
  podiumCrown: { borderWidth: 3, borderRadius: 40, padding: 3 },
  podiumName: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  podiumXP: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  podiumBar: { width: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, marginTop: 8 },
  podiumRank: { fontSize: 14, fontWeight: '800' },

  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  rowRank: { fontSize: 15, fontWeight: '800', width: 24, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  rowXP: { fontSize: 15, fontWeight: '800' },

  footer: { marginTop: 24, padding: 20, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerText: { flex: 1, fontSize: 12, fontStyle: 'italic' },
});
