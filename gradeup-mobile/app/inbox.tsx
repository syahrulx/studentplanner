import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  category: string;
  is_read: boolean;
  created_at: string;
  data: any;
}

export default function InboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        setNotifications(data as InAppNotification[]);
      }
    } catch (e) {
      console.warn('Failed to load inbox:', e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await supabase
        .from('in_app_notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.warn('Failed to mark read', e);
    }
  };

  const handlePress = async (item: InAppNotification) => {
    if (!item.is_read && user) {
      // Optimistically update
      setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
      await supabase.from('in_app_notifications').update({ is_read: true }).eq('id', item.id);
    }

    // Routing logic based on data type
    const t = item.data?.type;
    if (t?.startsWith('service') || t === 'event_new') {
      const postId = item.data?.serviceId || item.data?.eventId;
      if (postId) {
        router.push(`/services/${postId}` as any);
      } else {
        router.push('/(tabs)/community' as any);
      }
    } else if (item.category === 'friend') {
      router.push('/profile' as any);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.nav, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]}>Notifications</Text>
        <View style={{ width: 40, alignItems: 'flex-end' }}>
          {unreadCount > 0 && (
            <Pressable onPress={markAllAsRead} hitSlop={10}>
              <Feather name="check-circle" size={22} color={theme.primary} />
            </Pressable>
          )}
        </View>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.center}>
          <Feather name="bell-off" size={48} color={theme.textSecondary} style={{ opacity: 0.5, marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No notifications yet.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable 
              onPress={() => handlePress(item)}
              style={({ pressed }) => [
                styles.itemRow, 
                { borderBottomColor: theme.border },
                !item.is_read && { backgroundColor: theme.primary + '10' },
                pressed && { backgroundColor: theme.backgroundSecondary }
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Feather 
                  name={item.category === 'friend' ? 'users' : item.category === 'event' ? 'calendar' : 'briefcase'} 
                  size={20} 
                  color={!item.is_read ? theme.primary : theme.textSecondary} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.text, fontWeight: !item.is_read ? '800' : '600' }]}>
                  {item.title}
                </Text>
                <Text style={[styles.itemBody, { color: theme.textSecondary }]}>
                  {item.body}
                </Text>
                <Text style={[styles.itemTime, { color: theme.textSecondary, opacity: 0.7 }]}>
                  {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {!item.is_read && (
                <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  itemRow: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 15, marginBottom: 4 },
  itemBody: { fontSize: 14, lineHeight: 20 },
  itemTime: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
});
