import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { COLORS } from '../../src/constants';

export default function TabLayout() {
  const router = useRouter();
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.navy,
          tabBarInactiveTintColor: '#cbd5e1',
          tabBarLabelStyle: styles.tabLabel,
          tabBarIconStyle: { marginBottom: -2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <Feather name="calendar" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="planner"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color }) => (
              <Feather name="check-circle" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="add-menu"
          options={{
            title: '',
            tabBarIcon: () => (
              <View style={styles.centerBtn}>
                <Feather name="plus" size={26} color={COLORS.white} />
              </View>
            ),
            tabBarLabel: () => null,
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShowAddMenu(!showAddMenu);
            },
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{
            title: 'Notes',
            tabBarIcon: ({ color }) => (
              <Feather name="list" size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => (
              <Feather name="user" size={20} color={color} />
            ),
          }}
        />
      </Tabs>

      {showAddMenu && (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowAddMenu(false)}
        >
          <View style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowAddMenu(false);
                router.push('/add-task');
              }}
            >
              <View style={[styles.menuIcon, { backgroundColor: COLORS.navy }]}>
                <Feather name="plus" size={18} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.menuItemTitle}>Add Manually</Text>
                <Text style={styles.menuItemSub}>Create a new task yourself</Text>
              </View>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowAddMenu(false);
                router.push('/(tabs)/planner' as any);
              }}
            >
              <View style={[styles.menuIcon, { backgroundColor: COLORS.gold }]}>
                <Feather name="zap" size={18} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.menuItemTitle}>AI Planner</Text>
                <Text style={styles.menuItemSub}>Let AI create tasks for you</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 0.5,
    borderTopColor: '#f1f5f9',
    height: 88,
    paddingBottom: 28,
    paddingTop: 8,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  centerBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: COLORS.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 110,
    zIndex: 999,
  },
  menuCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 8,
    width: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 14,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  menuItemSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
  },
});
