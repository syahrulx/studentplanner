import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import EventsBoard from '@/components/EventsBoard';
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
  type ViewStyle,
} from 'react-native';
import Mapbox from '@rnmapbox/maps';

// Initialize Mapbox with your public access token from environment variables.
// In production builds (eas build), the token may not be in process.env
// (removed from eas.json for GitHub secret scanning). In that case, the native
// MBXAccessToken in Info.plist (set by app.config.js) is used as the primary source.
const _mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
if (_mapboxToken) {
  console.log('[MAP] Token set via JS, length:', _mapboxToken.length);
  Mapbox.setAccessToken(_mapboxToken);
} else {
  console.log('[MAP] No JS token — using native Info.plist MBXAccessToken');
}

// Mapbox Standard configuration helper
function getMapState(themeId: string) {
  // Map our themes to Mapbox Standard's internal themes
  if (themeId === 'midnight' || themeId === 'dark') return 'night';
  if (themeId === 'blush') return 'dawn';
  return 'day';
}
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { Avatar } from '@/components/Avatar';


import { useTheme } from '@/hooks/useTheme';
import type { ThemePalette } from '@/constants/Themes';
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

// Mapbox components are imported at the top of the file.

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
  isSelected,
  isFaded,
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
  isSelected?: boolean;
  isFaded?: boolean;
}) {
  const theme = useTheme();

  // Don't render invalid coords. Use isFinite (not truthiness) so 0°/equator is valid.
  if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) {
    return null;
  }

  const emoji = getActivityEmoji(activityType);
  const isListeningActivity = activityType === 'listening_music';
  const isActive = activityType && activityType !== 'idle' && !isListeningActivity;
  const songLabel = listeningSongName?.trim() || '';
  const artistLabel = listeningSongArtist?.trim() || '';
  const showSong = !!(isListening && songLabel);
  const showStatus = !!(isActive);

  const songDisplayText = showSong
    ? (artistLabel ? `${songLabel} — ${artistLabel}` : songLabel)
    : '';

  return (
    <Mapbox.MarkerView
      id={id}
      coordinate={[coordinate.longitude, coordinate.latitude]}
      anchor={anchor}
      allowOverlap={true}
      allowOverlapWithPuck={true}
      style={{ zIndex: isSelected ? 999 : isFaded ? 1 : 10 }}
    >
      <Pressable 
        onPress={onPress} 
        style={[
          styles.markerWrapper, 
          isFaded && { opacity: 0.2 },
          isSelected && { transform: [{ scale: 1.12 }] }
        ]} 
        hitSlop={10}
        disabled={isFaded}
      >
        <View style={styles.markerInner}>
          {/* Song strip */}
          {showSong && (
            <View style={[
              styles.songStrip,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
              <Text style={[styles.songStripIcon, { color: theme.primary }]}>♪</Text>
              <Text style={[styles.songStripText, { color: theme.text }]}>
                {songDisplayText}
              </Text>
            </View>
          )}
          {/* Status cloud */}
          {showStatus && (
            <View style={[
              styles.statusCloud, isMe && styles.statusCloudMe,
            ]}>
              <Text style={styles.statusCloudText}>{emoji}</Text>
            </View>
          )}
          {/* Avatar */}
          <View style={styles.avatarRing}>
            <Avatar name={name} avatarUrl={avatarUrl} size={42} />
          </View>
          <View style={styles.pinTriangle} />
        </View>
      </Pressable>
    </Mapbox.MarkerView>
  );
}

// =============================================================================
// MAP — OPEN TRACK IN APPLE MUSIC
// =============================================================================

function MapOpenMusicPill({
  trackId,
  titleMaxWidth = 200,
  pillStyle,
}: {
  trackId: string;
  titleMaxWidth?: number;
  pillStyle?: ViewStyle;
}) {
  const theme = useTheme();

  const handlePress = () => {
    if (!trackId?.trim()) return;
    const cleanId = trackId.trim();
    const url = `https://music.apple.com/song/${cleanId}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open Apple Music.');
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.mapOverlayBtn,
        pillStyle,
        { backgroundColor: '#FA243C' }, // Apple Music Pink
        pressed && { opacity: 0.88 },
      ]}
      onPress={handlePress}
    >
      <Feather name="external-link" size={16} color="#fff" />
      <Text style={[styles.mapOverlayBtnText, { color: '#fff', maxWidth: titleMaxWidth }]} numberOfLines={1}>
        Listen on Apple Music
      </Text>
    </Pressable>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CommunityMap() {
  const theme = useTheme();
  // Using Mapbox Standard style configuration
  const mapboxConfig = React.useMemo(() => ({
    theme: getMapState(theme.id),
    showPointOfInterestLabels: false,
    showPlaceLabels: false,
    showRoadLabels: false,
    showTransitLabels: false,
  }), [theme.id]);
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
    locationVisibility,
    setLocationVisibility,
  } = useCommunity();

  // Valid pin coords (use null checks + isFinite — 0 is a valid lat/lon; `&&` would hide it)
  const hasValidMyCoords =
    myLatitude != null &&
    myLongitude != null &&
    Number.isFinite(myLatitude) &&
    Number.isFinite(myLongitude);
  const mapCenterLng = hasValidMyCoords ? myLongitude : 101.4810;
  const mapCenterLat = hasValidMyCoords ? myLatitude : 3.0651;

  const [communityTab, setCommunityTab] = useState<'map' | 'events'>('map');
  const tabBarHeight = useBottomTabBarHeight();
  const [activeTab, setActiveTab] = useState<'people' | 'places'>('people');
  const [showCircleSelector, setShowCircleSelector] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithStatus | null>(null);
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const cameraRef = useRef<Mapbox.Camera>(null);

  const selectedCircle = circles.find((c) => c.id === selectedCircleId) || null;

  // Request location on mount
  useEffect(() => {
    if (!locationPermissionGranted) {
      requestLocationPermission();
    }
  }, [locationPermissionGranted, requestLocationPermission]);

  // Keep studying status automatically updated as time passes!
  useEffect(() => {
    if (myActivity?.activity_type === 'studying') {
      const currentLabel = getCurrentTimetableSubjectLabel(timetable) || 'Studying';
      // If the label we generated for right NOW is different from what's in the DB,
      // silently push the update to keep it synced for the user & their friends.
      if (myActivity.detail !== currentLabel) {
        updateActivity('studying', currentLabel, currentLabel).catch(() => {});
      }
    }
  }); // runs on every render, which is forced every 30s by useWallClockTick

  const visibleFriends = filteredFriends;

  // Song overlays are now embedded directly inside MarkerView (via the songStrip).

  useFocusEffect(
    useCallback(() => {
      refreshMyActivity().catch(() => {});
      refreshFriends().catch(() => {});
    }, [refreshMyActivity, refreshFriends])
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
    if (hasValidMyCoords && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [myLongitude, myLatitude],
        zoomLevel: 15,
        animationDuration: 500,
      });
    }
  }, [hasValidMyCoords, myLatitude, myLongitude]);

  const handleToggleGhostMode = useCallback(async () => {
    const targetVisibility = locationVisibility === 'off' ? 'friends' : 'off';
    await setLocationVisibility(targetVisibility);
    Alert.alert(
      targetVisibility === 'off' ? 'Ghost Mode Activated 👻' : 'Ghost Mode Deactivated',
      targetVisibility === 'off' ? 'Your location is now hidden from your friends.' : 'Your friends can now see your location.'
    );
  }, [locationVisibility, setLocationVisibility]);

  // =========================================================================

  // RENDER
  // =========================================================================

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ─── COMMUNITY TAB SWITCHER ─── */}
      <View style={[styles.communityTabBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable
          style={[styles.communityTabBtn, communityTab === 'map' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => setCommunityTab('map')}
        >
          <Feather name="map" size={16} color={communityTab === 'map' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.communityTabText, { color: communityTab === 'map' ? theme.primary : theme.textSecondary }]}>Map</Text>
        </Pressable>
        <Pressable
          style={[styles.communityTabBtn, communityTab === 'events' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          onPress={() => setCommunityTab('events')}
        >
          <Feather name="clipboard" size={16} color={communityTab === 'events' ? theme.primary : theme.textSecondary} />
          <Text style={[styles.communityTabText, { color: communityTab === 'events' ? theme.primary : theme.textSecondary }]}>Events</Text>
        </Pressable>
      </View>

      {communityTab === 'events' ? (
        <View style={{ flex: 1 }}>
          <EventsBoard />
          <Pressable
            style={({ pressed }) => [
              styles.eventsFab,
              { backgroundColor: theme.primary, bottom: tabBarHeight + 16 },
              pressed && { opacity: 0.85, transform: [{ scale: 0.92 }] },
            ]}
            onPress={() => router.push('/community/create-post' as any)}
          >
            <Feather name="plus" size={26} color="#fff" />
          </Pressable>
        </View>
      ) : (
      <>
      {/* ─── TOP BAR ─── */}
      <View style={[styles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.topBarSide}>
          <Pressable
            onPress={() => router.push('/community/notifications' as any)}
            style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={22} color={theme.text} />
            {communityBadgeCount > 0 ? (
              <View style={[styles.notifBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.notifBadgeText}>{communityBadgeCount > 9 ? '9+' : String(communityBadgeCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
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
          onPress={() => router.push('/community/settings' as any)}
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
          <Mapbox.MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={true}
            scaleBarEnabled={false}
          >

            <Mapbox.Camera
              ref={cameraRef}
              zoomLevel={15}
              pitch={45}
              heading={0}
              centerCoordinate={[mapCenterLng, mapCenterLat]}
              animationMode="flyTo"
              animationDuration={1500}
            />

            {/* My own pin — hidden in ghost mode; coords stay in state for map center only */}
            {hasValidMyCoords && locationVisibility !== 'off' && (
              <StableMarker
                id="me"
                coordinate={{ latitude: myLatitude as number, longitude: myLongitude as number }}
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
                isFaded={!!selectedFriend}
              />
            )}

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
                  isSelected={selectedFriend?.id === friend.id}
                  isFaded={!!selectedFriend && selectedFriend.id !== friend.id}
                />
              ))}

          </Mapbox.MapView>

        {/* Map overlay buttons */}
        <View style={styles.mapOverlay}>
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

          <Pressable
            style={({ pressed }) => [
              styles.mapOverlayBtn,
              { 
                backgroundColor: locationVisibility === 'off' ? theme.primary : theme.card, 
                width: 44, 
                paddingHorizontal: 0, 
                justifyContent: 'center',
                marginLeft: 8 
              },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleToggleGhostMode}
          >
            <Feather 
              name={locationVisibility === 'off' ? "eye-off" : "eye"} 
              size={20} 
              color={locationVisibility === 'off' ? "#FFF" : theme.primary} 
            />
          </Pressable>
        </View>

      </View>


      {/* ─── SELECTED FRIEND POPUP ─── */}
      {selectedFriend && (() => {
        const friendPacts = (sharedGoals || []).filter(
          (g: SharedGoal) => (g.friend_id === selectedFriend.id || g.user_id === selectedFriend.id) && g.status !== 'rejected'
        );

        const music = selectedFriend.music;
        const showMusic = !!(music?.isPlaying && music.song);
        const albumUri = (music?.albumArt || '').trim();

        return (
          <View style={[styles.friendPopup, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.friendPopupHeader}>
              <Avatar name={selectedFriend.name} avatarUrl={selectedFriend.avatar_url} size={44} />
              <View style={styles.friendPopupIdentity}>
                <Text style={[styles.friendPopupName, { color: theme.text }]} numberOfLines={1}>
                  {selectedFriend.name}
                </Text>
                {selectedFriend.activity?.activity_type !== 'idle' &&
                  selectedFriend.activity?.activity_type !== 'listening_music' && (
                    <Text style={[styles.friendPopupActivity, { color: theme.textSecondary }]} numberOfLines={2}>
                      {getActivityEmoji(selectedFriend.activity?.activity_type)}{' '}
                      {activityStatusDetailLine(selectedFriend.activity, { isSelf: false, timetable })}
                    </Text>
                  )}
                <Pressable
                  onPress={() => {
                    setSelectedFriend(null);
                    router.push({ pathname: '/community/friend-profile', params: { friendId: selectedFriend.id } } as any);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  style={({ pressed }) => [pressed && { opacity: 0.65 }]}
                >
                  <Text style={[styles.friendPopupProfileLink, { color: theme.primary }]}>View full profile</Text>
                </Pressable>
              </View>
              {showMusic ? (
                albumUri ? (
                  <Image source={{ uri: albumUri }} style={styles.friendPopupAlbumArt} />
                ) : (
                  <View style={[styles.friendPopupAlbumPlaceholder, { borderColor: `${theme.primary}55` }]}>
                    <Feather name="music" size={22} color="#1DB954" />
                  </View>
                )
              ) : null}
              <Pressable onPress={() => setSelectedFriend(null)} hitSlop={10} style={styles.friendPopupClose}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {showMusic && (
              <View style={styles.friendVibeCard}>
                <View style={styles.friendVibeLabelRow}>
                  <Feather name="music" size={12} color="#1DB954" />
                  <Text style={styles.friendVibeLabel}>CURRENTLY VIBING TO</Text>
                </View>
                <View style={styles.friendVibeMainRow}>
                  <View style={styles.friendVibeTextCol}>
                    <Text style={styles.friendVibeTitle} numberOfLines={2}>
                      {music!.song}
                    </Text>
                    {!!music!.artist?.trim() && (
                      <Text style={styles.friendVibeArtist} numberOfLines={2}>
                        {music!.artist}
                      </Text>
                    )}
                  </View>
                  <View style={styles.friendVibeBars}>
                    <View style={[styles.friendVibeBar, { height: 9 }]} />
                    <View style={[styles.friendVibeBar, { height: 14 }]} />
                    <View style={[styles.friendVibeBar, { height: 7 }]} />
                  </View>
                </View>
                {music!.trackId ? (
                  <View style={styles.friendVibePlayerWrap}>
                    <MapOpenMusicPill
                      trackId={music!.trackId}
                      titleMaxWidth={220}
                      pillStyle={{ alignSelf: 'stretch', justifyContent: 'center' }}
                    />
                  </View>
                ) : (
                  <Text style={styles.friendVibeNoPreview} numberOfLines={2}>
                    Music track ID unavailable — open their profile to use Add to Library.
                  </Text>
                )}
              </View>
            )}

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

            <View style={styles.friendPopupActions}>
              <Text style={[styles.friendPopupReactionsLabel, { color: theme.textSecondary }]}>Quick reactions</Text>
              <View style={styles.friendPopupReactions}>
                {['👋', '🔥', '💪', '📚', '❤️'].map((emoji) => (
                  <Pressable
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${emoji} reaction`}
                    style={({ pressed }) => [
                      styles.reactionDisc,
                      { backgroundColor: theme.background, borderColor: theme.border },
                      pressed && { opacity: 0.72 },
                    ]}
                    onPress={() => handleQuickReact(selectedFriend.id, emoji)}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send bump"
                  style={({ pressed }) => [
                    styles.reactionDisc,
                    { backgroundColor: theme.background, borderColor: theme.border },
                    pressed && { opacity: 0.72 },
                  ]}
                  onPress={() => handleBump(selectedFriend.id)}
                >
                  <Feather name="zap" size={20} color={theme.primary} />
                </Pressable>
              </View>
            </View>
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
            onPress={() => {
              // Just zoom deeply into own location, don't show the popup
              if (hasValidMyCoords && cameraRef.current) {
                cameraRef.current.setCamera({
                  centerCoordinate: [myLongitude, myLatitude],
                  zoomLevel: 19,
                  animationDuration: 1000,
                });
              }
            }}
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
                  // Only zoom deeply into the friend's location, don't show the popup
                  if (friend.location && cameraRef.current) {
                    cameraRef.current.setCamera({
                      centerCoordinate: [friend.location.longitude, friend.location.latitude],
                      zoomLevel: 19,
                      animationDuration: 1000,
                    });
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
        theme={theme}
      />
      </>
      )}
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
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  myActivity: any;
  timetable: TimetableEntry[];
  updateActivity: (type: ActivityType, detail?: string, courseName?: string) => Promise<void>;
  clearMyActivity: () => Promise<void>;
  refreshMyActivity: () => Promise<void>;
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
              onClose();
              router.push('/set-vibe' as any);
            }}
          >
            <View style={[popupStyles.vibeBtnIcon, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="music" size={16} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[popupStyles.vibeBtnTitle, { color: theme.text }]}>
                {isVibing ? 'Change Song' : 'Pick a Song'}
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

  // Community tab switcher (Map | Events)
  communityTabBar: {
    flexDirection: 'row',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 30,
  },
  communityTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  communityTabText: { fontSize: 15, fontWeight: '700' },
  eventsFab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
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
  friendPopupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  friendPopupIdentity: { flex: 1, minWidth: 0, marginRight: 4 },
  friendPopupName: { fontSize: 16, fontWeight: '700' },
  friendPopupActivity: { fontSize: 13, marginTop: 2 },
  friendPopupAlbumArt: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#111',
  },
  friendPopupAlbumPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(29,185,84,0.12)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendPopupClose: { marginLeft: 2 },
  friendVibeCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(12,14,18,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(29,185,84,0.35)',
  },
  friendVibeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  friendVibeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#1DB954',
  },
  friendVibeMainRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  friendVibeTextCol: { flex: 1, minWidth: 0 },
  friendVibeTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  friendVibeArtist: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 16,
  },
  friendVibeBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18, paddingBottom: 2 },
  friendVibeBar: { width: 4, borderRadius: 2, backgroundColor: '#1DB954' },
  friendVibePlayerWrap: { marginTop: 12, alignSelf: 'stretch', width: '100%' },
  friendVibeNoPreview: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  friendPopupActions: { marginTop: 8 },
  friendPopupProfileLink: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  friendPopupReactionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  friendPopupReactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  reactionDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  reactionEmoji: { fontSize: 22 },

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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 5,
    // Glassmorphism effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
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
    padding: 2,
    backgroundColor: '#fff',
    borderRadius: 24,
    // Deep layered shadow for 3D depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 2,
    borderWidth: 3,
  },


  pinTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -3,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  statusCloud: {
    position: 'absolute',
    top: 15,
    left: -18,
    backgroundColor: '#fff',
    borderRadius: 18,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 7,
    zIndex: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusCloudMe: {
    borderColor: '#fff', 
    backgroundColor: '#fff',
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
