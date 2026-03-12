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
          name="index"
          options={{
            title: T('home'),
            tabBarLabel: T('home'),
            tabBarIcon: ({ color }) => <ThemeIcon name="home" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: T('tasks'),
            tabBarLabel: T('tasks'),
            tabBarIcon: ({ color }) => <ThemeIcon name="tasks" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="two"
          options={{
            title: T('add'),
            tabBarLabel: T('add'),
            tabBarIcon: () => null,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: T('studyTitle'),
            tabBarLabel: T('studyTitle'),
            tabBarIcon: ({ color }) => <ThemeIcon name="layers" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: T('community'),
            tabBarLabel: T('community'),
            tabBarIcon: ({ color }) => <Feather name="users" size={26} color={color} />,
          }}
        />
      </Tabs>

      <Modal visible={addMenuOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeAddMenu}>
          <View style={[styles.addMenuCard, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
            <Pressable
              style={styles.addMenuItem}
              onPress={() => {
                closeAddMenu();
                router.push('/add-task' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: theme.primary }]}>
                <ThemeIcon name="add" size={20} color={theme.textInverse} />
              </View>
              <View>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('addManually')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('createTaskYourself')}</Text>
              </View>
            </Pressable>
            <View style={[styles.addMenuDivider, { backgroundColor: theme.border }]} />
            <Pressable
              style={styles.addMenuItem}
              onPress={() => {
                closeAddMenu();
                router.push('/import' as any);
              }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: theme.accent3 }]}>
                <ThemeIcon name="sparkles" size={20} color={theme.textInverse} />
              </View>
              <View>
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>{T('aiPlanner')}</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>{T('pasteMessageExtract')}</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </TabBarProvider>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingBottom: 100,
  },
  addMenuCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 12,
    marginHorizontal: 20,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
  },
  addMenuIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMenuTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  addMenuSub: {
    fontSize: 11,
    marginTop: 2,
  },
  addMenuDivider: {
    height: 1,
    marginHorizontal: 18,
  },
});
