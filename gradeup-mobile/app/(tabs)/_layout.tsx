import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { TabBarProvider } from '@/contexts/TabBarContext';
import { GlassTabBar } from '@/components/GlassTabBar';
import { useTranslations } from '@/src/i18n';
import { ManualWeekPrompt } from '@/components/ManualWeekPrompt';

export default function TabLayout() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const openAddMenu = () => setAddMenuOpen(true);
  const closeAddMenu = () => setAddMenuOpen(false);

  return (
    <TabBarProvider openAddMenu={openAddMenu}>
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
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
              <View>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('aiPlanner')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('pasteMessageExtract')}</Text>
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
              <View>
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
              <View>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('addStudyTime')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('scheduleStudySub')}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ManualWeekPrompt />
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
