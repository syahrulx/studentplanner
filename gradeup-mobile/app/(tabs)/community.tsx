import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { WebView } from 'react-native-webview';
import { Avatar } from '@/components/Avatar';
import * as spotifyAuth from '@/src/lib/spotifyAuth';

import { useTheme } from '@/hooks/useTheme';
import { useWallClockTick } from '@/hooks/useWallClockTick';
import { useCommunity } from '@/src/context/CommunityContext';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import * as communityApi from '@/src/lib/communityApi';
import { ACTIVITY_TYPES } from '@/src/lib/communityApi';
import type { FriendWithStatus, Circle, SharedGoal, ActivityType, UserActivity } from '@/src/lib/communityApi';
import type { TimetableEntry } from '@/src/types';
import { getCurrentTimetableSubjectLabel, studyingStatusDetailText } from '@/src/lib/timetableCurrentSlot';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// react-native-maps requires a custom dev build (not available in Expo Go).
// We use a placeholder map UI if the library is not found.
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {
  // Gracefully fall back to placeholder
}

// =============================================================================
// HELPER
// =============================================================================

function getActivityEmoji(type?: string): string {
  const found = ACTIVITY_TYPES.find((a) => a.type === type);
  return found?.emoji || '⏸️';
}

function getActivityLabel(type?: string): string {
  const found = ACTIVITY_TYPES.find((a) => a.type === type);
  return found?.label || 'Idle';
}

function activityStatusDetailLine(
  activity: UserActivity | undefined,
  opts: { isSelf: boolean; timetable: TimetableEntry[] },
): string {
  if (!activity) return '';
  if (activity.activity_type === 'studying') {
    return studyingStatusDetailText(activity.detail, activity.course_name, opts);
  }
  return (activity.detail || '').trim() || getActivityLabel(activity.activity_type);
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// =============================================================================



// =============================================================================
// STABLE MARKER + MAP PIN
// =============================================================================

function StableMarker({
  id,
  coordinate,
  anchor,
  onPress,
  name,
  avatarUrl,
  activityType,
  isMe,
  isFocusing,
  isListening,
  listeningSongName,
  listeningSongArtist,
}: {
  id: string;
  coordinate: { latitude: number; longitude: number };
  anchor: { x: number; y: number };
  onPress?: () => void;
  name?: string;
  avatarUrl?: string;
  activityType?: string;
  isMe?: boolean;
  isFocusing?: boolean;
  isListening?: boolean;
  listeningSongName?: string;
  listeningSongArtist?: string;
}) {
  const theme = useTheme();
  const [tracksChanges, setTracksChanges] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContentRef = useRef('');

  const contentKey = `${activityType}-${isListening}-${listeningSongName || ''}-${listeningSongArtist || ''}`;

  useEffect(() => {
    if (contentKey !== prevContentRef.current) {
      prevContentRef.current = contentKey;
      setTracksChanges(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setTracksChanges(false), 2000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [contentKey]);

  useEffect(() => {
    const t = setTimeout(() => setTracksChanges(false), 2000);
    return () => clearTimeout(t);
  }, []);

  const emoji = getActivityEmoji(activityType);
  const isListeningActivity = activityType === 'listening_music';
  const isActive = activityType && activityType !== 'idle' && !isListeningActivity;
  const songLabel = listeningSongName?.trim() || '';
  const artistLabel = listeningSongArtist?.trim() || '';
  const showSong = !!(isListening && songLabel);
  const showStatus = !!(isActive);

  // Build the song text: "Song - Artist" or just "Song"
  const songDisplayText = showSong
    ? (artistLabel ? `${songLabel} — ${artistLabel}` : songLabel)
    : '';

  // CRITICAL: Never use conditional rendering, display:'none', or opacity:0
  // for children inside a Google Maps Marker. The native AIRGoogleMap will crash.
  // Instead, we ALWAYS render the same View tree structure.
  // When content is hidden, we collapse the View to zero size with overflow:hidden.

  return (
    <Marker
      key={id}
      coordinate={coordinate}
      anchor={anchor}
      onPress={onPress}
      tracksViewChanges={tracksChanges}
    >
      <View key={contentKey} style={styles.markerWrapper}>
        <View style={styles.markerInner}>
          {/* Song strip — always mounted. When hidden: zero size with overflow hidden */}
          <View style={[
            styles.songStrip,
            { backgroundColor: theme.card, borderColor: theme.border },
            !showSong && { height: 0, paddingVertical: 0, paddingHorizontal: 0, marginBottom: 0, borderWidth: 0, overflow: 'hidden' as const },
          ]}>
            <Text style={[styles.songStripIcon, { color: theme.primary }]}>♪</Text>
            <Text style={[styles.songStripText, { color: theme.text }]}>
              {songDisplayText || ' '}
            </Text>
          </View>
          {/* Status cloud — always mounted. When hidden: zero size */}
          <View style={[
            styles.statusCloud, isMe && styles.statusCloudMe,
            !showStatus && { height: 0, width: 0, paddingVertical: 0, paddingHorizontal: 0, marginBottom: 0, borderWidth: 0, overflow: 'hidden' as const },
          ]}>
            <Text style={styles.statusCloudText}>{emoji || ' '}</Text>
          </View>
          {/* Avatar — always shown */}
          <View style={styles.avatarRing}>
            <Avatar name={name} avatarUrl={avatarUrl} size={42} />
          </View>
          <View style={styles.pinTriangle} />
        </View>
      </View>
    </Marker>
  );
}

// =============================================================================
// MAP AUDIO PLAYER
// =============================================================================

function MapAudioPlayer({ trackId, songName }: { trackId: string; songName?: string }) {
  const theme = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const togglePlay = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        if (!soundRef.current) {
          const previewUrl = await spotifyAuth.getTrackPreviewUrl(trackId);
          if (!previewUrl) {
            setShowEmbed(true);
            setIsLoading(false);
            return;
          }
          const { sound } = await Audio.Sound.createAsync(
            { uri: previewUrl },
            { shouldPlay: true }
          );
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
              sound.setPositionAsync(0);
            }
          });
          soundRef.current = sound;
          setIsPlaying(true);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
      }
    } catch (e) {
      console.warn('MapAudioPlayer play error:', e);
      Alert.alert('Error', 'Could not play the audio preview. Please check your connection.');
    }
    setIsLoading(false);
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.mapOverlayBtn,
          { backgroundColor: theme.primary },
          pressed && { opacity: 0.8 },
        ]}
        onPress={togglePlay}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name={isPlaying ? "pause" : "play"} size={16} color="#fff" />
        )}
        <Text style={[styles.mapOverlayBtnText, { color: '#fff', maxWidth: 120 }]} numberOfLines={1}>
          {isPlaying ? 'Playing...' : (songName || 'Play')}
        </Text>
      </Pressable>

      <Modal visible={showEmbed} transparent animationType="slide" onRequestClose={() => setShowEmbed(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, height: 400 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>Spotify Preview</Text>
              <Pressable onPress={() => setShowEmbed(false)} style={{ padding: 4 }}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>
            <WebView
              source={{ uri: `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0` }}
              style={{ flex: 1, backgroundColor: 'transparent', borderRadius: 12 }}
              scrollEnabled={false}
              allowsInlineMediaPlayback={true}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CommunityMap() {
  const theme = useTheme();
  const { language, user, timetable } = useApp();
  /** Keeps “current class” under Studying in sync as periods change. */
  useWallClockTick(30_000);
  const T = useTranslations(language);
  const {
    filteredFriends,
    circles,
    communityBadgeCount,
    myLatitude,
    myLongitude,
    myActivity,
    locationPermissionGranted,
    requestLocationPermission,
    loading,
    sendReaction,
    sendBump,
    selectedCircleId,
    setSelectedCircleId,
    sharedGoals,
    updateSharedGoalStatus,
    acceptedSharedTasks,
    refreshMyActivity,
    refreshFriends,
    updateActivity,
    clearMyActivity,
    spotifyConnected,
    connectSpotify,
  } = useCommunity();

  const [activeTab, setActiveTab] = useState<'people' | 'places'>('people');
  const [showCircleSelector, setShowCircleSelector] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithStatus | null>(null);
  const [mapSongOverlays, setMapSongOverlays] = useState<Array<{ id: string; x: number; y: number; text: string; isMe?: boolean }>>([]);
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const mapRef = useRef<any>(null);

  const selectedCircle = circles.find((c) => c.id === selectedCircleId) || null;

  // Request location on mount
  useEffect(() => {
    if (!locationPermissionGranted) {
      requestLocationPermission();
    }
  }, [locationPermissionGranted, requestLocationPermission]);

  const visibleFriends = filteredFriends;

  const refreshMapSongOverlays = useCallback(async () => {
    if (!mapRef.current || typeof mapRef.current.pointForCoordinate !== 'function') {
      setMapSongOverlays([]);
      return;
    }

    const items: Array<{ id: string; latitude: number; longitude: number; text: string; isMe?: boolean }> = [];

    if (myLatitude && myLongitude && myActivity?.is_playing && myActivity.song_name) {
      items.push({
        id: 'me',
        latitude: myLatitude,
        longitude: myLongitude,
        text: myActivity.song_name,
        isMe: true,
      });
    }

    for (const friend of visibleFriends) {
      if (friend.location && friend.music?.isPlaying && friend.music.song) {
        items.push({
          id: friend.id,
          latitude: friend.location.latitude,
          longitude: friend.location.longitude,
          text: friend.music.song,
        });
      }
    }

    try {
      const points = await Promise.all(
        items.map(async (item) => {
          const point = await mapRef.current.pointForCoordinate({
            latitude: item.latitude,
            longitude: item.longitude,
          });
          return {
            id: item.id,
            text: item.text,
            isMe: item.isMe,
            x: point.x - 72,
            y: point.y - 82,
          };
        })
      );
      setMapSongOverlays(points);
    } catch {
      setMapSongOverlays([]);
    }
  }, [myLatitude, myLongitude, myActivity?.is_playing, myActivity?.song_name, visibleFriends]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshMapSongOverlays().catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [refreshMapSongOverlays]);

  useFocusEffect(
    useCallback(() => {
      refreshMyActivity().catch(() => {});
      refreshFriends().catch(() => {});
      setTimeout(() => {
        refreshMapSongOverlays().catch(() => {});
      }, 250);
    }, [refreshMyActivity, refreshFriends, refreshMapSongOverlays])
  );

  const getSharedCountWith = useCallback((friendId: string) => {
    return (acceptedSharedTasks || []).filter(
      st => st.recipient_id === friendId || st.owner_id === friendId
    ).length;
  }, [acceptedSharedTasks]);

  const handleQuickReact = useCallback(
    async (friendId: string, emoji: string) => {
      await sendReaction(friendId, emoji);
    },
    [sendReaction]
  );

  const handleBump = useCallback(
    async (friendId: string) => {
      await sendBump(friendId);
    },
    [sendBump]
  );

  const handleCenterOnMe = useCallback(() => {
    if (myLatitude && myLongitude && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: myLatitude,
        longitude: myLongitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  }, [myLatitude, myLongitude]);

  // =========================================================================

  // RENDER
  // =========================================================================

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ─── TOP BAR ─── */}
      <View style={[styles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.topBarSide} />
        <View style={styles.circleSelectorWrap}>
          <View style={styles.circleSelector}>
            <Pressable
              onPress={() => {
                if (selectedCircle?.id) {
                  router.push({ pathname: '/community/circle-detail', params: { circleId: selectedCircle.id } } as any);
                } else {
                  setShowCircleSelector((v) => !v);
                }
              }}
              style={({ pressed }) => [styles.circleSelectorNameBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.circleName, { color: theme.text }]} numberOfLines={1}>
                {selectedCircle?.name || 'All Friends'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowCircleSelector((v) => !v)}
              style={({ pressed }) => [styles.circleSelectorChevronBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
            >
              <Feather name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/settings' as any)}
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Feather name="settings" size={22} color={theme.text} />
        </Pressable>
      </View>

      {/* ─── CIRCLE SELECTOR DROPDOWN ─── */}
      {showCircleSelector && (
        <View style={[styles.circleDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable
            style={[styles.circleDropdownItem, !selectedCircle && { backgroundColor: theme.primary + '15' }]}
            onPress={() => {
              setSelectedCircleId(null);
              setShowCircleSelector(false);
            }}
          >
            <Text style={[styles.circleDropdownText, { color: theme.text }]}>👥 All Friends</Text>
          </Pressable>
          {circles.map((circle) => (
            <Pressable
              key={circle.id}
              style={[
                styles.circleDropdownItem,
                selectedCircle?.id === circle.id && { backgroundColor: theme.primary + '15' },
              ]}
              onPress={() => {
                setSelectedCircleId(circle.id);
                setShowCircleSelector(false);
              }}
            >
              <Text style={[styles.circleDropdownText, { color: theme.text }]}>
                {circle.emoji} {circle.name}
              </Text>
              <Text style={[styles.circleDropdownCount, { color: theme.textSecondary }]}>
                {circle.member_count}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.circleDropdownItem}
            onPress={() => {
              setShowCircleSelector(false);
              router.push('/community/circles' as any);
            }}
          >
            <Text style={[styles.circleDropdownText, { color: theme.primary }]}>+ Create Circle</Text>
          </Pressable>
        </View>
      )}

      {/* ─── MAP SECTION ─── */}
      <View style={styles.mapContainer}>
        {MapView && myLatitude && myLongitude ? (
          <>
          <MapView
            ref={mapRef}
            style={styles.map}

            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: myLatitude,
              longitude: myLongitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            showsUserLocation
            onMapReady={() => {
              setTimeout(() => {
                refreshMapSongOverlays().catch(() => {});
              }, 300);
            }}
            onRegionChangeComplete={() => {
              refreshMapSongOverlays().catch(() => {});
            }}
          >

            {/* My own marker */}
            <StableMarker
              id="me"
              coordinate={{ latitude: myLatitude, longitude: myLongitude }}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => setShowStatusPopup(true)}
              name={user.name}
              avatarUrl={user.avatar}
              activityType={myActivity?.activity_type}
              isMe={true}
              isFocusing={myActivity?.activity_type === 'studying'}
              isListening={myActivity?.is_playing || myActivity?.activity_type === 'listening_music'}
              listeningSongName={myActivity?.song_name}
              listeningSongArtist={myActivity?.song_artist}
            />

            {/* Friend markers */}
            {visibleFriends
              .filter((f) => f.location)
              .map((friend) => (
                <StableMarker
                  key={friend.id}
                  id={friend.id}
                  coordinate={{
                    latitude: friend.location!.latitude,
                    longitude: friend.location!.longitude,
                  }}
                  anchor={{ x: 0.5, y: 1 }}
                  onPress={() => setSelectedFriend(friend)}
                  name={friend.name}
                  avatarUrl={friend.avatar_url}
                  activityType={friend.activity?.activity_type}
                  isFocusing={friend.activity?.activity_type === 'studying'}
                  isListening={friend.music?.isPlaying || friend.activity?.activity_type === 'listening_music'}
                  listeningSongName={friend.music?.song}
                  listeningSongArtist={friend.music?.artist}
                />
              ))}

          </MapView>
          {/* The music bubble is now embedded directly in the MapPin component */}
          </>
        ) : (
          <View style={[styles.mapPlaceholder, { backgroundColor: theme.backgroundSecondary || theme.card }]}>
            {loading ? (
              <ActivityIndicator size="large" color={theme.primary} />
            ) : (
              <>
                <Feather name="map-pin" size={48} color={theme.textSecondary} />
                <Text style={[styles.mapPlaceholderText, { color: theme.textSecondary }]}>
                  {!locationPermissionGranted
                    ? 'Enable location to see the map'
                    : 'Loading map...'}
                </Text>
                {!locationPermissionGranted && (
                  <Pressable
                    onPress={requestLocationPermission}
                    style={[styles.enableLocationBtn, { backgroundColor: theme.primary }]}
                  >
                    <Text style={styles.enableLocationBtnText}>Enable Location</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}

        {/* Map overlay buttons */}
        <View style={styles.mapOverlay}>
          {myActivity?.is_playing && myActivity?.song_track_id && (
            <MapAudioPlayer trackId={myActivity.song_track_id} songName={myActivity.song_name} />
          )}

          <Pressable
            style={({ pressed }) => [
              styles.mapOverlayBtn,
              { backgroundColor: theme.card },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setShowStatusPopup(true)}
          >
            <Feather name="edit-3" size={16} color={theme.primary} />
            <Text style={[styles.mapOverlayBtnText, { color: theme.primary }]}>Set Status</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.mapOverlayBtn,
              { backgroundColor: theme.card, width: 44, paddingHorizontal: 0, justifyContent: 'center' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleCenterOnMe}
          >
            <Feather name="crosshair" size={20} color={theme.primary} />
          </Pressable>
        </View>

      </View>

      {/* ─── SELECTED FRIEND POPUP ─── */}
      {selectedFriend && (() => {
        const friendPacts = (sharedGoals || []).filter(
          (g: SharedGoal) => (g.friend_id === selectedFriend.id || g.user_id === selectedFriend.id) && g.status !== 'rejected'
        );

        return (
          <View style={[styles.friendPopup, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.friendPopupHeader}>
              <Avatar name={selectedFriend.name} avatarUrl={selectedFriend.avatar_url} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.friendPopupName, { color: theme.text }]}>{selectedFriend.name}</Text>
                {selectedFriend.activity?.activity_type !== 'idle' && selectedFriend.activity?.activity_type !== 'listening_music' && (
                  <Text style={[styles.friendPopupActivity, { color: theme.textSecondary }]}>
                    {getActivityEmoji(selectedFriend.activity?.activity_type)}{' '}
                    {activityStatusDetailLine(selectedFriend.activity, { isSelf: false, timetable })}
                  </Text>
                )}
                {selectedFriend.music?.isPlaying && selectedFriend.music.song && (
                  selectedFriend.music.trackId ? (
                    <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                      <MapAudioPlayer trackId={selectedFriend.music.trackId} songName={selectedFriend.music.song} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                      <Text style={{ fontSize: 12, marginRight: 4 }}>🎵</Text>
                      <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {selectedFriend.music.song}
                      </Text>
                    </View>
                  )
                )}
              </View>
              <Pressable onPress={() => setSelectedFriend(null)}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Accountability Pacts Tracker */}
            {friendPacts.length > 0 && (
              <View style={[styles.pactsContainer, { backgroundColor: theme.backgroundSecondary || 'rgba(0,51,102,0.03)' }]}>
                <View style={styles.pactsHeader}>
                  <Feather name="shield" size={14} color={theme.primary} />
                  <Text style={[styles.pactsTitle, { color: theme.textSecondary }]}>Accountability Pacts</Text>
                </View>
                {friendPacts.map((pact: SharedGoal) => (
                  <View key={pact.id} style={styles.pactRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pactCourse, { color: theme.text }]}>{pact.course_id}</Text>
                      <Text style={[styles.pactDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                        {pact.share_type === 'task' ? pact.title : 'All Course Tasks'}
                      </Text>
                    </View>
                    
                    {pact.status === 'pending' && pact.user_id === user.id ? (
                      <Text style={{ fontSize: 12, color: theme.textSecondary, fontStyle: 'italic' }}>Pending</Text>
                    ) : pact.status === 'pending' && pact.friend_id === user.id ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Pressable 
                          style={[styles.pactActionBtn, { backgroundColor: '#10b981' }]}
                          onPress={() => updateSharedGoalStatus(pact.id, { status: 'accepted' })}
                        >
                          <Feather name="check" size={14} color="#fff" />
                        </Pressable>
                        <Pressable 
                          style={[styles.pactActionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => updateSharedGoalStatus(pact.id, { status: 'rejected' })}
                        >
                          <Feather name="x" size={14} color="#fff" />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={[styles.pactStatusBadge, { backgroundColor: pact.is_completed ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                        <Feather name={pact.is_completed ? 'check-circle' : 'clock'} size={12} color={pact.is_completed ? '#10b981' : '#f59e0b'} />
                        <Text style={[styles.pactStatusText, { color: pact.is_completed ? '#10b981' : '#f59e0b' }]}>
                          {pact.is_completed ? 'Done' : 'In Progress'}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Shared Tasks mini-badge */}
            {getSharedCountWith(selectedFriend.id) > 0 && (
              <View style={[styles.pactsContainer, { backgroundColor: 'rgba(99,102,241,0.06)' }]}>
                <View style={styles.pactsHeader}>
                  <Feather name="clipboard" size={14} color="#6366f1" />
                  <Text style={[styles.pactsTitle, { color: '#6366f1' }]}>
                    {getSharedCountWith(selectedFriend.id)} shared task{getSharedCountWith(selectedFriend.id) > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.friendPopupReactions}>
              {['👋', '🔥', '💪', '📚', '❤️'].map((emoji) => (
                <Pressable
                  key={emoji}
                  style={({ pressed }) => [
                    styles.reactionBtn,
                    { backgroundColor: theme.background },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => handleQuickReact(selectedFriend.id, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [
                  styles.reactionBtn,
                  styles.reactionBumpBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => handleBump(selectedFriend.id)}
              >
                <Text style={styles.reactionBumpText}>BUMP</Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              onPress={() => {
                setSelectedFriend(null);
                router.push({ pathname: '/community/friend-profile', params: { friendId: selectedFriend.id } } as any);
              }}
            >
              <Text style={{ textAlign: 'center', color: theme.primary, marginTop: 12, fontWeight: '600' }}>
                View Full Profile
              </Text>
            </Pressable>
          </View>
        );
      })()}

      {/* ─── BOTTOM SHEET ─── */}
      <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {/* Tab switcher */}
        <View style={styles.bottomSheetHandle}>
          <View style={[styles.handleBar, { backgroundColor: theme.textSecondary + '40' }]} />
        </View>

        <View style={styles.bottomSheetTabs}>
          <Text style={[styles.bottomSheetTitle, { color: theme.text }]}>Friends</Text>
          <View style={styles.bottomSheetActions}>
            <Pressable
              style={({ pressed }) => [
                styles.tabPill,
                activeTab === 'places' && { backgroundColor: theme.primary + '18' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setActiveTab(activeTab === 'places' ? 'people' : 'places')}
            >
              <Feather name="map" size={14} color={activeTab === 'places' ? theme.primary : theme.textSecondary} />
              <Text
                style={[
                  styles.tabPillText,
                  { color: activeTab === 'places' ? theme.primary : theme.textSecondary },
                ]}
              >
                Places
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.addFriendBtn, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]}
              onPress={() => router.push('/community/add-friend' as any)}
            >
              <Feather name="user-plus" size={14} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Friends list */}
        <ScrollView
          style={styles.peopleList}
          contentContainerStyle={styles.peopleListContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Me row - always shown at top */}
          <Pressable
            style={({ pressed }) => [
              styles.personRow,
              { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              pressed && { backgroundColor: theme.background },
            ]}
            onPress={() => setShowStatusPopup(true)}
          >
            <View style={styles.myAvatarWrap}>
              <Avatar name={user.name} avatarUrl={user.avatar} size={44} />
              <View style={[styles.onlineDot, { borderColor: theme.card }]} />
            </View>
            <View style={styles.personInfo}>
              <Text
                style={[styles.personName, { color: theme.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {user.name}{' '}
                <Text style={{ fontWeight: '400', color: theme.textSecondary }}>(You)</Text>
              </Text>
              {myActivity && myActivity.activity_type !== 'idle' && myActivity.activity_type !== 'listening_music' ? (
                <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                  {getActivityEmoji(myActivity.activity_type)}{' '}
                  {activityStatusDetailLine(myActivity, { isSelf: true, timetable })}
                </Text>
              ) : myActivity?.activity_type === 'idle' ? (
                <Text style={[styles.personStatus, { color: theme.textSecondary }]}>Tap to set your status</Text>
              ) : null}
              {myActivity?.is_playing && myActivity.song_name ? (
                <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                  ♪ {myActivity.song_name}
                </Text>
              ) : null}
            </View>
            <Feather name="edit-3" size={16} color={theme.textSecondary} />
          </Pressable>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />
          ) : visibleFriends.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="users" size={40} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No friends yet</Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                Add friends to see them on the map and stay connected
              </Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/community/add-friend' as any)}
              >
                <Feather name="user-plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Add Friends</Text>
              </Pressable>
            </View>
          ) : (
            visibleFriends.map((friend) => (
              <Pressable
                key={friend.id}
                style={({ pressed }) => [
                  styles.personRow,
                  pressed && { backgroundColor: theme.background },
                ]}
                onPress={() => {
                  if (friend.location && mapRef.current) {
                    mapRef.current.animateToRegion({
                      latitude: friend.location.latitude,
                      longitude: friend.location.longitude,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    }, 500);
                  }
                }}
              >
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push({ pathname: '/community/friend-profile', params: { friendId: friend.id } } as any);
                  }}
                >
                  <Avatar name={friend.name} avatarUrl={friend.avatar_url} size={44} />
                </Pressable>

                <View style={styles.personInfo}>
                  <Text
                    style={[styles.personName, { color: theme.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {friend.name}
                  </Text>
                  <Text style={[styles.personStatus, { color: theme.textSecondary }]} numberOfLines={1}>
                    {friend.location?.place_name || (friend.location ? 'Location shared' : 'Location off')}
                  </Text>
                  {friend.activity && friend.activity.activity_type !== 'idle' && friend.activity.activity_type !== 'listening_music' && (
                    <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                      {getActivityEmoji(friend.activity.activity_type)}{' '}
                      {activityStatusDetailLine(friend.activity, { isSelf: false, timetable })}
                    </Text>
                  )}
                  {friend.music?.isPlaying && friend.music.song ? (
                    <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                      ♪ {friend.music.song}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.personRight}>
                  {getSharedCountWith(friend.id) > 0 && (
                    <View style={styles.sharedTaskBadge}>
                      <Feather name="clipboard" size={10} color="#6366f1" />
                      <Text style={styles.sharedTaskBadgeText}>{getSharedCountWith(friend.id)}</Text>
                    </View>
                  )}
                  <Text style={[styles.personTime, { color: theme.textSecondary }]}>
                    {timeAgo(friend.location?.updated_at || friend.activity?.updated_at)}
                  </Text>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickReact(friend.id, '❤️');
                    }}
                    style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                  >
                    <Feather name="heart" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              </Pressable>
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      </View>

      {/* ─── SET STATUS POPUP ─── */}
      <StatusPopup
        visible={showStatusPopup}
        onClose={() => setShowStatusPopup(false)}
        myActivity={myActivity}
        timetable={timetable}
        updateActivity={updateActivity}
        clearMyActivity={clearMyActivity}
        refreshMyActivity={refreshMyActivity}
        spotifyConnected={spotifyConnected}
        connectSpotify={connectSpotify}
        theme={theme}
      />
    </View>
  );
}

// =============================================================================
// STATUS POPUP COMPONENT
// =============================================================================

const POPUP_STATUSES: { type: ActivityType; emoji: string; label: string }[] = [
  { type: 'studying', emoji: '📚', label: 'Studying' },
  { type: 'in_class', emoji: '🏫', label: 'In Class' },
  { type: 'taking_break', emoji: '😴', label: 'Taking a Break' },
  { type: 'listening_music', emoji: '🎵', label: 'Listening to Music' },
];

function StatusPopup({
  visible,
  onClose,
  myActivity,
  timetable,
  updateActivity,
  clearMyActivity,
  refreshMyActivity,
  spotifyConnected,
  connectSpotify,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  myActivity: any;
  timetable: TimetableEntry[];
  updateActivity: (type: ActivityType, detail?: string, courseName?: string) => Promise<void>;
  clearMyActivity: () => Promise<void>;
  refreshMyActivity: () => Promise<void>;
  spotifyConnected: boolean;
  connectSpotify: () => Promise<boolean>;
  theme: any;
}) {
  const [selectedType, setSelectedType] = useState<ActivityType>(
    (myActivity?.activity_type as ActivityType) || 'idle'
  );
  const [saving, setSaving] = useState(false);

  // Sync selected type when popup opens
  useEffect(() => {
    if (visible) {
      setSelectedType((myActivity?.activity_type as ActivityType) || 'idle');
    }
  }, [visible, myActivity?.activity_type]);

  const currentTypeInfo = ACTIVITY_TYPES.find((a) => a.type === myActivity?.activity_type);
  const hasStatus = myActivity && myActivity.activity_type !== 'idle';
  const isVibing = myActivity?.is_playing && myActivity?.song_name;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (selectedType === 'studying') {
        const label = getCurrentTimetableSubjectLabel(timetable) || 'Studying';
        await updateActivity('studying', label, label);
      } else {
        await updateActivity(selectedType);
      }
      await refreshMyActivity();
      onClose();
    } catch (e) {
      console.warn(e);
    }
    setSaving(false);
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await clearMyActivity();
      await refreshMyActivity();
      onClose();
    } catch (e) {
      console.warn(e);
    }
    setSaving(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={popupStyles.overlay} onPress={onClose}>
        <Pressable style={[popupStyles.container, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={popupStyles.header}>
            <Text style={[popupStyles.title, { color: theme.text }]}>What's up? 👋</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [popupStyles.closeBtn, pressed && { opacity: 0.6 }]}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* Current status */}
          {hasStatus && (
            <View style={[popupStyles.currentRow, { borderColor: theme.border }]}>
              <Text style={popupStyles.currentEmoji}>{currentTypeInfo?.emoji}</Text>
              <Text style={[popupStyles.currentLabel, { color: theme.text }]} numberOfLines={1}>
                {currentTypeInfo?.label}
              </Text>
              <Pressable
                onPress={handleClear}
                style={({ pressed }) => [popupStyles.clearBtn, pressed && { opacity: 0.6 }]}
              >
                <Feather name="x" size={14} color="#ef4444" />
                <Text style={popupStyles.clearText}>Clear</Text>
              </Pressable>
            </View>
          )}

          {/* Status grid — 2×2 */}
          <View style={popupStyles.grid}>
            {POPUP_STATUSES.map((activity) => {
              const isSelected = selectedType === activity.type;
              return (
                <Pressable
                  key={activity.type}
                  style={({ pressed }) => [
                    popupStyles.statusCard,
                    {
                      backgroundColor: isSelected ? theme.primary + '12' : theme.background,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                    pressed && { transform: [{ scale: 0.96 }] },
                  ]}
                  onPress={() => setSelectedType(activity.type)}
                >
                  <Text style={popupStyles.statusEmoji}>{activity.emoji}</Text>
                  <Text
                    style={[
                      popupStyles.statusLabel,
                      { color: isSelected ? theme.primary : theme.textSecondary },
                      isSelected && { fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {activity.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Music Vibe */}
          <Pressable
            style={({ pressed }) => [
              popupStyles.vibeBtn,
              { backgroundColor: theme.background, borderColor: theme.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              if (spotifyConnected) {
                onClose();
                router.push('/set-vibe' as any);
              } else {
                connectSpotify().catch(() => {});
              }
            }}
          >
            <View style={[popupStyles.vibeBtnIcon, { backgroundColor: spotifyConnected ? theme.primary + '15' : '#1DB954' + '20' }]}>
              <Feather name="music" size={16} color={spotifyConnected ? theme.primary : '#1DB954'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[popupStyles.vibeBtnTitle, { color: theme.text }]}>
                {spotifyConnected ? (isVibing ? 'Change Song' : 'Pick a Song') : 'Connect Spotify'}
              </Text>
              {isVibing && (
                <Text style={[popupStyles.vibeBtnSub, { color: theme.primary }]} numberOfLines={1}>
                  ♪ {myActivity.song_name}
                </Text>
              )}
            </View>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>

          {/* Save */}
          <Pressable
            style={({ pressed }) => [
              popupStyles.saveBtn,
              { backgroundColor: theme.primary },
              saving && { opacity: 0.5 },
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            <Feather name="check" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={popupStyles.saveBtnText}>{saving ? 'Saving...' : 'Update Status'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const popupStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  currentEmoji: { fontSize: 22 },
  currentLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  clearText: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statusCard: {
    width: (SCREEN_WIDTH - 40 - 10) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  statusEmoji: { fontSize: 28 },
  statusLabel: { fontSize: 13, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  vibeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  vibeBtnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeBtnTitle: { fontSize: 14, fontWeight: '700' },
  vibeBtnSub: { fontSize: 12, marginTop: 1 },
});

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  /** Matches topBarBtn width so circle title stays visually centered. */
  topBarSide: {
    width: 40,
    height: 40,
  },
  circleSelectorWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  circleName: { fontSize: 17, fontWeight: '700' },
  circleSelectorNameBtn: { maxWidth: 180 },
  circleSelectorChevronBtn: { paddingLeft: 2, paddingVertical: 2 },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Accountability Pacts Tracker
  pactsContainer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  pactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  pactsTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  pactCourse: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  pactDesc: {
    fontSize: 13,
  },
  pactActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pactStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pactStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Circle dropdown
  circleDropdown: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 106 : 90,
    left: 20,
    right: 20,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 30,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  circleDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 6,
  },
  circleDropdownText: { fontSize: 15, fontWeight: '600', flex: 1 },
  circleDropdownCount: { fontSize: 13, fontWeight: '500' },

  // Map
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mapPlaceholderText: { fontSize: 15, fontWeight: '500' },
  enableLocationBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  enableLocationBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Map overlay
  mapSongOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  mapSongOverlayPill: {
    position: 'absolute',
    width: 156,
    height: 34,
    borderRadius: 18,
    backgroundColor: 'rgba(5, 18, 38, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  mapSongOverlayPillMe: {
    borderColor: 'rgba(29,185,84,0.7)',
  },
  mapSongOverlayIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  mapSongOverlayTextWrap: {
    flex: 1,
    overflow: 'hidden',
    height: 16,
    justifyContent: 'center',
    position: 'relative',
  },
  mapSongOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  mapSongOverlayMeasure: {
    opacity: 0,
  },
  mapSongOverlayAnimated: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  mapOverlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapOverlayBtnText: { fontSize: 13, fontWeight: '700' },

  // Friend popup
  friendPopup: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.42 + 16,
    left: 16,
    right: 16,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 15,
  },
  friendPopupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  friendPopupName: { fontSize: 16, fontWeight: '700' },
  friendPopupActivity: { fontSize: 13, marginTop: 2 },
  friendPopupReactions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 20 },
  bumpBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginLeft: 'auto',
  },
  bumpBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  viewProfileLink: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // Unified Map Pin
  markerWrapper: {
    width: 240,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  markerInner: {
    alignItems: 'center',
    overflow: 'visible',
  },
  songStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 3,
  },
  songStripIcon: {
    fontSize: 10,
    fontWeight: '700',
  },
  songStripText: {
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 180,
    flexShrink: 1,
  },
  avatarRing: {
    padding: 3,
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },


  pinTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -2,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  reactionBumpBtn: {
    backgroundColor: '#eff6ff', // light blue
    borderColor: '#bfdbfe',
    borderWidth: 1,
    paddingHorizontal: 12,
    flex: undefined,
  },
  reactionBumpText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1d4ed8', // dark blue
  },
  statusCloud: {
    position: 'absolute',
    top: 18,
    left: -14,
    backgroundColor: '#fff',
    borderRadius: 16,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  statusCloudMe: {
    borderColor: '#fff', 
  },
  statusCloudText: {
    fontSize: 16,
  },
  musicBubble: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: [{ translateX: -68 }],
    backgroundColor: '#1DB954',
    borderRadius: 16,
    height: 28,
    width: 136,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  musicBubbleMe: {
    borderColor: '#eff6ff',
  },
  musicBubbleIcon: {
    flexShrink: 0,
  },
  musicBubbleTextWrap: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    height: 16,
    position: 'relative',
  },
  musicBubbleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  musicBubbleMeasure: {
    opacity: 0,
  },
  musicBubbleAnimatedText: {
    position: 'absolute',
    left: 0,
    top: 0,
  },

  // Bottom sheet
  bottomSheet: {
    height: SCREEN_HEIGHT * 0.4,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  bottomSheetHandle: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  bottomSheetTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  bottomSheetTitle: { fontSize: 22, fontWeight: '800' },
  bottomSheetActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabPillText: { fontSize: 13, fontWeight: '600' },
  addFriendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Friends list
  peopleList: { flex: 1 },
  peopleListContent: { paddingHorizontal: 16 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    borderRadius: 12,
  },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { fontSize: 16, fontWeight: '700' },
  personStatus: { fontSize: 13, marginTop: 2 },
  personActivity: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  personRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  personTime: { fontSize: 11, fontWeight: '500' },
  sharedTaskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(99,102,241,0.08)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  sharedTaskBadgeText: { fontSize: 10, fontWeight: '700', color: '#6366f1' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 240 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Self styles
  myAvatarWrap: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2,
  },
});
