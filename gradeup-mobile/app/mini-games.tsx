import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { contrastText } from '@/src/lib/contrast';

interface GameCard {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  tint: (theme: ReturnType<typeof useTheme>) => [string, string];
}

const GAMES: GameCard[] = [
  {
    key: 'word',
    title: 'Word Game',
    subtitle: 'Connections puzzles · daily streaks · rankings',
    icon: 'grid',
    route: '/word-game',
    tint: (t) => [t.primary, t.primary + 'CC'],
  },
  {
    key: '2048',
    title: '2048 Challenge',
    subtitle: 'Slide & merge to 2048 · earn Rencana Points · rankings',
    icon: 'box',
    route: '/game-2048',
    tint: (t) => [t.secondary || t.primary, (t.accent2 || t.secondary || t.primary) + 'CC'],
  },
  {
    key: 'crossword',
    title: 'Crossword',
    subtitle: '2 mini puzzles a day · hidden word · streaks · rankings',
    icon: 'grid',
    route: '/crossword',
    // Use the deep accent2 (not the pale accent) as the base so the auto-contrast
    // text stays white/legible across themes — e.g. the cream "Cat" theme where
    // accent is a pale tan that flipped the text to an unreadable dark.
    tint: (t) => [t.accent2 || t.primary, (t.primary || t.accent2) + 'CC'],
  },
];

export default function MiniGamesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: theme.card }]}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Mini Games</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Take a quick study break. Each game keeps its own score and leaderboard.
        </Text>

        {GAMES.map((g) => {
          const colors = g.tint(theme);
          const fg = contrastText(colors[0]);
          return (
            <Pressable
              key={g.key}
              onPress={() => router.push(g.route as any)}
              style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
            >
              <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, { shadowColor: colors[0] }]}
              >
                <View style={[styles.cardIcon, { backgroundColor: fg + '22' }]}>
                  <Feather name={g.icon} size={26} color={fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: fg }]}>{g.title}</Text>
                  <Text style={[styles.cardSub, { color: fg, opacity: 0.85 }]}>{g.subtitle}</Text>
                </View>
                <Feather name="chevron-right" size={22} color={fg} style={{ opacity: 0.8 }} />
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  intro: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#ffffff2A', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  cardSub: { color: '#ffffffd8', fontSize: 12.5, fontWeight: '500', marginTop: 3, lineHeight: 17 },
});
