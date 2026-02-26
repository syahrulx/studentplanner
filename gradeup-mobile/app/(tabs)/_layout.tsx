import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';
import { TabBarProvider } from '@/contexts/TabBarContext';
import { GlassTabBar } from '@/components/GlassTabBar';

export default function TabLayout() {
  const theme = useTheme();
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
            title: 'Home',
            tabBarLabel: 'Home',
            tabBarIcon: ({ color }) => <ThemeIcon name="home" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: 'Tasks',
            tabBarLabel: 'Tasks',
            tabBarIcon: ({ color }) => <ThemeIcon name="tasks" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="two"
          options={{
            title: 'Add',
            tabBarLabel: 'Add',
            tabBarIcon: () => null,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: 'Notes',
            tabBarLabel: 'Notes',
            tabBarIcon: ({ color }) => <ThemeIcon name="notes" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarLabel: 'Profile',
            tabBarIcon: ({ color }) => <ThemeIcon name="profile" size={26} color={color} />,
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
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>Add Manually</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>Create a new task yourself</Text>
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
                <Text style={[styles.addMenuTitle, { color: theme.text }]}>AI Planner</Text>
                <Text style={[styles.addMenuSub, { color: theme.textSecondary }]}>Paste message to extract tasks</Text>
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
