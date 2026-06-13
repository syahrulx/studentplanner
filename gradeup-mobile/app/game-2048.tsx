import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, ScrollView,
  PanResponder, useWindowDimensions, Image, ActivityIndicator, Alert,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { usePreventRemove } from '@react-navigation/native';
import { contrastText } from '@/src/lib/contrast';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useCommunity } from '@/src/context/CommunityContext';
import {
  move, spawnTile, createInitialTiles, isGameOver, bestTileValue, hasReached,
  SIZE, WIN_VALUE, type Tile, type Direction,
} from '@/src/lib/game2048Engine';
import {
  loadProgress, saveGameResult, syncScoresFromSupabase, pointsForTile,
  getGame2048Leaderboard,
  type Game2048Progress, type Game2048LeaderboardEntry,
} from '@/src/lib/game2048Storage';

type Tab = 'play' | 'rankings';
type RankView = 'stats' | 'friends' | 'global';

const ANIM_MS = 110;
const PODIUM_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];

// Theme-aware soft tile palette. Low tiles are gentle tints of the active
// primary; higher tiles ramp through the theme accents up to a warm gold finish.
function tileColors(value: number, theme: ReturnType<typeof useTheme>): { bg: string; text: string } {
  const onDarkText = '#ffffff';
  const map: Record<number, { bg: string; text: string }> = {
    2: { bg: theme.primary + '22', text: theme.text },
    4: { bg: theme.primary + '3A', text: theme.text },
    8: { bg: theme.primary + '60', text: onDarkText },
    16: { bg: theme.primary + '85', text: onDarkText },
    32: { bg: theme.primary + 'AA', text: onDarkText },
    64: { bg: theme.primary, text: onDarkText },
    128: { bg: theme.secondary, text: onDarkText },
    256: { bg: theme.accent2 || theme.secondary, text: onDarkText },
    512: { bg: theme.accent3 || theme.warning, text: onDarkText },
    1024: { bg: theme.warning, text: onDarkText },
    2048: { bg: '#f59e0b', text: onDarkText },
  };
  return map[value] || { bg: theme.danger, text: onDarkText };
}

function tileFontSize(value: number, cellSize: number): number {
  const digits = String(value).length;
  if (digits <= 2) return cellSize * 0.42;
  if (digits === 3) return cellSize * 0.34;
  if (digits === 4) return cellSize * 0.27;
  return cellSize * 0.22;
}

interface TileGeom { cellSize: number; gap: number; padding: number }

function TileView({ tile, geom, theme }: { tile: Tile; geom: TileGeom; theme: ReturnType<typeof useTheme> }) {
  const { cellSize, gap, padding } = geom;
  const x = padding + tile.col * (cellSize + gap);
  const y = padding + tile.row * (cellSize + gap);

  const pos = useRef(new Animated.ValueXY({ x, y })).current;
  const scale = useRef(new Animated.Value(tile.isNew ? 0 : 1)).current;

  // Slide to the new cell whenever row/col change.
  useEffect(() => {
    Animated.timing(pos, { toValue: { x, y }, duration: ANIM_MS, useNativeDriver: true }).start();
  }, [x, y]);

  // Spawn pop (runs once on mount for freshly spawned tiles).
  useEffect(() => {
    if (tile.isNew) {
      scale.setValue(0);
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge pop.
  useEffect(() => {
    if (tile.merged) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.16, duration: 80, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]).start();
    }
  }, [tile.merged, scale]);

  const colors = tileColors(tile.value, theme);

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: cellSize,
          height: cellSize,
          backgroundColor: colors.bg,
          transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }],
        },
      ]}
    >
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: tileFontSize(tile.value, cellSize) }}>
        {tile.value}
      </Text>
    </Animated.View>
  );
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
  const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette[idx], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function Game2048Screen() {
  const theme = useTheme();
  const themeId = useThemeId();
  const isDark = isDarkTheme(themeId);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { friends, userId } = useCommunity();

  const [tab, setTab] = useState<Tab>('play');

  // ─── Board geometry (responsive to screen width) ───
  const geom = useMemo<TileGeom>(() => {
    const boardSize = Math.min(width - 32, 380);
    const gap = Math.round(boardSize * 0.028);
    const padding = gap;
    const cellSize = Math.floor((boardSize - padding * 2 - gap * (SIZE - 1)) / SIZE);
    return { cellSize, gap, padding };
  }, [width]);
  const boardPixels = geom.padding * 2 + geom.cellSize * SIZE + geom.gap * (SIZE - 1);

  // ─── Game state (mirrored into refs to avoid stale closures during animation) ───
  const [tiles, setTilesState] = useState<Tile[]>([]);
  const tilesRef = useRef<Tile[]>([]);
  const nextIdRef = useRef(1);
  const setTiles = useCallback((next: Tile[]) => { tilesRef.current = next; setTilesState(next); }, []);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [moves, setMoves] = useState(0);
  const movesRef = useRef(0);
  const [bestScore, setBestScore] = useState(0);
  const [over, setOver] = useState(false);
  const overRef = useRef(false);
  const [won, setWon] = useState(false);
  const keepGoingRef = useRef(false);
  const lockRef = useRef(false);
  const [progress, setProgress] = useState<Game2048Progress | null>(null);
  const [lastPoints, setLastPoints] = useState(0);

  const startNewGame = useCallback(() => {
    const init = createInitialTiles();
    nextIdRef.current = init.nextId;
    setTiles(init.tiles);
    setScore(0); scoreRef.current = 0;
    setMoves(0); movesRef.current = 0;
    setOver(false); overRef.current = false;
    setWon(false); keepGoingRef.current = false;
    setLastPoints(0);
    lockRef.current = false;
  }, [setTiles]);

  // Load local + remote progress, then start a fresh game.
  useEffect(() => {
    (async () => {
      const local = await loadProgress();
      setProgress(local);
      setBestScore(local.bestScore);
      const merged = await syncScoresFromSupabase();
      if (merged) { setProgress(merged); setBestScore(merged.bestScore); }
    })();
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishGame = useCallback(async (finalTiles: Tile[]) => {
    overRef.current = true;
    setOver(true);
    const top = bestTileValue(finalTiles);
    const result = { score: scoreRef.current, bestTile: top, moves: movesRef.current, won: hasReached(finalTiles, WIN_VALUE) };
    const { progress: updated, pointsAwarded } = await saveGameResult(result);
    setProgress(updated);
    setBestScore(updated.bestScore);
    setLastPoints(pointsAwarded);
  }, []);

  const handleMove = useCallback((dir: Direction) => {
    if (lockRef.current || overRef.current) return;
    const res = move(tilesRef.current, dir);
    if (!res.moved) return;

    lockRef.current = true;
    // Phase 1: slide survivors + merge-source ghosts into place.
    setTiles([...res.tiles, ...res.ghosts]);
    setScore((prev) => { const ns = prev + res.gained; scoreRef.current = ns; return ns; });
    movesRef.current += 1;
    setMoves(movesRef.current);

    setTimeout(() => {
      // Phase 2: drop ghosts, spawn a new tile, evaluate win / game over.
      let survivors = res.tiles;
      const spawned = spawnTile(survivors, nextIdRef.current);
      if (spawned) { survivors = [...survivors, spawned]; nextIdRef.current += 1; }
      setTiles(survivors);

      if (!keepGoingRef.current && hasReached(survivors, WIN_VALUE)) setWon(true);
      if (isGameOver(survivors)) finishGame(survivors);
      lockRef.current = false;
    }, ANIM_MS + 10);
  }, [setTiles, finishGame]);

  // ─── Swipe detection ───
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderRelease: (_e, g) => {
          const THRESH = 22;
          if (Math.abs(g.dx) < THRESH && Math.abs(g.dy) < THRESH) return;
          if (Math.abs(g.dx) > Math.abs(g.dy)) {
            handleMove(g.dx > 0 ? 'right' : 'left');
          } else {
            handleMove(g.dy > 0 ? 'down' : 'up');
          }
        },
      }),
    [handleMove],
  );

  const continuePlaying = () => { keepGoingRef.current = true; setWon(false); };

  // Persist the current in-progress game so the score counts toward the high score.
  const saveCurrentProgress = useCallback(async () => {
    if (overRef.current) return; // already saved when the game ended
    const finalTiles = tilesRef.current;
    const { progress: updated } = await saveGameResult({
      score: scoreRef.current,
      bestTile: bestTileValue(finalTiles),
      moves: movesRef.current,
      won: hasReached(finalTiles, WIN_VALUE),
    });
    setProgress(updated);
    setBestScore(updated.bestScore);
  }, []);

  // Intercept every way out of the game (header back, Exit button, iOS swipe-back,
  // Android hardware back) to confirm leaving and save the score as a high score.
  // usePreventRemove is the native-stack-safe way to do this (disables the gesture
  // while active instead of cancelling it after the fact). Only active while there
  // is an unsaved in-progress game.
  usePreventRemove(moves > 0 && !over, ({ data }) => {
    Alert.alert(
      'Leave game?',
      'Do you want to leave the game? Your current score will be saved as your high score.',
      [
        // Cancel = do nothing → the removal stays prevented, so the player remains
        // on the game screen exactly where they left off.
        { text: 'Stay', style: 'cancel', onPress: () => {} },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await saveCurrentProgress();
            navigation.dispatch(data.action);
          },
        },
      ],
      { cancelable: false },
    );
  });

  // The iOS swipe-back gesture is removed natively before usePreventRemove can hold
  // the screen, which strands the player even if they pick "Stay". So we disable the
  // swipe gesture while a game is in progress — leaving is then only via the back
  // arrow / Exit / Android back, all of which show the confirmation reliably.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !(moves > 0 && !over) });
  }, [navigation, moves, over]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>2048 Challenge</Text>
        {tab === 'play' ? (
          <Pressable onPress={startNewGame} style={[styles.iconBtn, { backgroundColor: theme.card }]} hitSlop={8}>
            <Feather name="rotate-ccw" size={20} color={theme.text} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: theme.border }]}>
        {(['play', 'rankings'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable
              key={t}
              style={[styles.tab, active && [styles.tabActive, { backgroundColor: theme.card }]]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, { color: active ? theme.text : theme.textSecondary }]}>
                {t === 'play' ? 'Play' : 'Rankings'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'play' ? (
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
        >
          {/* Score HUD */}
          <View style={styles.hudRow}>
            <View style={[styles.hudCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.hudLabel, { color: theme.textSecondary }]}>SCORE</Text>
              <Text style={[styles.hudValue, { color: theme.text }]}>{score}</Text>
            </View>
            <View style={[styles.hudCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.hudLabel, { color: theme.textSecondary }]}>BEST</Text>
              <Text style={[styles.hudValue, { color: theme.text }]}>{Math.max(bestScore, score)}</Text>
            </View>
            <View style={[styles.hudCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.hudLabel, { color: theme.textSecondary }]}>MOVES</Text>
              <Text style={[styles.hudValue, { color: theme.text }]}>{moves}</Text>
            </View>
          </View>

          <Text style={[styles.hint, { color: theme.textSecondary }]}>Swipe to move · merge equal tiles to reach 2048</Text>

          {/* Board */}
          <View
            {...panResponder.panHandlers}
            style={[styles.board, { width: boardPixels, height: boardPixels, backgroundColor: theme.backgroundSecondary, padding: geom.padding }]}
          >
            {/* Empty cell backgrounds */}
            {Array.from({ length: SIZE * SIZE }).map((_, i) => {
              const r = Math.floor(i / SIZE);
              const c = i % SIZE;
              return (
                <View
                  key={`cell-${i}`}
                  style={{
                    position: 'absolute',
                    width: geom.cellSize,
                    height: geom.cellSize,
                    borderRadius: 8,
                    backgroundColor: isDark ? '#ffffff10' : '#00000008',
                    left: geom.padding + c * (geom.cellSize + geom.gap),
                    top: geom.padding + r * (geom.cellSize + geom.gap),
                  }}
                />
              );
            })}
            {/* Tiles */}
            {tiles.map((t) => (
              <TileView key={t.id} tile={t} geom={geom} theme={theme} />
            ))}

            {/* Win overlay */}
            {won && (
              <View style={[styles.overlay, { backgroundColor: isDark ? '#000000C0' : '#FFFFFFD8' }]}>
                <Text style={styles.overlayEmoji}>🎉</Text>
                <Text style={[styles.overlayTitle, { color: theme.text }]}>You reached 2048!</Text>
                <Pressable onPress={continuePlaying} style={[styles.overlayBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.overlayBtnText, { color: theme.textInverse || '#fff' }]}>Keep going</Text>
                </Pressable>
                <Pressable onPress={startNewGame} style={[styles.overlayBtnGhost, { borderColor: theme.border }]}>
                  <Text style={[styles.overlayBtnText, { color: theme.text }]}>New game</Text>
                </Pressable>
              </View>
            )}

            {/* Game over overlay */}
            {over && (
              <View style={[styles.overlay, { backgroundColor: isDark ? '#000000C8' : '#FFFFFFE0' }]}>
                <Text style={styles.overlayEmoji}>🏁</Text>
                <Text style={[styles.overlayTitle, { color: theme.text }]}>Game Over</Text>
                <Text style={[styles.overlaySub, { color: theme.textSecondary }]}>Score {score} · Best tile {bestTileValue(tiles)}</Text>
                {lastPoints > 0 && (
                  <View style={[styles.pointsPill, { backgroundColor: theme.primary + '22' }]}>
                    <Feather name="zap" size={14} color={theme.primary} />
                    <Text style={[styles.pointsPillText, { color: theme.primary }]}>+{lastPoints} Rencana Points</Text>
                  </View>
                )}
                <Pressable onPress={startNewGame} style={[styles.overlayBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.overlayBtnText, { color: theme.textInverse || '#fff' }]}>Play again</Text>
                </Pressable>
                <Pressable onPress={() => router.back()} style={[styles.overlayBtnGhost, { borderColor: theme.border }]}>
                  <Text style={[styles.overlayBtnText, { color: theme.text }]}>Exit</Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Points legend */}
          <View style={[styles.legend, { backgroundColor: theme.card }]}>
            <Text style={[styles.legendTitle, { color: theme.text }]}>Rencana Points per game</Text>
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              128 → +5   ·   256 → +10   ·   512 → +20   ·   1024 → +50   ·   2048 → +100
            </Text>
          </View>
        </ScrollView>
      ) : (
        <RankingsTab theme={theme} userId={userId} friendIds={friends.map((f) => f.id)} progress={progress} />
      )}
    </View>
  );
}

// ───────────────────────────── Rankings ─────────────────────────────

function RankingsTab({
  theme, userId, friendIds, progress,
}: {
  theme: ReturnType<typeof useTheme>;
  userId: string | null;
  friendIds: string[];
  progress: Game2048Progress | null;
}) {
  const [view, setView] = useState<RankView>('stats');
  const [entries, setEntries] = useState<Game2048LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const onPrimary = contrastText(theme.primary);

  const load = useCallback(async () => {
    if (!userId || view === 'stats') return;
    setLoading(true);
    try {
      setEntries(await getGame2048Leaderboard(view, userId, friendIds));
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [view, userId, friendIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Match the Word Game design: a top-3 podium plus a list. The word game always
  // has many players so a podium always shows; the 2048 board can be small, so we
  // only build the podium when there are 3+ players and otherwise list everyone.
  const hasPodium = entries.length >= 3;
  const podium = hasPodium ? entries.slice(0, 3) : [];
  const rest = hasPodium ? entries.slice(3) : entries;

  return (
    <ScrollView contentContainerStyle={styles.rankScroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.rankTabs, { backgroundColor: theme.border }]}>
        {(['stats', 'friends', 'global'] as RankView[]).map((r) => {
          const active = view === r;
          return (
            <Pressable key={r} style={[styles.subTab, active && [styles.subTabActive, { backgroundColor: theme.card }]]} onPress={() => setView(r)}>
              <Feather
                name={r === 'stats' ? 'bar-chart-2' : r === 'friends' ? 'users' : 'globe'}
                size={14}
                color={active ? theme.text : theme.textSecondary}
              />
              <Text style={[styles.subTabText, { color: active ? theme.text : theme.textSecondary }]}>
                {r === 'stats' ? 'My Stats' : r === 'friends' ? 'Friends' : 'Global'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'stats' ? (
        <>
          <LinearGradient
            colors={[theme.primary, theme.primary + 'DD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.myScoreCard, { shadowColor: theme.primary }]}
          >
            <Feather name="award" size={40} color={onPrimary} style={{ opacity: 0.8 }} />
            <View style={styles.myScoreInfo}>
              <Text style={[styles.myScoreTitle, { color: onPrimary, opacity: 0.9 }]}>Your Best Score</Text>
              <Text style={[styles.myScoreVal, { color: onPrimary }]}>
                {progress?.bestScore ?? 0} <Text style={{ fontSize: 16, fontWeight: '700' }}>pts</Text>
              </Text>
            </View>
            <View style={[styles.myScoreBadge, { backgroundColor: onPrimary }]}>
              <Text style={[styles.myScoreBadgeText, { color: theme.primary }]}>🏆 {progress?.bestTile ?? 0}</Text>
            </View>
          </LinearGradient>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: theme.text }]}>{progress?.gamesPlayed ?? 0}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Games Played</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: '#f59e0b' }]}>🔥 {progress?.bestStreak ?? 0}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Best Streak</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: theme.text }]}>🔥 {progress?.currentStreak ?? 0}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Current Streak</Text>
            </View>
          </View>
        </>
      ) : loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bar-chart-2" size={40} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No scores yet.</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>Play a game to rank up!</Text>
        </View>
      ) : (
        <>
          {podium.length >= 3 && (
            <View style={styles.podium}>
              {[1, 0, 2].map((idx) => {
                const entry = podium[idx];
                if (!entry) return <View key={idx} style={styles.podiumSlot} />;
                const center = idx === 0;
                return (
                  <View key={entry.user_id} style={[styles.podiumSlot, center && { marginBottom: 12 }]}>
                    <View style={[styles.podiumCrown, { borderColor: PODIUM_COLORS[idx] }]}>
                      <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={center ? 56 : 44} />
                    </View>
                    {center && <Feather name="award" size={20} color="#f59e0b" style={{ marginTop: 4 }} />}
                    <Text style={[styles.podiumName, { color: theme.text }]} numberOfLines={1}>{entry.name?.split(' ')[0]}</Text>
                    <Text style={[styles.podiumSub, { color: theme.textSecondary }]}>tile {entry.best_tile}</Text>
                    <View style={[styles.podiumBar, { backgroundColor: PODIUM_COLORS[idx] + '25', height: center ? 60 : idx === 1 ? 44 : 32 }]}>
                      <Text style={[styles.podiumRankText, { color: PODIUM_COLORS[idx] }]}>#{idx + 1}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.list}>
            {rest.map((entry, idx) => {
              const isMe = entry.user_id === userId;
              const displayRank = entry.rank ?? (hasPodium ? idx + 4 : idx + 1);
              return (
                <View key={entry.user_id} style={[styles.row, { backgroundColor: isMe ? theme.primary + '11' : theme.card, borderColor: isMe ? theme.primary : 'transparent' }]}>
                  <Text style={[styles.rowRank, { color: theme.textSecondary }]}>{displayRank}</Text>
                  <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{isMe ? `${entry.name} (You)` : entry.name}</Text>
                    <Text style={[styles.rowSub, { color: theme.textSecondary }]}>tile {entry.best_tile}</Text>
                  </View>
                  <Text style={[styles.rowScore, { color: isMe ? theme.primary : theme.text }]}>{entry.best_score} pts</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },

  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: '700' },

  hudRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 6, alignSelf: 'stretch' },
  hudCard: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  hudLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  hudValue: { fontSize: 22, fontWeight: '800', marginTop: 2 },

  hint: { fontSize: 12, fontWeight: '500', marginTop: 14, marginBottom: 10, textAlign: 'center' },

  board: { borderRadius: 16, position: 'relative', marginTop: 2 },
  tile: { position: 'absolute', left: 0, top: 0, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  overlay: { ...StyleSheet.absoluteFillObject, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 20 },
  overlayEmoji: { fontSize: 44, marginBottom: 8 },
  overlayTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  overlaySub: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  overlayBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 },
  overlayBtnGhost: { marginTop: 10, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1.5 },
  overlayBtnText: { fontSize: 15, fontWeight: '700' },
  pointsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  pointsPillText: { fontSize: 13, fontWeight: '700' },

  legend: { marginTop: 18, marginHorizontal: 16, alignSelf: 'stretch', borderRadius: 14, padding: 14 },
  legendTitle: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  legendText: { fontSize: 12, fontWeight: '500', lineHeight: 18 },

  // Rankings — mirrors the Word Game ranking design
  rankScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  rankTabs: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 20 },
  subTab: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subTabActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  subTabText: { fontSize: 13, fontWeight: '700' },

  myScoreCard: {
    flexDirection: 'row', alignItems: 'center', padding: 24, borderRadius: 24, gap: 16,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  myScoreInfo: { flex: 1 },
  myScoreTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  myScoreVal: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -1 },
  myScoreBadge: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  myScoreBadgeText: { fontSize: 16, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  statBox: {
    flex: 1, alignItems: 'center', padding: 20, borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  statBoxVal: { fontSize: 20, fontWeight: '900' },
  statBoxLabel: { fontSize: 12, fontWeight: '600', marginTop: 6, textAlign: 'center' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 24, marginBottom: 32, gap: 12 },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumCrown: { borderWidth: 4, borderRadius: 40, padding: 4, backgroundColor: '#fff' },
  podiumName: { fontSize: 14, fontWeight: '800', marginTop: 10 },
  podiumSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  podiumBar: { width: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, marginTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  podiumRankText: { fontSize: 16, fontWeight: '900' },

  list: { gap: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  rowRank: { fontSize: 16, fontWeight: '800', width: 28, textAlign: 'center' },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowSub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  rowScore: { fontSize: 16, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptyHint: { fontSize: 14, fontWeight: '500' },
});
