import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  SharedGoal,
} from '../lib/communityApi';
import type { SharedTask } from '../types';
import * as spotifyAuth from '../lib/spotifyAuth';

import * as Location from 'expo-location';

let TaskManager: any = null;
try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  // Optional
}

const LOCATION_TASK_NAME = 'community-background-location';
const REFRESH_INTERVAL = 30000; // 30 seconds
const SHARED_TASKS_REFRESH_INTERVAL = 120000; // 2 minutes (shared tasks have realtime; this is a safety fallback)

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
  /** Total items to surface on the Community tab badge (reactions + pending shares + friend requests). */
  communityBadgeCount: number;
  myActivity: UserActivity | null;

  // Actions
  refreshFriends: () => Promise<void>;
  refreshCircles: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  refreshMyActivity: () => Promise<void>;
  updateActivity: (type: ActivityType, detail?: string, courseName?: string) => Promise<void>;
  clearMyActivity: () => Promise<void>;
  sendReaction: (receiverId: string, type: string, message?: string) => Promise<void>;
  sendBump: (receiverId: string) => Promise<void>;

  // Accountability Pacts (Shared Goals)
  sharedGoals: SharedGoal[];
  refreshSharedGoals: () => Promise<void>;
  createSharedGoal: (friendId: string, localTaskId: string, title: string, shareType: 'task' | 'subject', courseId: string) => Promise<SharedGoal | null>;
  updateSharedGoalStatus: (id: string, updates: Partial<Pick<SharedGoal, 'status' | 'is_completed'>>) => Promise<void>;

  // Shared Tasks (Linked Task Sharing)
  incomingSharedTasks: SharedTask[];
  acceptedSharedTasks: SharedTask[];
  refreshSharedTasks: () => Promise<void>;
  shareTaskWithFriend: (taskId: string, friendId: string, message?: string) => Promise<SharedTask | null>;
  shareTaskWithCircle: (taskId: string, circleId: string, message?: string) => Promise<SharedTask[]>;
  shareAllTasksWithFriend: (taskIds: string[], friendId: string, message?: string) => Promise<SharedTask[]>;
  shareAllTasksWithCircle: (taskIds: string[], circleId: string, message?: string) => Promise<SharedTask[]>;
  respondToShare: (sharedTaskId: string, accept: boolean) => Promise<void>;
  toggleSharedCompletion: (sharedTaskId: string, completed: boolean) => Promise<void>;
  /** Deletes only the shared_tasks row for you; does not delete the owner's task. */
  removeSharedTaskLink: (sharedTaskId: string) => Promise<boolean>;

  // Auto-share tasks streams
  shareStreams: import('../types').TaskShareStream[];
  refreshShareStreams: () => Promise<void>;
  toggleShareStream: (friendId: string, enabled: boolean) => Promise<void>;
  toggleCircleShareStream: (circleId: string, enabled: boolean) => Promise<void>;

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
  // Spotify Music Presence
  spotifyConnected: boolean;
  connectSpotify: () => Promise<boolean>;
  disconnectSpotify: () => Promise<void>;
  refreshMyMusic: () => Promise<void>;
  /** One-shot refresh of friends, circles, shared tasks, activity, etc. */
  refreshAll: () => Promise<void>;

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

  // Spotify Music Presence
  const [spotifyConnected, setSpotifyConnected] = useState(false);

  // Accountability Pacts
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([]);

  // Shared Tasks
  const [incomingSharedTasks, setIncomingSharedTasks] = useState<SharedTask[]>([]);
  const [acceptedSharedTasks, setAcceptedSharedTasks] = useState<SharedTask[]>([]);

  // Task Share Streams
  const [shareStreams, setShareStreams] = useState<import('../types').TaskShareStream[]>([]);

  // Circle filtering
  const [selectedCircleId, setSelectedCircleId] = useState<string | null>(null);
  const [circleMemberIds, setCircleMemberIds] = useState<string[]>([]);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sharedTasksTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationWatchRef = useRef<any>(null);

  // Filtered friends based on selected circle
  const filteredFriends = selectedCircleId
    ? friendsWithStatus.filter((f) => circleMemberIds.includes(f.id))
    : friendsWithStatus;

  const communityBadgeCount = useMemo(() => {
    const pendingShares = incomingSharedTasks.filter((s) => s.status === 'pending').length;
    return unreadReactionCount + pendingShares + incomingRequests.length;
  }, [unreadReactionCount, incomingSharedTasks, incomingRequests]);

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

  const refreshSharedGoals = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await communityApi.fetchSharedGoals();
      setSharedGoals(data);
    } catch (e) {
      // Ignore
    }
  }, [userId]);

  const refreshSharedTasks = useCallback(async () => {
    if (!userId) return;
    try {
      const [incoming, accepted] = await Promise.all([
        communityApi.getIncomingSharedTasks().catch(() => [] as SharedTask[]),
        communityApi.getAcceptedSharedTasks().catch(() => [] as SharedTask[]),
      ]);
      setIncomingSharedTasks(incoming);
      setAcceptedSharedTasks(accepted);
    } catch (e) {
      // Table may not exist yet
    }
  }, [userId]);

  const refreshShareStreams = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await communityApi.getTaskShareStreams().catch(() => []);
      setShareStreams(data);
    } catch (e) {
      // Ignore
    }
  }, [userId]);

  const toggleShareStream = useCallback(async (friendId: string, enabled: boolean) => {
    if (!userId) return;
    try {
      await communityApi.setTaskShareStreamEnabled(friendId, enabled);
      await refreshShareStreams();
    } catch (e) {
      console.warn('Failed to toggle share stream:', e);
    }
  }, [userId, refreshShareStreams]);

  const toggleCircleShareStream = useCallback(async (circleId: string, enabled: boolean) => {
    if (!userId) return;
    try {
      await communityApi.setCircleShareStreamEnabled(circleId, enabled);
      await refreshShareStreams();
    } catch (e) {
      console.warn('Failed to toggle circle share stream:', e);
    }
  }, [userId, refreshShareStreams]);

  const refreshAll = useCallback(async () => {
    try {
      await Promise.allSettled([
        refreshFriends(),
        refreshCircles(),
        refreshRequests(),
        refreshUnreadCount(),
        refreshMyActivity(),
        refreshSharedGoals(),
        refreshSharedTasks(),
        refreshShareStreams(),
        spotifyAuth.isSpotifyConnected().then((connected) => setSpotifyConnected(connected)),
      ]);
    } catch (e) {
      // Silently fail
    }
  }, [
    refreshFriends,
    refreshCircles,
    refreshRequests,
    refreshUnreadCount,
    refreshMyActivity,
    refreshSharedGoals,
    refreshSharedTasks,
    refreshShareStreams,
  ]);

  // Initial load + periodic refresh
  useEffect(() => {
    if (!userId) {
      setFriends([]);
      setFriendsWithStatus([]);
      setCircles([]);
      setIncomingRequests([]);
      setUnreadReactionCount(0);
      setMyActivity(null);
      setSharedGoals([]);
      setIncomingSharedTasks([]);
      setAcceptedSharedTasks([]);
      setShareStreams([]);
      setSelectedCircleId(null);
      setCircleMemberIds([]);
      setSpotifyConnected(false);
      setLocationPermissionGranted(false);
      setMyLatitude(null);
      setMyLongitude(null);
      setLocationVisibilityState('friends');
      setLoading(false);
      return;
    }

    setLoading(true);
    refreshAll().finally(() => setLoading(false));

    refreshTimerRef.current = setInterval(() => {
      refreshFriends();
      refreshCircles();
      refreshRequests();
      refreshUnreadCount();
      refreshMyActivity();
      refreshSharedGoals();
    }, REFRESH_INTERVAL);

    // Separate slower fallback poll for shared tasks (realtime covers most updates)
    sharedTasksTimerRef.current = setInterval(() => {
      refreshSharedTasks();
      refreshShareStreams();
    }, SHARED_TASKS_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (sharedTasksTimerRef.current) clearInterval(sharedTasksTimerRef.current);
    };
  }, [
    userId,
    refreshAll,
    refreshFriends,
    refreshCircles,
    refreshRequests,
    refreshUnreadCount,
    refreshMyActivity,
    refreshSharedGoals,
    refreshSharedTasks,
    refreshShareStreams,
  ]);

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

  // ─── Listen for incoming shared tasks → local push notification ───
  // (notification is fired from the unified shared-tasks-changes channel below)

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
        // Preserve music fields so the map marker keeps showing the song name
        is_playing: myActivity?.is_playing,
        song_name: myActivity?.song_name,
        song_artist: myActivity?.song_artist,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Failed to update activity:', e);
    }
  }, [userId, myActivity]);

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

  // ─── Shared Goals actions ───
  const createSharedGoal = useCallback(async (
    friendId: string, localTaskId: string, title: string, shareType: 'task' | 'subject', courseId: string
  ) => {
    if (!userId) return null;
    const goal = await communityApi.createSharedGoal({ friendId, localTaskId, title, shareType, courseId });
    if (goal) refreshSharedGoals();
    return goal;
  }, [userId, refreshSharedGoals]);

  const updateSharedGoalStatus = useCallback(async (
    id: string, updates: Partial<Pick<SharedGoal, 'status' | 'is_completed'>>
  ) => {
    if (!userId) return;
    await communityApi.updateSharedGoalStatus(id, updates);
    refreshSharedGoals();
  }, [userId, refreshSharedGoals]);

  // ─── Shared Task actions ───
  const shareTaskWithFriend = useCallback(async (taskId: string, friendId: string, message?: string) => {
    if (!userId) return null;
    const result = await communityApi.shareTaskWithFriend(taskId, friendId, message);
    if (result) refreshSharedTasks();
    return result;
  }, [userId, refreshSharedTasks]);

  const shareTaskWithCircle = useCallback(async (taskId: string, circleId: string, message?: string) => {
    if (!userId) return [];
    const results = await communityApi.shareTaskWithCircle(taskId, circleId, message);
    if (results.length > 0) refreshSharedTasks();
    return results;
  }, [userId, refreshSharedTasks]);

  const shareAllTasksWithFriend = useCallback(async (taskIds: string[], friendId: string, message?: string) => {
    if (!userId) return [];
    const results = await communityApi.shareAllTasksWithFriend(taskIds, friendId, message);
    if (results.length > 0) refreshSharedTasks();
    return results;
  }, [userId, refreshSharedTasks]);

  const shareAllTasksWithCircle = useCallback(async (taskIds: string[], circleId: string, message?: string) => {
    if (!userId) return [];
    const results = await communityApi.shareAllTasksWithCircle(taskIds, circleId, message);
    if (results.length > 0) refreshSharedTasks();
    return results;
  }, [userId, refreshSharedTasks]);

  const respondToShare = useCallback(async (sharedTaskId: string, accept: boolean) => {
    if (!userId) return;
    await communityApi.respondToSharedTask(sharedTaskId, accept);
    refreshSharedTasks();
  }, [userId, refreshSharedTasks]);

  const toggleSharedCompletion = useCallback(async (sharedTaskId: string, completed: boolean) => {
    if (!userId) return;
    try {
      await communityApi.updateSharedTaskCompletion(sharedTaskId, completed);
      setAcceptedSharedTasks((prev) =>
        prev.map((st) => (st.id === sharedTaskId ? { ...st, recipient_completed: completed } : st)),
      );
    } catch (e) {
      Alert.alert(
        'Could not update',
        e instanceof Error ? e.message : 'Please try again.',
      );
    }
  }, [userId]);

  const removeSharedTaskLink = useCallback(
    async (sharedTaskId: string): Promise<boolean> => {
      const { error } = await communityApi.deleteSharedTaskLinkForCurrentUser(sharedTaskId);
      if (error) {
        Alert.alert('Could not remove', error);
        return false;
      }
      setAcceptedSharedTasks((prev) => prev.filter((st) => st.id !== sharedTaskId));
      setIncomingSharedTasks((prev) => prev.filter((st) => st.id !== sharedTaskId));
      await refreshSharedTasks();
      return true;
    },
    [refreshSharedTasks]
  );

  // ─── Realtime subscription for shared_tasks changes ───
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('shared-tasks-changes')
      // Recipient: any event (INSERT / UPDATE / DELETE)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'shared_tasks',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload: any) => {
          refreshSharedTasks();
          // Fire push notification for new incoming shares (INSERT only)
          if (payload.eventType === 'INSERT') {
            const row = payload.new;
            if (!row) return;
            try {
              // Look up owner profile and task title for a meaningful notification
              const [profileRes, taskRes] = await Promise.all([
                supabase.from('profiles').select('name').eq('id', row.owner_id).single(),
                supabase.from('tasks').select('title').eq('id', row.task_id).single(),
              ]);
              const ownerName = profileRes.data?.name ?? 'Someone';
              const taskTitle = taskRes.data?.title ?? 'a task';
              const { fireSharedTaskNotification } = require('../notificationManager');
              await fireSharedTaskNotification(ownerName, taskTitle);
            } catch (e) {
              console.warn('Failed to show shared task notification:', e);
            }
          }
        }
      )
      // Owner: any event (INSERT from auto-share, UPDATE when recipient responds, DELETE)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'shared_tasks',
          filter: `owner_id=eq.${userId}`,
        },
        () => { refreshSharedTasks(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshSharedTasks]);

  const value: CommunityState = {
    friends,
    friendsWithStatus,
    circles,
    incomingRequests,
    unreadReactionCount,
    communityBadgeCount,
    myActivity,
    refreshFriends,
    refreshCircles,
    refreshRequests,
    refreshUnreadCount,
    refreshMyActivity,
    updateActivity,
    clearMyActivity,
    sendReaction: handleSendReaction,
    sendBump: handleSendBump,
    selectedCircleId,
    setSelectedCircleId,
    filteredFriends,
    sharedGoals,
    refreshSharedGoals,
    createSharedGoal,
    updateSharedGoalStatus,
    incomingSharedTasks,
    acceptedSharedTasks,
    refreshSharedTasks,
    shareTaskWithFriend,
    shareTaskWithCircle,
    shareAllTasksWithFriend,
    shareAllTasksWithCircle,
    respondToShare,
    toggleSharedCompletion,
    removeSharedTaskLink,
    shareStreams,
    refreshShareStreams,
    toggleShareStream,
    toggleCircleShareStream,
    locationPermissionGranted,
    requestLocationPermission,
    myLatitude,
    myLongitude,
    locationVisibility,
    setLocationVisibility,
    spotifyConnected,
    connectSpotify: async () => {
      const ok = await spotifyAuth.connectSpotify();
      if (ok) setSpotifyConnected(true);
      return ok;
    },
    disconnectSpotify: async () => {
      await spotifyAuth.disconnectSpotify();
      setSpotifyConnected(false);
    },
    refreshMyMusic: async () => {
      await spotifyAuth.getMyVibe();
    },
    refreshAll,
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
