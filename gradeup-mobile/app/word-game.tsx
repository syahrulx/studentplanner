import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Modal, ActivityIndicator, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import { getAllPuzzles } from '@/src/data/connectionsPuzzles';
import {
  loadProgress,
  getBestResult,
  getTotalScore,
  getGameLeaderboard,
  type ConnectionsProgress,
  type PuzzleResult,
  type GameLeaderboardEntry,
} from '@/src/lib/connectionsStorage';

type ActiveTab = 'puzzles' | 'rankings';
type RankView = 'stats' | 'friends' | 'global';

const PODIUM_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];

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


function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function mistakeEmoji(m: number): string {
  if (m === 0) return '🎯';
  if (m <= 1) return '💪';
  if (m <= 2) return '👍';
  return '😅';
}

export default function WordGameHub() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { friends, userId } = useCommunity();
  const puzzles = getAllPuzzles();

  const [tab, setTab] = useState<ActiveTab>('puzzles');
  const [rankView, setRankView] = useState<RankView>('stats');
  const [progress, setProgress] = useState<ConnectionsProgress | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // Leaderboard state
  const [entries, setEntries] = useState<GameLeaderboardEntry[]>([]);
  const [loadingRank, setLoadingRank] = useState(false);

  useEffect(() => {
    // Show tutorial on first ever visit
    AsyncStorage.getItem('@connections_tutorial_seen').then((v) => {
      if (!v) setShowTutorial(true);
    });
  }, []);

  // Reload progress every time user returns to this screen
  const reloadProgress = useCallback(() => {
    loadProgress().then(setProgress);
  }, []);
  useFocusEffect(reloadProgress);

  const dismissTutorial = () => {
    setShowTutorial(false);
    AsyncStorage.setItem('@connections_tutorial_seen', '1');
  };

  const friendIds = friends.map((f) => f.id);

  const loadRankings = useCallback(async () => {
    if (!userId || rankView === 'stats') return;
    setLoadingRank(true);
    try {
      const data = await getGameLeaderboard(rankView, userId, friendIds);
      setEntries(data);
    } catch {
      setEntries([]);
    }
    setLoadingRank(false);
  }, [rankView, userId, friendIds.length]);

  useEffect(() => {
    if (tab === 'rankings' && rankView !== 'stats') {
      loadRankings();
    }
  }, [tab, rankView, loadRankings]);

  const totalScore = progress ? getTotalScore(progress) : 0;
  const completedCount = progress?.results.length ?? 0;

  // Progressive unlock: show completed + next unlocked + 1 locked preview
  const nextUnlocked = completedCount + 1;
  const visiblePuzzles = useMemo(() => {
    return puzzles.filter((p) => p.id <= nextUnlocked + 1);
  }, [puzzles, nextUnlocked]);

  return (
    <View style={[s.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: theme.primary }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>🧩 Word Games</Text>
          <Text style={s.headerSub}>Connections · Rankings</Text>
        </View>
      </View>

      {/* Stats Banner */}
      <View style={[s.statsBanner, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: theme.primary }]}>{completedCount}</Text>
          <Text style={[s.statLabel, { color: theme.textSecondary }]}>Solved</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: theme.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: theme.primary }]}>{totalScore}</Text>
          <Text style={[s.statLabel, { color: theme.textSecondary }]}>Total Pts</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: theme.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: theme.primary }]}>🔥 {progress?.currentStreak ?? 0}</Text>
          <Text style={[s.statLabel, { color: theme.textSecondary }]}>Streak</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[s.tabs, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
        {(['puzzles', 'rankings'] as ActiveTab[]).map((t) => (
          <Pressable
            key={t}
            style={[s.tab, tab === t && { backgroundColor: theme.card, borderColor: theme.primary }]}
            onPress={() => setTab(t)}
          >
            <Feather
              name={t === 'puzzles' ? 'grid' : 'award'}
              size={14}
              color={tab === t ? theme.primary : theme.textSecondary}
            />
            <Text style={[s.tabText, { color: tab === t ? theme.text : theme.textSecondary }]}>
              {t === 'puzzles' ? 'Puzzles' : 'Rankings'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {tab === 'puzzles' ? (
          /* ─── Puzzles List ─── */
          <View style={s.puzzlesList}
          >
            {/* Current / Play Now card */}
            {nextUnlocked <= puzzles.length && (
              <Pressable
                onPress={() => router.push({ pathname: '/connections-game', params: { id: String(nextUnlocked) } } as any)}
                style={({ pressed }) => [
                  s.currentCard,
                  { backgroundColor: theme.primary },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View style={s.currentCardLeft}>
                  <Text style={s.currentCardTitle}>Puzzle #{nextUnlocked}</Text>
                  <Text style={s.currentCardSub}>Tap to play!</Text>
                </View>
                <View style={s.currentPlayBtn}>
                  <Feather name="play" size={22} color={theme.primary} />
                </View>
              </Pressable>
            )}

            {/* Completed puzzles */}
            {visiblePuzzles.filter((p) => p.id < nextUnlocked).reverse().map((p) => {
              const best = progress ? getBestResult(progress, p.id) : undefined;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: '/connections-game', params: { id: String(p.id) } } as any)}
                  style={({ pressed }) => [
                    s.puzzleCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: '#22c55e',
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={[s.puzzleNum, { backgroundColor: '#22c55e20' }]}>
                    <Text style={[s.puzzleNumText, { color: '#22c55e' }]}>✓</Text>
                  </View>
                  <View style={s.puzzleInfo}>
                    <Text style={[s.puzzleTitle, { color: theme.text }]}>Puzzle #{p.id}</Text>
                    <Text style={[s.puzzleSub, { color: theme.textSecondary }]}>
                      {p.groups.map((g) => g.label).join(' · ')}
                    </Text>
                  </View>
                  {best ? (
                    <View style={s.puzzleScore}>
                      <Text style={[s.puzzleScoreText, { color: '#22c55e' }]}>{best.score}</Text>
                      <Text style={[s.puzzleScoreUnit, { color: theme.textSecondary }]}>pts</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}

            {/* Locked preview (next one after current) */}
            {nextUnlocked + 1 <= puzzles.length && (
              <View style={[s.puzzleCard, { backgroundColor: theme.card, borderColor: theme.border, opacity: 0.5 }]}>
                <View style={[s.puzzleNum, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name="lock" size={16} color={theme.textSecondary} />
                </View>
                <View style={s.puzzleInfo}>
                  <Text style={[s.puzzleTitle, { color: theme.textSecondary }]}>Puzzle #{nextUnlocked + 1}</Text>
                  <Text style={[s.puzzleSub, { color: theme.textSecondary }]}>Complete Puzzle #{nextUnlocked} to unlock</Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          /* ─── Rankings Tab ─── */
          <View style={s.rankingsWrap}>
            <View style={[s.rankTabs, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              {(['stats', 'friends', 'global'] as const).map((rt) => (
                <Pressable
                  key={rt}
                  style={[s.subTab, rankView === rt && { backgroundColor: theme.card, borderColor: theme.primary }]}
                  onPress={() => setRankView(rt)}
                >
                  <Feather
                    name={rt === 'stats' ? 'bar-chart-2' : rt === 'friends' ? 'users' : 'globe'}
                    size={14}
                    color={rankView === rt ? theme.primary : theme.textSecondary}
                  />
                  <Text style={[s.subTabText, { color: rankView === rt ? theme.text : theme.textSecondary }]}>
                    {rt === 'stats' ? 'My Stats' : rt === 'friends' ? 'Friends' : 'Global'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {rankView === 'stats' ? (
              <>
                {/* Your Score Card */}
                <View style={[s.myScoreCard, { backgroundColor: theme.primary }]}>
                  <Feather name="award" size={28} color="#fff" />
                  <View style={s.myScoreInfo}>
                    <Text style={s.myScoreTitle}>Your Total Score</Text>
                    <Text style={s.myScoreVal}>{totalScore} pts</Text>
                  </View>
                  <View style={s.myScoreBadge}>
                    <Text style={[s.myScoreBadgeText, { color: theme.primary }]}>
                      {completedCount}/{puzzles.length}
                    </Text>
                  </View>
                </View>

                {/* Stats Row */}
                <View style={s.statsRow}>
                  <View style={[s.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.statBoxVal, { color: '#22c55e' }]}>
                      {progress?.results.filter((r) => r.mistakes === 0).length ?? 0}
                    </Text>
                    <Text style={[s.statBoxLabel, { color: theme.textSecondary }]}>Perfect 🎯</Text>
                  </View>
                  <View style={[s.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.statBoxVal, { color: '#f59e0b' }]}>🔥 {progress?.bestStreak ?? 0}</Text>
                    <Text style={[s.statBoxLabel, { color: theme.textSecondary }]}>Best Streak</Text>
                  </View>
                  <View style={[s.statBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[s.statBoxVal, { color: theme.primary }]}>
                      {progress?.results.length
                        ? Math.round(progress.results.reduce((a, r) => a + r.score, 0) / progress.results.length)
                        : 0}
                    </Text>
                    <Text style={[s.statBoxLabel, { color: theme.textSecondary }]}>Avg Score</Text>
                  </View>
                </View>

                {/* Per-puzzle results */}
                <Text style={[s.rankSectionTitle, { color: theme.text }]}>Score Breakdown</Text>
                {completedCount === 0 ? (
                  <View style={s.emptyState}>
                    <Feather name="bar-chart-2" size={40} color={theme.textSecondary} />
                    <Text style={[s.emptyText, { color: theme.textSecondary }]}>No scores yet.</Text>
                    <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Complete a puzzle to see your stats!</Text>
                  </View>
                ) : (
                  <View style={s.list}>
                    {(progress?.results ?? []).sort((a, b) => b.score - a.score).map((r) => (
                      <Pressable
                        key={r.puzzleId}
                        onPress={() => router.push({ pathname: '/connections-game', params: { id: String(r.puzzleId) } } as any)}
                        style={({ pressed }) => [
                          s.row,
                          { backgroundColor: theme.card, borderColor: theme.border },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <View style={[s.rowRankBadge, { backgroundColor: theme.primary + '15' }]}>
                          <Text style={[s.rowRankText, { color: theme.primary }]}>#{r.puzzleId}</Text>
                        </View>
                        <View style={s.rowBody}>
                          <Text style={[s.rowName, { color: theme.text }]}>Puzzle #{r.puzzleId}</Text>
                          <Text style={[s.rowSub, { color: theme.textSecondary }]}>
                            {mistakeEmoji(r.mistakes)} {r.mistakes} mistake{r.mistakes !== 1 ? 's' : ''} · {formatTime(r.timeMs)}
                          </Text>
                        </View>
                        <Text style={[s.rowXP, { color: theme.primary }]}>{r.score} pts</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              /* Leaderboard View */
              <>
                {loadingRank ? (
                  <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
                ) : entries.length === 0 ? (
                  <View style={s.emptyState}>
                    <Feather name="bar-chart-2" size={40} color={theme.textSecondary} />
                    <Text style={[s.emptyText, { color: theme.textSecondary }]}>No scores yet.</Text>
                    <Text style={[s.emptyHint, { color: theme.textSecondary }]}>Play puzzles to rank up!</Text>
                  </View>
                ) : (
                  <>
                    {/* Podium */}
                    {entries.length >= 3 && (
                      <View style={s.podium}>
                        {[1, 0, 2].map((idx) => {
                          const entry = entries[idx];
                          if (!entry) return <View key={idx} style={s.podiumSlot} />;
                          const isCenter = idx === 0;
                          return (
                            <View key={entry.user_id} style={[s.podiumSlot, isCenter && s.podiumCenter]}>
                              <View style={[s.podiumCrown, { borderColor: PODIUM_COLORS[idx] }]}>
                                <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={isCenter ? 56 : 44} />
                              </View>
                              {idx === 0 && <Feather name="award" size={20} color="#f59e0b" style={{ marginTop: 4 }} />}
                              <Text style={[s.podiumName, { color: theme.text }]} numberOfLines={1}>{entry.name?.split(' ')[0]}</Text>
                              <Text style={[s.podiumXP, { color: theme.textSecondary }]}>{entry.puzzles_solved} solved</Text>
                              <View style={[s.podiumBar, { backgroundColor: PODIUM_COLORS[idx] + '25', height: isCenter ? 60 : idx === 1 ? 44 : 32 }]}>
                                <Text style={[s.podiumRank, { color: PODIUM_COLORS[idx] }]}>#{idx + 1}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* List */}
                    <View style={s.list}>
                      {entries.slice(3).map((entry, idx) => {
                        const rank = idx + 4;
                        const isMe = entry.user_id === userId;
                        return (
                          <View
                            key={entry.user_id}
                            style={[
                              s.lbRow,
                              {
                                backgroundColor: isMe ? theme.primary + '10' : theme.card,
                                borderColor: isMe ? theme.primary : theme.border,
                              },
                            ]}
                          >
                            <Text style={[s.lbRowRank, { color: theme.textSecondary }]}>{rank}</Text>
                            <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={36} />
                            <View style={s.rowBody}>
                              <Text style={[s.rowName, { color: theme.text }]} numberOfLines={1}>
                                {isMe ? `${entry.name} (You)` : entry.name}
                              </Text>
                              <Text style={[s.rowSub, { color: theme.textSecondary }]}>{entry.puzzles_solved} solved</Text>
                            </View>
                            <Text style={[s.lbRowXP, { color: isMe ? theme.primary : theme.text }]}>{entry.total_score} pts</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}
        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ─── Tutorial Modal ─── */}
      <Modal visible={showTutorial} transparent animationType="fade">
        <View style={s.tutorialOverlay}>
          <View style={[s.tutorialCard, { backgroundColor: theme.card }]}>
            <Text style={[s.tutorialTitle, { color: theme.text }]}>🧩 How to Play</Text>
            <Text style={[s.tutorialHeading, { color: theme.primary }]}>Connections</Text>

            <View style={s.tutorialRules}>
              <Text style={[s.tutorialRule, { color: theme.text }]}>
                {'1.  You see 16 words on the board.'}
              </Text>
              <Text style={[s.tutorialRule, { color: theme.text }]}>
                {'2.  Find 4 groups of 4 words that share a hidden connection.'}
              </Text>
              <Text style={[s.tutorialRule, { color: theme.text }]}>
                {'3.  Select 4 words and tap Submit to guess.'}
              </Text>
              <Text style={[s.tutorialRule, { color: theme.text }]}>
                {'4.  You get 4 mistakes before game over.'}
              </Text>
            </View>

            <View style={s.tutorialColors}>
              <View style={[s.tutorialColorDot, { backgroundColor: '#fbbf24' }]} />
              <Text style={[s.tutorialColorLabel, { color: theme.textSecondary }]}>Easy</Text>
              <View style={[s.tutorialColorDot, { backgroundColor: '#34d399' }]} />
              <Text style={[s.tutorialColorLabel, { color: theme.textSecondary }]}>Medium</Text>
              <View style={[s.tutorialColorDot, { backgroundColor: '#60a5fa' }]} />
              <Text style={[s.tutorialColorLabel, { color: theme.textSecondary }]}>Hard</Text>
              <View style={[s.tutorialColorDot, { backgroundColor: '#a78bfa' }]} />
              <Text style={[s.tutorialColorLabel, { color: theme.textSecondary }]}>Tricky</Text>
            </View>

            <Pressable
              onPress={dismissTutorial}
              style={[s.tutorialBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={s.tutorialBtnText}>Got it, let's play! 🎮</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  statsBanner: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 20,
    borderWidth: 1, padding: 20, alignItems: 'center', justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  statDivider: { width: 1, height: 32 },

  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 20, padding: 4, borderRadius: 20, borderWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Puzzles
  puzzlesList: { gap: 14 },
  puzzleCard: {
    flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 18, borderWidth: 1.5, gap: 12,
  },
  puzzleNum: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  puzzleNumText: { fontSize: 14, fontWeight: '800' },
  puzzleInfo: { flex: 1 },
  puzzleTitle: { fontSize: 15, fontWeight: '700' },
  puzzleSub: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  puzzleScore: { alignItems: 'center' },
  puzzleScoreText: { fontSize: 18, fontWeight: '900' },
  puzzleScoreUnit: { fontSize: 10, fontWeight: '600' },

  // Rankings
  rankingsWrap: { gap: 16 },
  rankTabs: { flexDirection: 'row', padding: 4, borderRadius: 18, borderWidth: 1 },
  subTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', gap: 6 },
  subTabText: { fontSize: 13, fontWeight: '700' },
  myScoreCard: {
    flexDirection: 'row', alignItems: 'center', padding: 22, borderRadius: 20, gap: 14,
  },
  myScoreInfo: { flex: 1 },
  myScoreTitle: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  myScoreVal: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 2 },
  myScoreBadge: {
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
  },
  myScoreBadgeText: { fontSize: 15, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1, alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1,
  },
  statBoxVal: { fontSize: 18, fontWeight: '900' },
  statBoxLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  rankSectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '700' },
  emptyHint: { fontSize: 13 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 24, gap: 8, marginTop: 16 },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumCenter: { marginBottom: 0 },
  podiumCrown: { borderWidth: 3, borderRadius: 40, padding: 3 },
  podiumName: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  podiumXP: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  podiumBar: { width: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, marginTop: 8 },
  podiumRank: { fontSize: 14, fontWeight: '800' },

  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  lbRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  lbRowRank: { fontSize: 15, fontWeight: '800', width: 24, textAlign: 'center' },
  rowRankBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowRankText: { fontSize: 13, fontWeight: '800' },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowXP: { fontSize: 16, fontWeight: '800' },
  lbRowXP: { fontSize: 15, fontWeight: '800' },

  // Current play card
  currentCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 24, borderRadius: 20, marginBottom: 12,
  },
  currentCardLeft: {},
  currentCardTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  currentCardSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  currentPlayBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },

  // Tutorial
  tutorialOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  tutorialCard: {
    width: '100%', borderRadius: 24, padding: 28, alignItems: 'center',
  },
  tutorialTitle: { fontSize: 26, fontWeight: '900' },
  tutorialHeading: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  tutorialRules: { marginTop: 20, gap: 12, alignSelf: 'stretch' },
  tutorialRule: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  tutorialColors: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 20, flexWrap: 'wrap', justifyContent: 'center',
  },
  tutorialColorDot: { width: 14, height: 14, borderRadius: 7 },
  tutorialColorLabel: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  tutorialBtn: {
    marginTop: 24, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16,
  },
  tutorialBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
