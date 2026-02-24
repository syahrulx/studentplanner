import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { ThemeIcon } from '@/components/ThemeIcon';

export default function TabLayout() {
  const theme = useTheme();
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const openAddMenu = () => setAddMenuOpen(true);
  const closeAddMenu = () => setAddMenuOpen(false);

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tabIconSelected,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
          },
          headerShown: false,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <ThemeIcon name="home" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color }) => <ThemeIcon name="tasks" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="two"
          options={{
            title: 'Add',
            tabBarIcon: () => null,
            tabBarButton: () => (
              <View style={styles.centerTabWrap}>
                <Pressable
                  style={[styles.centerButton, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
                  onPress={openAddMenu}
                >
                  <ThemeIcon name="add" size={28} color={theme.textInverse} />
                </Pressable>
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: 'Notes',
            tabBarIcon: ({ color }) => <ThemeIcon name="notes" size={26} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
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
    </>
  );
}

const styles = StyleSheet.create({
  centerTabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
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
