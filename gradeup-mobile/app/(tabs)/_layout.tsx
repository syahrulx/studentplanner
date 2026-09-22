import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Redirect, Tabs, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { TabBarProvider } from '@/contexts/TabBarContext';
import { GlassTabBar } from '@/components/GlassTabBar';
import { WebSidebar } from '@/components/WebSidebar';
import { useResponsive } from '@/hooks/useResponsive';
import { useTranslations } from '@/src/i18n';
import { ManualWeekPrompt } from '@/components/ManualWeekPrompt';
import { StaleCalendarPrompt } from '@/components/StaleCalendarPrompt';
import { supabase } from '@/src/lib/supabase';
import { ConnectionRetry } from '@/src/components/ConnectionRetry';

const PROFILE_SETUP_SKIPPED_KEY_PREFIX = 'profile_setup_skipped_v1:';
const skippedKeyFor = (uid: string) => `${PROFILE_SETUP_SKIPPED_KEY_PREFIX}${uid}`;

// Only these three carry an identity change this gate cares about. Re-resolving
// on TOKEN_REFRESHED (hourly, and on every foreground once the token is stale)
// meant a fresh profiles read for a user we had already resolved.
const GATE_AUTH_EVENTS = new Set(['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION']);

// Backstop for a lookup that neither resolves nor rejects. Sits just above the
// 15s Supabase request timeout so the real error path wins when there is one.
const GATE_WATCHDOG_MS = 18_000;

export default function TabLayout() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const { isDesktop } = useResponsive();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [gate, setGate] = useState<'loading' | 'signed-out' | 'needs-profile' | 'ready' | 'error'>(
    'loading',
  );
  const [gateAttempt, setGateAttempt] = useState(0);

  const openAddMenu = () => setAddMenuOpen(true);
  const closeAddMenu = () => setAddMenuOpen(false);

  useEffect(() => {
    let alive = true;
    // supabase-js can emit SIGNED_IN more than once for a single sign-in.
    // Resolving again for a user we already resolved just repeats the read.
    let resolvedForUid: string | null = null;

    const resolveGate = async (uid?: string | null) => {
      if (!alive) return;
      if (!uid) {
        resolvedForUid = null;
        setGate('signed-out');
        return;
      }
      if (resolvedForUid === uid) return;
      resolvedForUid = uid;

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('university')
          .eq('id', uid)
          .maybeSingle();
        if (!alive) return;

        // A lookup that failed says nothing about whether the profile is
        // complete. Reading it as "incomplete" stranded offline users on the
        // full-screen profile wall, where saving then also failed. Fail open
        // and let a later attempt decide — same reasoning, and same comment,
        // as app/(auth)/_layout.tsx.
        if (error) {
          resolvedForUid = null;
          setGate('ready');
          return;
        }

        if (profile?.university) {
          // If they completed profile later, clear any prior skip for this user.
          try {
            await AsyncStorage.removeItem(skippedKeyFor(uid));
          } catch {
            /* ignore */
          }
          if (!alive) return;
          setGate('ready');
          return;
        }

        // Allow continuing if THIS user explicitly skipped profile setup.
        try {
          const skipped = await AsyncStorage.getItem(skippedKeyFor(uid));
          if (!alive) return;
          setGate(skipped ? 'ready' : 'needs-profile');
        } catch {
          if (!alive) return;
          setGate('needs-profile');
        }
      } catch {
        if (!alive) return;
        resolvedForUid = null;
        setGate('ready');
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => resolveGate(data.session?.user?.id ?? null))
      .catch(() => {
        // Without an identity, neither rendering the tabs nor bouncing to login
        // is defensible. Offer a retry rather than a blank screen.
        if (alive) setGate('error');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (!GATE_AUTH_EVENTS.has(event)) return;
      void resolveGate(session?.user?.id ?? null);
    });

    const watchdog = setTimeout(() => {
      if (!alive) return;
      setGate((current) => (current === 'loading' ? 'error' : current));
    }, GATE_WATCHDOG_MS);

    return () => {
      alive = false;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, [gateAttempt]);

  if (gate === 'error') {
    return (
      <ConnectionRetry
        onRetry={() => {
          setGate('loading');
          setGateAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (gate === 'loading') return null;
  if (gate === 'signed-out') return <Redirect href="/(auth)/login" />;
  if (gate === 'needs-profile') return <Redirect href="/(auth)/profile-setup" />;

  return (
    <TabBarProvider openAddMenu={openAddMenu}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {isDesktop ? <WebSidebar /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
      <Tabs
        tabBar={(props) => (isDesktop ? null : <GlassTabBar {...props} />)}
        screenOptions={{
          tabBarActiveTintColor: theme.tabIconSelected,
          tabBarInactiveTintColor: theme.tabIconDefault,
          headerShown: false,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: 0,
            minHeight: 0,
          },
        }}>
        <Tabs.Screen
          name="planner"
          options={{
            title: T('tasks'),
            tabBarLabel: T('tasks'),
            tabBarIcon: ({ color }) => <ThemeIcon name="tasks" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: (T as any)('studyTitle') || 'Study',
            tabBarLabel: (T as any)('studyTitle') || 'Study',
            tabBarIcon: ({ color }) => <Feather name="book-open" size={24} color={color} />,
          }}
        />
        {/* Home in center */}
        <Tabs.Screen
          name="index"
          options={{
            title: T('home'),
            tabBarLabel: T('home'),
            tabBarIcon: ({ color, focused }) => <ThemeIcon name="home" size={focused ? 30 : 28} color={color} />,
          }}
        />
        <Tabs.Screen
          name="timetable"
          options={{
            title: (T as any)('timetable') || 'Timetable',
            tabBarLabel: (T as any)('timetable') || 'Timetable',
            tabBarIcon: ({ color }) => <ThemeIcon name="calendar" size={24} color={color} />,
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: T('community'),
            tabBarLabel: T('community'),
            tabBarIcon: ({ color }) => <Feather name="map-pin" size={24} color={color} />,
          }}
        />
        {/* Hide the legacy two tab — no longer needed */}
        <Tabs.Screen
          name="two"
          options={{
            href: null,
          }}
        />
      </Tabs>
        </View>
      </View>

      {/* Add Menu Modal — triggered by + button in Planner header */}
      <Modal visible={addMenuOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeAddMenu}>
          <View style={[styles.addMenuCard, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Pressable
              style={({ pressed }) => [styles.addMenuItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() => {
                closeAddMenu();
                router.push('/ai-chat' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: '#0891b2' }]}>
                <ThemeIcon name="sparkles" size={22} color="#fff" />
              </View>
              <View style={styles.addMenuTextContainer}>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('smartCapture')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('smartCaptureSub')}</Text>
              </View>
            </Pressable>

            <View style={[styles.addMenuDivider, { backgroundColor: theme.border }]} />

            <Pressable
              style={({ pressed }) => [styles.addMenuItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() => {
                closeAddMenu();
                router.push('/import-calendar' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: '#0d9488' }]}>
                <Feather name="calendar" size={22} color="#fff" />
              </View>
              <View style={styles.addMenuTextContainer}>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('importFromCalendar')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('importFromCalendarSub')}</Text>
              </View>
            </Pressable>

            <View style={[styles.addMenuDivider, { backgroundColor: theme.border }]} />

            <Pressable
              style={({ pressed }) => [styles.addMenuItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() => {
                closeAddMenu();
                router.push('/add-task' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: theme.primary }]}>
                <ThemeIcon name="add" size={24} color={theme.textInverse} />
              </View>
              <View style={styles.addMenuTextContainer}>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('addManually')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('createTaskYourself')}</Text>
              </View>
            </Pressable>

            <View style={[styles.addMenuDivider, { backgroundColor: theme.border }]} />

            <Pressable
              style={({ pressed }) => [styles.addMenuItem, pressed && { backgroundColor: theme.backgroundSecondary }]}
              onPress={() => {
                closeAddMenu();
                router.push('/revision' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: '#7c3aed' }]}>
                <ThemeIcon name="clock" size={22} color="#fff" />
              </View>
              <View style={styles.addMenuTextContainer}>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('addStudyTime')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('scheduleStudySub')}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ManualWeekPrompt />
      <StaleCalendarPrompt />
    </TabBarProvider>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingBottom: 110,
  },
  addMenuCard: {
    borderRadius: 32,
    padding: 10,
    marginHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 8,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 24,
  },
  addMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenuTextContainer: {
    flex: 1,
  },
  addMenuTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  addMenuSub: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 3,
  },
  addMenuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
  },
});
