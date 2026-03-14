import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import * as communityApi from '../lib/communityApi';
import type {
  FriendProfile,
  FriendWithStatus,
  Circle,
  QuickReaction,
  UserActivity,
  ActivityType,
  LocationVisibility,
  Friendship,
} from '../lib/communityApi';

import * as Location from 'expo-location';

let TaskManager: any = null;
try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  // Optional
}

const LOCATION_TASK_NAME = 'community-background-location';
const REFRESH_INTERVAL = 30000; // 30 seconds

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface CommunityState {
  // Data
  friends: FriendProfile[];
  friendsWithStatus: FriendWithStatus[];
  circles: Circle[];
  incomingRequests: Friendship[];
  unreadReactionCount: number;
  myActivity: UserActivity | null;

  // Actions
  refreshFriends: () => Promise<void>;
  refreshCircles: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  updateActivity: (type: ActivityType, detail?: string, courseName?: string) => Promise<void>;
  clearMyActivity: () => Promise<void>;
  sendReaction: (receiverId: string, type: string, message?: string) => Promise<void>;
  sendBump: (receiverId: string) => Promise<void>;

  // Circle filtering
  selectedCircleId: string | null;
  setSelectedCircleId: (id: string | null) => void;
  filteredFriends: FriendWithStatus[];

  // Location
  locationPermissionGranted: boolean;
  requestLocationPermission: () => Promise<boolean>;
  myLatitude: number | null;
  myLongitude: number | null;
  locationVisibility: LocationVisibility;
  setLocationVisibility: (v: LocationVisibility) => Promise<void>;

  // Loading
  loading: boolean;
  userId: string | null;
}

const CommunityContext = createContext<CommunityState | null>(null);

// =============================================================================
// BACKGROUND LOCATION TASK
// =============================================================================

// Register background task (must be at module level)
if (TaskManager?.defineTask) {
  TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }: any) => {
    if (error) {
      console.warn('Background location error:', error);
      return;
    }
    if (data) {
      const { locations } = data;
      const loc = locations?.[0];
      if (loc) {
        // Get user ID from stored state and update location
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) {
            communityApi
              .updateMyLocation(session.user.id, loc.coords.latitude, loc.coords.longitude)
              .catch(console.warn);
          }
        });
      }
    }
  });
}

// =============================================================================
// PROVIDER
// =============================================================================

export function CommunityProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [friendsWithStatus, setFriendsWithStatus] = useState<FriendWithStatus[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<Friendship[]>([]);
  const [unreadReactionCount, setUnreadReactionCount] = useState(0);
  const [myActivity, setMyActivity] = useState<UserActivity | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [myLatitude, setMyLatitude] = useState<number | null>(null);
  const [myLongitude, setMyLongitude] = useState<number | null>(null);
  const [locationVisibility, setLocationVisibilityState] = useState<LocationVisibility>('friends');
  const [loading, setLoading] = useState(true);

  // Circle filtering
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [circleMemberIds, setCircleMemberIds] = useState<string[]>([]);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatchRef = useRef<any>(null);

  // Filtered friends based on selected circle
  const filteredFriends = selectedCircleId && circleMemberIds.length > 0
    ? friendsWithStatus.filter((f) => circleMemberIds.includes(f.id))
    : friendsWithStatus;

  // Get current user on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load circle members when a circle is selected
  useEffect(() => {
    if (!selectedCircleId) {
      setCircleMemberIds([]);
      return;
    }
    communityApi
      .getCircleMemberIds(selectedCircleId)
      .then(setCircleMemberIds)
      .catch(() => setCircleMemberIds([]));
  }, [selectedCircleId]);

  // Refresh functions
  const refreshFriends = useCallback(async () => {
    if (!userId) return;
    try {
      const [friendsList, withStatus] = await Promise.all([
        communityApi.getFriends(userId).catch(() => [] as FriendProfile[]),
        communityApi.getFriendsWithStatus(userId).catch(() => [] as FriendWithStatus[]),
      ]);
      setFriends(friendsList);
      setFriendsWithStatus(withStatus);
    } catch (e) {
      // Tables may not exist yet
    }
  }, [userId]);

  const refreshCircles = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await communityApi.getMyCircles(userId).catch(() => [] as Circle[]);
      setCircles(data);
    } catch (e) {
      // Tables may not exist yet
    }
  }, [userId]);

  const refreshRequests = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await communityApi.getIncomingRequests(userId).catch(() => [] as Friendship[]);
      setIncomingRequests(data);
    } catch (e) {
      // Tables may not exist yet
    }
  }, [userId]);

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const count = await communityApi.getUnreadReactionCount(userId).catch(() => 0);
      setUnreadReactionCount(count);
    } catch (e) {
      // Tables may not exist yet
    }
  }, [userId]);

  const refreshMyActivity = useCallback(async () => {
    if (!userId) return;
    try {
      const activity = await communityApi.getMyActivity(userId).catch(() => null);
      setMyActivity(activity);
    } catch (e) {
      // Ignore
    }
  }, [userId]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.allSettled([
        refreshFriends(),
        refreshCircles(),
        refreshRequests(),
        refreshUnreadCount(),
        refreshMyActivity(),
      ]);
    } catch (e) {
      // Silently fail
    }
  }, [refreshFriends, refreshCircles, refreshRequests, refreshUnreadCount, refreshMyActivity]);

  // Initial load + periodic refresh
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    refreshAll().finally(() => setLoading(false));

    refreshTimerRef.current = setInterval(() => {
      refreshFriends();
      refreshUnreadCount();
      refreshMyActivity();
    }, REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [userId, refreshAll, refreshFriends, refreshUnreadCount, refreshMyActivity]);

  // ─── Listen for incoming bumps → local push notification ───
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('bump-notifications')
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quick_reactions',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload: any) => {
          const reaction = payload.new;
          if (reaction?.reaction_type === 'bump') {
            // Trigger a local push notification
            try {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '💥 Bump!',
                  body: 'Someone bumped you!',
                  data: { type: 'bump', senderId: reaction.sender_id },
                  sound: 'default',
                },
                trigger: null, // Immediately
              });
            } catch (e) {
              console.warn('Failed to show bump notification:', e);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ─── Location watching ───
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Location Required', 'Please enable location to show your position on the map.');
        return false;
      }

      // Request background permission
      if (Platform.OS !== 'web') {
        try {
          const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
          if (bgStatus === 'granted' && TaskManager) {
            // Start background location task
            const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME).catch(() => false);
            if (!isRegistered) {
              await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 60000, // 1 min
                distanceInterval: 100, // 100m
                showsBackgroundLocationIndicator: true,
                foregroundService: {
                  notificationTitle: 'Gradeup',
                  notificationBody: 'Sharing your location with friends',
                },
              }).catch(console.warn);
            }
          }
        } catch (e) {
          console.warn('Background location not available:', e);
        }
      }

      setLocationPermissionGranted(true);
      return true;
    } catch (e) {
      console.warn('Location permission error:', e);
      return false;
    }
  }, []);

  // Start foreground location watching
  useEffect(() => {
    if (!locationPermissionGranted || !userId) return;

    let mounted = true;

    const startWatching = async () => {
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (mounted) {
          setMyLatitude(current.coords.latitude);
          setMyLongitude(current.coords.longitude);
          communityApi.updateMyLocation(userId, current.coords.latitude, current.coords.longitude).catch(console.warn);
        }

        const watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 50,
          },
          (loc: any) => {
            if (!mounted) return;
            setMyLatitude(loc.coords.latitude);
            setMyLongitude(loc.coords.longitude);
            communityApi.updateMyLocation(userId, loc.coords.latitude, loc.coords.longitude).catch(console.warn);
          }
        );

        locationWatchRef.current = watcher;
      } catch (e) {
        console.warn('Location watch error:', e);
      }
    };

    startWatching();

    return () => {
      mounted = false;
      if (locationWatchRef.current?.remove) {
        locationWatchRef.current.remove();
      }
    };
  }, [locationPermissionGranted, userId]);

  // ─── Location visibility ───
  const setLocationVisibility = useCallback(async (v: LocationVisibility) => {
    if (!userId) return;
    try {
      await communityApi.updateLocationVisibility(userId, v);
      setLocationVisibilityState(v);
    } catch (e) {
      console.warn('Failed to update location visibility:', e);
    }
  }, [userId]);

  // ─── Activity actions ───
  const updateActivity = useCallback(async (type: ActivityType, detail?: string, courseName?: string) => {
    if (!userId) return;
    try {
      await communityApi.updateMyActivity(userId, type, detail, courseName);
      setMyActivity({
        user_id: userId,
        activity_type: type,
        detail: detail || undefined,
        course_name: courseName || undefined,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to update activity:', e);
    }
  }, [userId]);

  const clearMyActivity = useCallback(async () => {
    if (!userId) return;
    try {
      await communityApi.clearActivity(userId);
      setMyActivity(null);
    } catch (e) {
      console.warn('Failed to clear activity:', e);
    }
  }, [userId]);

  // ─── Reaction actions ───
  const handleSendReaction = useCallback(async (receiverId: string, type: string, message?: string) => {
    if (!userId) return;
    try {
      await communityApi.sendReaction(userId, receiverId, type, message);
    } catch (e) {
      console.warn('Failed to send reaction:', e);
    }
  }, [userId]);

  const handleSendBump = useCallback(async (receiverId: string) => {
    if (!userId) return;
    try {
      await communityApi.sendBump(userId, receiverId);
    } catch (e) {
      console.warn('Failed to send bump:', e);
    }
  }, [userId]);

  const value: CommunityState = {
    friends,
    friendsWithStatus,
    circles,
    incomingRequests,
    unreadReactionCount,
    myActivity,
    refreshFriends,
    refreshCircles,
    refreshRequests,
    refreshUnreadCount,
    updateActivity,
    clearMyActivity,
    sendReaction: handleSendReaction,
    sendBump: handleSendBump,
    selectedCircleId,
    setSelectedCircleId,
    filteredFriends,
    locationPermissionGranted,
    requestLocationPermission,
    myLatitude,
    myLongitude,
    locationVisibility,
    setLocationVisibility,
    loading,
    userId,
  };

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}
