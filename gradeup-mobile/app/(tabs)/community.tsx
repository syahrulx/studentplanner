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
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { ACTIVITY_TYPES } from '@/src/lib/communityApi';
import type { FriendWithStatus, Circle } from '@/src/lib/communityApi';

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
// AVATAR COMPONENT
// =============================================================================

function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const colorIdx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[colorIdx],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

// =============================================================================
// MAP PIN COMPONENT
// =============================================================================

// =============================================================================
// MAP PIN COMPONENT
// =============================================================================

function MapPin({ 
  name, 
  avatarUrl, 
  activityType, 
  isMe 
}: { 
  name?: string; 
  avatarUrl?: string; 
  activityType?: string; 
  isMe?: boolean; 
}) {
  const emoji = getActivityEmoji(activityType);
  const isActive = activityType && activityType !== 'idle';

  return (
    <View style={styles.markerWrapper}>
      <View style={styles.markerInner}>
        {isActive && (
          <View style={[styles.statusCloud, isMe && styles.statusCloudMe]}>
            <Text style={styles.statusCloudText}>{emoji}</Text>
          </View>
        )}
        <View style={[styles.avatarRing, isMe && styles.avatarRingMe]}>
          <Avatar name={name} avatarUrl={avatarUrl} size={42} />
        </View>
        <View style={styles.pinTriangle} />
      </View>
    </View>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CommunityMap() {
  const theme = useTheme();
  const { language, user } = useApp();
  const T = useTranslations(language);
  const {
    filteredFriends,
    circles,
    unreadReactionCount,
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
  } = useCommunity();

  const [activeTab, setActiveTab] = useState<'people' | 'places'>('people');
  const [showCircleSelector, setShowCircleSelector] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithStatus | null>(null);
  const mapRef = useRef<any>(null);

  const selectedCircle = circles.find((c) => c.id === selectedCircleId) || null;


  // Request location on mount
  useEffect(() => {
    if (!locationPermissionGranted) {
      requestLocationPermission();
    }
  }, [locationPermissionGranted, requestLocationPermission]);

  const visibleFriends = filteredFriends;

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
        <Pressable
          onPress={() => router.push('/profile-settings' as any)}
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="settings" size={22} color={theme.text} />
        </Pressable>

        <Pressable
          onPress={() => setShowCircleSelector(!showCircleSelector)}
          style={({ pressed }) => [styles.circleSelector, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.circleName, { color: theme.text }]}>
            {selectedCircle?.name || 'All Friends'}
          </Text>
          <Feather name="chevron-down" size={16} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/community/notifications' as any)}
          style={({ pressed }) => [styles.topBarBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="bell" size={22} color={theme.text} />
          {unreadReactionCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadReactionCount > 9 ? '9+' : unreadReactionCount}
              </Text>
            </View>
          )}
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
            showsMyLocationButton
            showsUserLocation
          >

            {/* My own marker */}
            <Marker
              coordinate={{ latitude: myLatitude, longitude: myLongitude }}
              anchor={{ x: 0.5, y: 1 }}
            >
              <MapPin 
                name={user.name} 
                avatarUrl={user.avatar}
                activityType={myActivity?.activity_type} 
                isMe={true} 
              />
            </Marker>

            {/* Friend markers */}
            {visibleFriends
              .filter((f) => f.location)
              .map((friend) => (
                <Marker
                  key={friend.id}
                  coordinate={{
                    latitude: friend.location!.latitude,
                    longitude: friend.location!.longitude,
                  }}
                  onPress={() => setSelectedFriend(friend)}
                >
                  <MapPin 
                    name={friend.name}
                    avatarUrl={friend.avatar_url}
                    activityType={friend.activity?.activity_type}
                  />
                </Marker>
              ))}
          </MapView>
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
          <Pressable
            style={({ pressed }) => [
              styles.mapOverlayBtn,
              { backgroundColor: theme.card },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => router.push('/community/set-status' as any)}
          >
            <Feather name="edit-3" size={16} color={theme.primary} />
            <Text style={[styles.mapOverlayBtnText, { color: theme.primary }]}>Set Status</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.mapOverlayBtn,
              { backgroundColor: theme.card, width: 44, justifyContent: 'center' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleCenterOnMe}
          >
            <Feather name="crosshair" size={18} color={theme.primary} />
          </Pressable>
        </View>

      </View>

      {/* ─── SELECTED FRIEND POPUP ─── */}
      {selectedFriend && (
        <View style={[styles.friendPopup, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.friendPopupHeader}>
            <Avatar name={selectedFriend.name} avatarUrl={selectedFriend.avatar_url} size={36} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.friendPopupName, { color: theme.text }]}>{selectedFriend.name}</Text>
              <Text style={[styles.friendPopupActivity, { color: theme.textSecondary }]}>
                {getActivityEmoji(selectedFriend.activity?.activity_type)}{' '}
                {selectedFriend.activity?.detail || getActivityLabel(selectedFriend.activity?.activity_type)}
              </Text>
            </View>
            <Pressable onPress={() => setSelectedFriend(null)}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
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
                styles.bumpBtn,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => handleBump(selectedFriend.id)}
            >
              <Text style={styles.bumpBtnText}>Bump!</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            onPress={() => {
              setSelectedFriend(null);
              router.push({ pathname: '/community/friend-profile', params: { friendId: selectedFriend.id } } as any);
            }}
          >
            <Text style={[styles.viewProfileLink, { color: theme.primary }]}>View Profile →</Text>
          </Pressable>
        </View>
      )}

      {/* ─── BOTTOM SHEET ─── */}
      <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {/* Tab switcher */}
        <View style={styles.bottomSheetHandle}>
          <View style={[styles.handleBar, { backgroundColor: theme.textSecondary + '40' }]} />
        </View>

        <View style={styles.bottomSheetTabs}>
          <Text style={[styles.bottomSheetTitle, { color: theme.text }]}>People</Text>
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

        {/* People list */}
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
            onPress={() => router.push('/community/set-status' as any)}
          >
            <View style={styles.myAvatarWrap}>
              <Avatar name={user.name} avatarUrl={user.avatar} size={44} />
              <View style={[styles.onlineDot, { borderColor: theme.card }]} />
            </View>
            <View style={styles.personInfo}>
              <Text style={[styles.personName, { color: theme.text }]}>{user.name} <Text style={{ fontWeight: '400', color: theme.textSecondary }}>(You)</Text></Text>
              {myActivity && myActivity.activity_type !== 'idle' ? (
                <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                  {getActivityEmoji(myActivity.activity_type)}{' '}
                  {myActivity.detail || getActivityLabel(myActivity.activity_type)}
                </Text>
              ) : (
                <Text style={[styles.personStatus, { color: theme.textSecondary }]}>Tap to set your status</Text>
              )}
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
                  <Text style={[styles.personName, { color: theme.text }]}>{friend.name}</Text>
                  <Text style={[styles.personStatus, { color: theme.textSecondary }]} numberOfLines={1}>
                    {friend.location?.place_name || (friend.location ? 'Location shared' : 'Location off')}
                  </Text>
                  {friend.activity && friend.activity.activity_type !== 'idle' && (
                    <Text style={[styles.personActivity, { color: theme.primary }]} numberOfLines={1}>
                      {getActivityEmoji(friend.activity.activity_type)}{' '}
                      {friend.activity.detail || getActivityLabel(friend.activity.activity_type)}
                    </Text>
                  )}
                </View>
                <View style={styles.personRight}>
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
    </View>
  );
}

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
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  markerInner: {
    alignItems: 'center',
  },
  avatarRing: {
    padding: 3,
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 2,
  },
  avatarRingMe: {
    shadowColor: '#3b82f6',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
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
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  statusCloud: {
    position: 'absolute',
    top: -10,
    right: -14,
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
    borderColor: '#eff6ff', 
  },
  statusCloudText: {
    fontSize: 16,
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

  // People list
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
  personInfo: { flex: 1 },
  personName: { fontSize: 16, fontWeight: '700' },
  personStatus: { fontSize: 13, marginTop: 2 },
  personActivity: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  personRight: { alignItems: 'flex-end', gap: 6 },
  personTime: { fontSize: 11, fontWeight: '500' },

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
