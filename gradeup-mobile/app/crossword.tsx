import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, Alert,
  useWindowDimensions,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeId } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useCommunity } from '@/src/context/CommunityContext';
import { contrastText } from '@/src/lib/contrast';
import {
  CROSSWORD_PUZZLES, TOTAL_PUZZLES, buildCells, clueCells, isComplete, bonusWordsSolved,
  type CrosswordPuzzle, type CrosswordClue,
} from '@/src/lib/crosswordEngine';
import {
  loadProgress, saveResult, isCompleted, getResult, completedCount, getTotalPoints,
  playsLeftToday, previewPoints, allCompleted, BASE_POINTS, BONUS_WORD_POINTS,
  getCrosswordLeaderboard,
  type CrosswordProgress, type CrosswordLeaderboardEntry,
} from '@/src/lib/crosswordStorage';

type Tab = 'levels' | 'rankings';
type RankView = 'stats' | 'friends' | 'global';

const PODIUM_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];
const GOLD = '#f59e0b';

// A fitting emoji for each puzzle theme — shown beside the title.
const TITLE_EMOJI: Record<string, string> = {
  'Animals': '🐾',
  'Fruits': '🍎',
  'Space': '🚀',
  'In the Kitchen': '🍳',
  'Weather': '⛅',
  'Sports': '⚽',
  'Music': '🎵',
  'The Body': '💪',
  'At School': '🎒',
  'In the Ocean': '🌊',
  'Birds': '🐦',
  'Vegetables': '🥕',
  'Colors & Shapes': '🎨',
  'Jobs': '💼',
  'Travel': '✈️',
  'Clothing': '👕',
  'House & Home': '🏠',
  'Nature': '🌿',
  'Food & Meals': '🍽️',
  'Technology': '💻',
  'Camping': '🏕️',
  'The Beach': '🏖️',
  'Winter': '❄️',
  'In the Garden': '🌷',
  'Insects': '🐛',
  'Tools': '🔧',
  'Emotions': '😊',
  'Drinks': '🥤',
  'Countries': '🌍',
  'Time & Calendar': '📅',
};
const titleEmoji = (title: string) => TITLE_EMOJI[title] ?? '🧩';

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
  const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  if (avatarUrl) return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette[idx], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{getInitials(name)}</Text>
    </View>
  );
}

export default function CrosswordScreen() {
  const theme = useTheme();
  const isDark = isDarkTheme(useThemeId());
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { friends, userId } = useCommunity();

  const [tab, setTab] = useState<Tab>('levels');
  const [progress, setProgress] = useState<CrosswordProgress | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [set1Open, setSet1Open] = useState(true);

  const reload = useCallback(async () => setProgress(await loadProgress()), []);
  useEffect(() => { reload(); }, [reload]);

  const activePuzzle = activeId != null ? CROSSWORD_PUZZLES.find((p) => p.id === activeId) : null;

  // Lowest-numbered puzzle the player hasn't solved yet — the only one that can
  // be started next (puzzles unlock strictly in order: 1 → 2 → 3 …).
  const firstUnsolvedId = useMemo(() => {
    if (!progress) return 1;
    return CROSSWORD_PUZZLES.find((p) => !isCompleted(progress, p.id))?.id ?? null;
  }, [progress]);

  const openPuzzle = useCallback((p: CrosswordPuzzle) => {
    if (!progress) return;
    const done = isCompleted(progress, p.id);
    if (done) { setActiveId(p.id); return; }
    if (p.id !== firstUnsolvedId) {
      Alert.alert('Locked', 'Finish the puzzles before this one first.');
      return;
    }
    if (playsLeftToday(progress) <= 0) {
      Alert.alert("That's enough for today!", 'You can unlock 2 crosswords per day. Come back tomorrow for the next one.');
      return;
    }
    setActiveId(p.id);
  }, [progress, firstUnsolvedId]);

  const closePuzzle = useCallback(async () => {
    setActiveId(null);
    await reload();
  }, [reload]);

  // ─── Solve mode ───
  if (activePuzzle) {
    return (
      <SolveView
        puzzle={activePuzzle}
        readOnly={!!progress && isCompleted(progress, activePuzzle.id)}
        theme={theme}
        isDark={isDark}
        insets={insets}
        onExit={closePuzzle}
        onSolved={reload}
      />
    );
  }

  // ─── Hub (levels + rankings) ───
  const solved = progress ? completedCount(progress) : 0;
  const left = progress ? playsLeftToday(progress) : 2;
  const onPrimary = contrastText(theme.primary);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Crossword</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.border }]}>
        {(['levels', 'rankings'] as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <Pressable key={t} style={[styles.tab, active && [styles.tabActive, { backgroundColor: theme.card }]]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, { color: active ? theme.text : theme.textSecondary }]}>
                {t === 'levels' ? 'Puzzles' : 'Rankings'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'levels' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {/* Daily banner */}
          <LinearGradient colors={[theme.primary, theme.primary + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, { shadowColor: theme.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerTitle, { color: onPrimary }]}>{progress && allCompleted(progress) ? 'All puzzles solved! 🎉' : `${left} puzzle${left === 1 ? '' : 's'} left today`}</Text>
              <Text style={[styles.bannerSub, { color: onPrimary, opacity: 0.85 }]}>Solve up to 2 crosswords a day · keep your streak alive</Text>
            </View>
            <View style={[styles.bannerBadge, { backgroundColor: onPrimary }]}>
              <Text style={[styles.bannerBadgeText, { color: theme.primary }]}>{solved}/{TOTAL_PUZZLES}</Text>
            </View>
          </LinearGradient>

          {/* Set 1 — the starter pack (collapsible) */}
          <Pressable
            onPress={() => setSet1Open((o) => !o)}
            style={({ pressed }) => [styles.setHeader, { backgroundColor: theme.card }, pressed && { opacity: 0.85 }]}
          >
            <LinearGradient colors={[theme.primary, theme.primary + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.setBadge}>
              <Text style={[styles.setBadgeNum, { color: onPrimary }]}>1</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={[styles.setTitle, { color: theme.text }]}>Starter Pack</Text>
              <Text style={[styles.setSub, { color: theme.textSecondary }]}>{TOTAL_PUZZLES} puzzles · unlock 2 a day, in order</Text>
            </View>
            <View style={[styles.setPill, { backgroundColor: theme.primary + '1A' }]}>
              <Text style={[styles.setCount, { color: theme.primary }]}>{solved}/{TOTAL_PUZZLES}</Text>
            </View>
            <Feather name={set1Open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textSecondary} />
          </Pressable>

          {set1Open && (
          <View style={[styles.grid, { marginTop: 14 }]}>
            {CROSSWORD_PUZZLES.map((p) => {
              const done = progress ? isCompleted(progress, p.id) : false;
              const result = progress ? getResult(progress, p.id) : undefined;
              const isNext = p.id === firstUnsolvedId;
              const dailyLock = isNext && left <= 0;
              const seqLock = !done && !isNext;
              const locked = dailyLock || seqLock;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => openPuzzle(p)}
                  style={({ pressed }) => [
                    styles.levelCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: done ? theme.primary : isNext && !dailyLock ? theme.primary : 'transparent',
                      opacity: seqLock ? 0.5 : dailyLock ? 0.7 : 1,
                    },
                    pressed && !locked && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <View style={styles.levelTop}>
                    <Text style={styles.levelEmoji}>{titleEmoji(p.title)}</Text>
                    {done ? (
                      <Feather name="check-circle" size={18} color={theme.primary} />
                    ) : isNext && !dailyLock ? (
                      <Feather name="play" size={16} color={theme.primary} />
                    ) : (
                      <Feather name="lock" size={15} color={theme.textSecondary} />
                    )}
                  </View>
                  <Text style={[styles.levelNum, { color: theme.textSecondary }]}>#{p.id}</Text>
                  <Text style={[styles.levelTitle, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                  <Text style={[styles.levelSub, { color: done || (isNext && !dailyLock) ? theme.primary : theme.textSecondary }]}>
                    {done ? `${result?.score ?? 0} pts` : dailyLock ? 'Tomorrow' : seqLock ? 'Locked' : `${p.clues.length} words`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          )}

          {/* Set 2 — coming soon */}
          <View style={[styles.comingSoon, { borderColor: theme.border }]}>
            <View style={[styles.setBadge, styles.setBadgeLocked, { backgroundColor: theme.textSecondary + '22' }]}>
              <Feather name="lock" size={18} color={theme.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.setTitle, { color: theme.textSecondary }]}>Pack 2 · Coming Soon</Text>
              <Text style={[styles.setSub, { color: theme.textSecondary }]}>Finish the Starter Pack — a fresh batch of puzzles is on the way.</Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <RankingsTab theme={theme} userId={userId} friendIds={friends.map((f) => f.id)} progress={progress} />
      )}
    </View>
  );
}

// ───────────────────────────── Solve view ─────────────────────────────

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const HINT_LIMIT = 2;

function SolveView({
  puzzle, readOnly, theme, isDark, insets, onExit, onSolved,
}: {
  puzzle: CrosswordPuzzle;
  readOnly: boolean;
  theme: ReturnType<typeof useTheme>;
  isDark: boolean;
  insets: { top: number; bottom: number };
  onExit: () => void;
  onSolved: () => void;
}) {
  const { width } = useWindowDimensions();
  const onPrimary = contrastText(theme.primary);
  const cells = useMemo(() => buildCells(puzzle), [puzzle]);
  const n = puzzle.size;

  const boardW = Math.min(width - 24, 380);
  const cellSize = Math.floor((boardW - (n + 1) * 2) / n);
  const board = cellSize * n + (n + 1) * 2;

  // entries[r][c] = entered letter ('' if empty). Pre-fill solution in read-only.
  const makeEntries = useCallback(() =>
    Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => (readOnly ? puzzle.solution[r][c] || '' : '')),
    ), [n, puzzle, readOnly]);

  const [entries, setEntries] = useState<string[][]>(makeEntries);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [dir, setDir] = useState<'across' | 'down'>('across');
  const [showErrors, setShowErrors] = useState(false);
  const [hints, setHints] = useState(0);
  const [done, setDone] = useState(readOnly);
  const [earned, setEarned] = useState<{ points: number; bonus: number; streak: number } | null>(null);
  const [kbOpen, setKbOpen] = useState(true);
  const savedRef = useRef(false);

  // Pick the first playable cell on mount.
  useEffect(() => {
    if (readOnly) return;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!cells[r][c].block) { setSel({ r, c }); setDir(cells[r][c].acrossClue != null ? 'across' : 'down'); return; }
    }
  }, [cells, n, readOnly]);

  const currentClueIdx = useMemo(() => {
    if (!sel) return null;
    const cell = cells[sel.r][sel.c];
    return dir === 'across' ? cell.acrossClue : cell.downClue;
  }, [sel, dir, cells]);

  const currentWord = useMemo<{ r: number; c: number }[]>(() => {
    if (currentClueIdx == null) return [];
    return clueCells(puzzle.clues[currentClueIdx]).map((cell) => ({ r: cell.row, c: cell.col }));
  }, [currentClueIdx, puzzle]);

  const selectCell = useCallback((r: number, c: number) => {
    if (cells[r][c].block || readOnly) return;
    setKbOpen(true);
    if (sel && sel.r === r && sel.c === c) {
      // toggle direction if both available
      const both = cells[r][c].acrossClue != null && cells[r][c].downClue != null;
      if (both) setDir((d) => (d === 'across' ? 'down' : 'across'));
      return;
    }
    setSel({ r, c });
    const cell = cells[r][c];
    if (dir === 'across' && cell.acrossClue == null && cell.downClue != null) setDir('down');
    else if (dir === 'down' && cell.downClue == null && cell.acrossClue != null) setDir('across');
  }, [cells, sel, dir, readOnly]);

  const advance = useCallback(() => {
    if (currentWord.length === 0 || !sel) return;
    const i = currentWord.findIndex((p) => p.r === sel.r && p.c === sel.c);
    if (i >= 0 && i < currentWord.length - 1) setSel(currentWord[i + 1]);
  }, [currentWord, sel]);

  const finish = useCallback(async (filled: string[][]) => {
    if (savedRef.current) return;
    savedRef.current = true;
    const bonus = bonusWordsSolved(puzzle, filled);
    const out = await saveResult({ puzzleId: puzzle.id, bonusWords: bonus, hintsUsed: hints });
    setEarned({ points: out.pointsAwarded, bonus, streak: out.streak });
    setDone(true);
    onSolved();
  }, [puzzle, hints, onSolved]);

  const typeLetter = useCallback((ch: string) => {
    if (!sel || readOnly || done) return;
    setShowErrors(false);
    setEntries((prev) => {
      const next = prev.map((row) => row.slice());
      next[sel.r][sel.c] = ch;
      if (isComplete(puzzle, next)) finish(next);
      return next;
    });
    advance();
  }, [sel, readOnly, done, advance, puzzle, finish]);

  const backspace = useCallback(() => {
    if (!sel || readOnly || done) return;
    setEntries((prev) => {
      const next = prev.map((row) => row.slice());
      if (next[sel.r][sel.c]) {
        next[sel.r][sel.c] = '';
      } else {
        const i = currentWord.findIndex((p) => p.r === sel.r && p.c === sel.c);
        if (i > 0) { const back = currentWord[i - 1]; next[back.r][back.c] = ''; setSel(back); }
      }
      return next;
    });
  }, [sel, readOnly, done, currentWord]);

  const revealHint = useCallback(() => {
    if (readOnly || done) return;
    if (hints >= HINT_LIMIT) {
      Alert.alert('No hints left', `You can use ${HINT_LIMIT} hints per puzzle.`);
      return;
    }
    // Reveal a cell that is still blank or wrong — prefer the selected cell, then
    // the rest of the current word, then anywhere on the board. This way every
    // hint always exposes a NEW letter instead of re-filling a correct cell.
    const isBlank = (r: number, c: number) => {
      const v = entries[r]?.[c];
      return !v || v !== cells[r][c].solution;
    };
    let target: { r: number; c: number } | null = sel && isBlank(sel.r, sel.c) ? sel : null;
    if (!target) target = currentWord.find((p) => isBlank(p.r, p.c)) ?? null;
    if (!target) {
      outer: for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!cells[r][c].block && isBlank(r, c)) { target = { r, c }; break outer; }
      }
    }
    if (!target) return; // everything is already correct
    const t = target;
    setHints((h) => h + 1);
    setShowErrors(false);
    setSel(t);
    setEntries((prev) => {
      const next = prev.map((row) => row.slice());
      next[t.r][t.c] = puzzle.solution[t.r][t.c] || '';
      if (isComplete(puzzle, next)) finish(next);
      return next;
    });
  }, [sel, readOnly, done, puzzle, finish, hints, entries, cells, currentWord, n]);

  const checkBoard = useCallback(() => {
    setShowErrors(true);
    setTimeout(() => setShowErrors(false), 1800);
  }, []);

  const stepClue = useCallback((delta: number) => {
    if (currentClueIdx == null) {
      if (puzzle.clues[0]) { const c0 = puzzle.clues[0]; setSel({ r: c0.row, c: c0.col }); setDir(c0.direction); }
      return;
    }
    const idx = (currentClueIdx + delta + puzzle.clues.length) % puzzle.clues.length;
    const clue = puzzle.clues[idx];
    setSel({ r: clue.row, c: clue.col });
    setDir(clue.direction);
  }, [currentClueIdx, puzzle]);

  const currentClue: CrosswordClue | null = currentClueIdx != null ? puzzle.clues[currentClueIdx] : null;
  const inWord = (r: number, c: number) => currentWord.some((p) => p.r === r && p.c === c);

  const fillable = useMemo(() => cells.reduce((s, row) => s + row.filter((c) => !c.block).length, 0), [cells]);
  const filled = entries.reduce((s, row) => s + row.filter(Boolean).length, 0);
  const pct = fillable ? Math.min(100, Math.round((filled / fillable) * 100)) : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onExit} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{titleEmoji(puzzle.title)}  {puzzle.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', paddingTop: 6, paddingBottom: 16, flexGrow: 1 }} showsVerticalScrollIndicator={false} bounces={false}>
        {/* Board */}
        <View style={[styles.boardCard, { backgroundColor: theme.backgroundSecondary, shadowColor: theme.primary }]}>
          <View style={[styles.boardWrap, { width: board, height: board }]}>
            {cells.map((row, r) =>
              row.map((cell, c) => {
                if (cell.block) return null;
                const left = c * (cellSize + 2) + 2;
                const top = r * (cellSize + 2) + 2;
                const isSel = sel?.r === r && sel?.c === c;
                const active = inWord(r, c);
                const val = entries[r]?.[c] || '';
                const wrong = showErrors && val && val !== cell.solution;
                const bg = wrong
                  ? '#ef444422'
                  : isSel
                    ? theme.primary
                    : active
                      ? theme.primary + '2E'
                      : cell.bonus
                        ? GOLD + '18'
                        : theme.card;
                return (
                  <Pressable
                    key={`${r}-${c}`}
                    onPress={() => selectCell(r, c)}
                    style={[styles.cell, {
                      width: cellSize, height: cellSize, left, top,
                      backgroundColor: bg,
                      borderColor: cell.bonus ? GOLD : isSel ? theme.primary : 'transparent',
                      borderWidth: cell.bonus ? 1.5 : 0,
                    }]}
                  >
                    {cell.number != null && (
                      <Text style={[styles.cellNum, { color: isSel ? onPrimary : theme.textSecondary, fontSize: Math.max(8, cellSize * 0.24) }]}>{cell.number}</Text>
                    )}
                    <Text style={[styles.cellLetter, {
                      color: wrong ? '#ef4444' : isSel ? onPrimary : theme.text,
                      fontSize: cellSize * 0.5,
                    }]}>{val}</Text>
                  </Pressable>
                );
              }),
            )}
          </View>
        </View>

        {/* Fill progress */}
        {!done && (
          <View style={[styles.progressRow, { width: board }]}>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.progressPct, { color: theme.textSecondary }]}>{pct}%</Text>
          </View>
        )}

        {/* Clue bar */}
        {!done && (
          <View style={[styles.clueBar, { backgroundColor: theme.card, width: board }]}>
            <Pressable onPress={() => stepClue(-1)} hitSlop={8} style={styles.clueArrow}>
              <Feather name="chevron-left" size={22} color={theme.textSecondary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              {currentClue ? (
                <>
                  <Text style={[styles.clueMeta, { color: theme.primary }]}>
                    {currentClue.number} {currentClue.direction === 'across' ? 'Across' : 'Down'}{currentClue.bonus ? '  ★ Bonus' : ''}
                  </Text>
                  <Text style={[styles.clueText, { color: theme.text }]}>{currentClue.clue}</Text>
                </>
              ) : (
                <Text style={[styles.clueText, { color: theme.textSecondary }]}>Tap a cell to start</Text>
              )}
            </View>
            <Pressable onPress={() => stepClue(1)} hitSlop={8} style={styles.clueArrow}>
              <Feather name="chevron-right" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
        )}

        {/* Completion card */}
        {done && (
          <View style={[styles.doneCard, { backgroundColor: theme.card, width: board }]}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={[styles.doneTitle, { color: theme.text }]}>{readOnly && !earned ? 'Already solved' : 'Solved!'}</Text>
            {earned && (
              <>
                <View style={[styles.pointsPill, { backgroundColor: theme.primary + '22' }]}>
                  <Feather name="zap" size={14} color={theme.primary} />
                  <Text style={[styles.pointsPillText, { color: theme.primary }]}>+{earned.points} Rencana Points</Text>
                </View>
                <Text style={[styles.doneBreak, { color: theme.textSecondary }]}>
                  {BASE_POINTS} base{earned.bonus > 0 ? ` · +${earned.bonus * BONUS_WORD_POINTS} bonus word` : ''} · 🔥 {earned.streak}-day streak
                </Text>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable onPress={onExit} style={[styles.doneBtn, { backgroundColor: theme.primary }]}>
                <Text style={[styles.doneBtnText, { color: theme.textInverse || '#fff' }]}>Back to puzzles</Text>
              </Pressable>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Keyboard — full-width tray anchored to the bottom, like a native keyboard */}
      {!done && !kbOpen && (
        <Pressable onPress={() => setKbOpen(true)} style={[styles.kbShow, { backgroundColor: theme.backgroundSecondary, paddingBottom: insets.bottom + 10 }]}>
          <Feather name="chevron-up" size={18} color={theme.primary} />
          <Text style={[styles.kbShowText, { color: theme.primary }]}>Show keyboard</Text>
        </Pressable>
      )}
      {!done && kbOpen && (
        <View style={[styles.kbTray, { backgroundColor: theme.backgroundSecondary, paddingBottom: insets.bottom + 6 }]}>
          <View style={styles.kbActions}>
            <Pressable onPress={checkBoard} style={[styles.kbAction, { backgroundColor: theme.card }]}>
              <Feather name="check" size={15} color={theme.text} />
              <Text style={[styles.kbActionText, { color: theme.text }]}>Check</Text>
            </Pressable>
            <Pressable
              onPress={revealHint}
              disabled={hints >= HINT_LIMIT}
              style={[styles.kbAction, { backgroundColor: theme.card, opacity: hints >= HINT_LIMIT ? 0.4 : 1 }]}
            >
              <Feather name="eye" size={15} color={theme.text} />
              <Text style={[styles.kbActionText, { color: theme.text }]}>Hint · {HINT_LIMIT - hints}</Text>
            </Pressable>
            <Pressable onPress={() => setKbOpen(false)} style={[styles.kbAction, { backgroundColor: theme.card }]}>
              <Feather name="chevron-down" size={16} color={theme.text} />
              <Text style={[styles.kbActionText, { color: theme.text }]}>Close</Text>
            </Pressable>
          </View>
          {KEY_ROWS.map((rowKeys, ri) => (
            <View key={ri} style={styles.kbRow}>
              {ri === 2 && (
                <Pressable onPress={backspace} style={[styles.key, styles.keyWide, { backgroundColor: theme.border }]}>
                  <Feather name="delete" size={18} color={theme.text} />
                </Pressable>
              )}
              {rowKeys.split('').map((k) => (
                <Pressable key={k} onPress={() => typeLetter(k)} style={[styles.key, { backgroundColor: theme.card }]}>
                  <Text style={[styles.keyText, { color: theme.text }]}>{k}</Text>
                </Pressable>
              ))}
              {ri === 2 && <View style={[styles.key, styles.keyWide, { opacity: 0 }]} />}
            </View>
          ))}
        </View>
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
  progress: CrosswordProgress | null;
}) {
  const [view, setView] = useState<RankView>('stats');
  const [entries, setEntries] = useState<CrosswordLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const onPrimary = contrastText(theme.primary);

  const load = useCallback(async () => {
    if (!userId || view === 'stats') return;
    setLoading(true);
    try { setEntries(await getCrosswordLeaderboard(view, userId, friendIds)); }
    catch { setEntries([]); }
    setLoading(false);
  }, [view, userId, friendIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const hasPodium = entries.length >= 3;
  const podium = hasPodium ? entries.slice(0, 3) : [];
  const rest = hasPodium ? entries.slice(3) : entries;

  const solved = progress ? completedCount(progress) : 0;
  const total = progress ? getTotalPoints(progress) : 0;

  return (
    <ScrollView contentContainerStyle={styles.rankScroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.rankTabs, { backgroundColor: theme.border }]}>
        {(['stats', 'friends', 'global'] as RankView[]).map((r) => {
          const active = view === r;
          return (
            <Pressable key={r} style={[styles.subTab, active && [styles.subTabActive, { backgroundColor: theme.card }]]} onPress={() => setView(r)}>
              <Feather name={r === 'stats' ? 'bar-chart-2' : r === 'friends' ? 'users' : 'globe'} size={14} color={active ? theme.text : theme.textSecondary} />
              <Text style={[styles.subTabText, { color: active ? theme.text : theme.textSecondary }]}>
                {r === 'stats' ? 'My Stats' : r === 'friends' ? 'Friends' : 'Global'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'stats' ? (
        <>
          <LinearGradient colors={[theme.primary, theme.primary + 'DD']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.myScoreCard, { shadowColor: theme.primary }]}>
            <Feather name="grid" size={40} color={onPrimary} style={{ opacity: 0.8 }} />
            <View style={styles.myScoreInfo}>
              <Text style={[styles.myScoreTitle, { color: onPrimary, opacity: 0.9 }]}>Your Total Points</Text>
              <Text style={[styles.myScoreVal, { color: onPrimary }]}>{total} <Text style={{ fontSize: 16, fontWeight: '700' }}>pts</Text></Text>
            </View>
            <View style={[styles.myScoreBadge, { backgroundColor: onPrimary }]}>
              <Text style={[styles.myScoreBadgeText, { color: theme.primary }]}>{solved}/{TOTAL_PUZZLES}</Text>
            </View>
          </LinearGradient>

          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: theme.text }]}>{solved}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Solved</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: GOLD }]}>🔥 {progress?.bestStreak ?? 0}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Best Streak</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.statBoxVal, { color: theme.text }]}>🔥 {progress?.currentStreak ?? 0}</Text>
              <Text style={[styles.statBoxLabel, { color: theme.textSecondary }]}>Current</Text>
            </View>
          </View>
        </>
      ) : loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="bar-chart-2" size={40} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No scores yet.</Text>
          <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>Solve a crossword to rank up!</Text>
        </View>
      ) : (
        <>
          {hasPodium && (
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
                    {center && <Feather name="award" size={20} color={GOLD} style={{ marginTop: 4 }} />}
                    <Text style={[styles.podiumName, { color: theme.text }]} numberOfLines={1}>{entry.name?.split(' ')[0]}</Text>
                    <Text style={[styles.podiumSub, { color: theme.textSecondary }]}>{entry.puzzles_completed} solved</Text>
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
                <View key={entry.user_id} style={[styles.row, { backgroundColor: isMe ? theme.primary + '11' : theme.card }]}>
                  <Text style={[styles.rowRank, { color: theme.textSecondary }]}>{displayRank}</Text>
                  <Avatar name={entry.name} avatarUrl={entry.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{isMe ? `${entry.name} (You)` : entry.name}</Text>
                    <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{entry.puzzles_completed} solved</Text>
                  </View>
                  <Text style={[styles.rowScore, { color: isMe ? theme.primary : theme.text }]}>{entry.total_points} pts</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },

  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 3, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: '700' },

  // Banner
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 18, gap: 14, marginBottom: 16, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  bannerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bannerSub: { color: '#ffffffd8', fontSize: 12, fontWeight: '500', marginTop: 4, lineHeight: 16 },
  bannerBadge: { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  bannerBadgeText: { fontSize: 15, fontWeight: '900' },

  // Set folders
  setHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  setBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  setBadgeNum: { fontSize: 20, fontWeight: '900' },
  setBadgeLocked: { borderRadius: 14 },
  setTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  setSub: { fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  setPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  setCount: { fontSize: 13, fontWeight: '900' },
  comingSoon: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, padding: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed' },

  // Levels grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  levelCard: { width: '31.5%', borderRadius: 16, padding: 12, borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  levelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  levelEmoji: { fontSize: 22 },
  levelNum: { fontSize: 11, fontWeight: '800', marginTop: 8 },
  levelTitle: { fontSize: 13.5, fontWeight: '700', marginTop: 2 },
  levelSub: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },

  // Board
  boardCard: { borderRadius: 22, padding: 12, marginTop: 6, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  boardWrap: { position: 'relative', borderRadius: 8 },
  cell: { position: 'absolute', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cellNum: { position: 'absolute', top: 1, left: 2, fontWeight: '700' },
  cellLetter: { fontWeight: '800' },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  progressTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressPct: { fontSize: 12, fontWeight: '800', width: 38, textAlign: 'right' },

  // Clue bar
  clueBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginTop: 14, gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  clueArrow: { width: 30, alignItems: 'center', justifyContent: 'center' },
  clueMeta: { fontSize: 12, fontWeight: '800' },
  clueText: { fontSize: 15, fontWeight: '600', marginTop: 2 },

  // Completion
  doneCard: { alignItems: 'center', borderRadius: 18, padding: 20, marginTop: 16 },
  doneEmoji: { fontSize: 40 },
  doneTitle: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  doneBreak: { fontSize: 12.5, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  doneBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  doneBtnText: { fontSize: 14, fontWeight: '800' },
  pointsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  pointsPillText: { fontSize: 13, fontWeight: '700' },

  // Keyboard — native-style full-width tray
  kbShow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 14 },
  kbShowText: { fontSize: 14, fontWeight: '700' },
  kbTray: { paddingTop: 10, paddingHorizontal: 4, gap: 8 },
  kbActions: { flexDirection: 'row', gap: 10, marginBottom: 4, justifyContent: 'center' },
  kbAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  kbActionText: { fontSize: 13, fontWeight: '700' },
  kbRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingHorizontal: 2 },
  key: { flex: 1, maxWidth: 42, height: 46, borderRadius: 6, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  keyWide: { maxWidth: 58, flex: 1.5 },
  keyText: { fontSize: 18, fontWeight: '600' },

  // Rankings (mirrors Word Game design)
  rankScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  rankTabs: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 20 },
  subTab: { flex: 1, flexDirection: 'row', gap: 6, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subTabActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  subTabText: { fontSize: 13, fontWeight: '700' },
  myScoreCard: { flexDirection: 'row', alignItems: 'center', padding: 24, borderRadius: 24, gap: 16, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  myScoreInfo: { flex: 1 },
  myScoreTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  myScoreVal: { fontSize: 32, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -1 },
  myScoreBadge: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  myScoreBadgeText: { fontSize: 16, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  statBox: { flex: 1, alignItems: 'center', padding: 20, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2 },
  rowRank: { fontSize: 16, fontWeight: '800', width: 28, textAlign: 'center' },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowSub: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  rowScore: { fontSize: 16, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptyHint: { fontSize: 14, fontWeight: '500' },
});
