import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Image,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useCommunity } from '@/src/context/CommunityContext';
import * as spotifyAuth from '@/src/lib/spotifyAuth';
import type { SpotifyTrack, SpotifyPlaylist } from '@/src/lib/spotifyAuth';

type Tab = 'recent' | 'playlists';
type ViewMode = 'tabs' | 'playlist-tracks';

export default function SetVibeScreen() {
  const theme = useTheme();
  const { refreshMyActivity } = useCommunity();

  const [tab, setTab] = useState<Tab>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('tabs');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Data
  const [recentTracks, setRecentTracks] = useState<SpotifyTrack[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current vibe
  const [currentVibe, setCurrentVibe] = useState<{ song: string; artist: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, lists, vibe] = await Promise.all([
        spotifyAuth.getRecentlyPlayed(),
        spotifyAuth.getMyPlaylists(),
        spotifyAuth.getMyVibe(),
      ]);
      setRecentTracks(recent);
      setPlaylists(lists);
      if (vibe) setCurrentVibe({ song: vibe.song, artist: vibe.artist });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('token') || msg.includes('refresh') || msg.includes('401')) {
        Alert.alert(
          'Spotify Session Expired',
          'Please disconnect and reconnect Spotify in Settings.',
          [
            { text: 'Go Back', onPress: () => router.back() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Error', 'Could not load your Spotify data.');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Debounced search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchError('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await spotifyAuth.searchTracks(query);
        setSearchResults(results);
        setSearchError('');
      } catch (e: any) {
        console.warn('[SetVibe] search error:', e);
        setSearchResults([]);
        const msg = e?.message || 'Search failed. Please try again.';
        setSearchError(msg);
        Alert.alert('Search Error', msg);
      }
      setSearching(false);
    }, 400);
  }, []);

  const handleSelectTrack = async (track: SpotifyTrack) => {
    setSaving(true);
    try {
      await spotifyAuth.setMyVibe(track);
      await refreshMyActivity();
      setCurrentVibe({ song: track.name, artist: track.artist });
      Alert.alert('Vibe Set! 🎵', `${track.name} — ${track.artist}`);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to set vibe.');
    }
    setSaving(false);
  };

  const handleClearVibe = async () => {
    setSaving(true);
    try {
      await spotifyAuth.clearMyVibe();
      await refreshMyActivity();
      setCurrentVibe(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to clear vibe.');
    }
    setSaving(false);
  };

  const openPlaylist = async (playlist: SpotifyPlaylist) => {
    setSelectedPlaylistName(playlist.name);
    setViewMode('playlist-tracks');
    setLoading(true);
    try {
      const tracks = await spotifyAuth.getPlaylistTracks(playlist.id);
      setPlaylistTracks(tracks);
    } catch (e) {
      console.warn('[SetVibe] openPlaylist error:', e);
    }
    setLoading(false);
  };

  const handleBack = () => {
    if (isSearchActive) {
      setIsSearchActive(false);
      setSearchQuery('');
      setSearchResults([]);
    } else if (viewMode === 'playlist-tracks') {
      setViewMode('tabs');
      setPlaylistTracks([]);
    } else {
      router.back();
    }
  };

  // ---- Renderers ----

  const renderTrack = ({ item }: { item: SpotifyTrack }) => (
    <Pressable
      style={({ pressed }) => [
        styles.trackRow,
        { backgroundColor: pressed ? theme.primary + '08' : 'transparent' },
      ]}
      onPress={() => handleSelectTrack(item)}
      disabled={saving}
    >
      {item.albumArt ? (
        <Image source={{ uri: item.albumArt }} style={styles.trackArt} />
      ) : (
        <View style={[styles.trackArt, styles.trackArtPlaceholder, { backgroundColor: theme.card }]}>
          <Feather name="music" size={18} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={[styles.trackName, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.trackArtist, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.artist}
        </Text>
      </View>
      <View style={[styles.selectBtn, { backgroundColor: theme.primary + '12' }]}>
        <Feather name="plus" size={16} color={theme.primary} />
      </View>
    </Pressable>
  );

  const renderPlaylist = ({ item }: { item: SpotifyPlaylist }) => (
    <Pressable
      style={({ pressed }) => [
        styles.trackRow,
        { backgroundColor: pressed ? theme.primary + '08' : 'transparent' },
      ]}
      onPress={() => openPlaylist(item)}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.playlistArt} />
      ) : (
        <View style={[styles.playlistArt, styles.trackArtPlaceholder, { backgroundColor: theme.card }]}>
          <Feather name="list" size={18} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.trackInfo}>
        <Text style={[styles.trackName, { color: theme.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.trackArtist, { color: theme.textSecondary }]}>
          {item.trackCount} tracks
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
    </Pressable>
  );

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'recent', icon: 'clock', label: 'Recent' },
    { key: 'playlists', icon: 'list', label: 'Playlists' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={theme.text} />
        </Pressable>

        {isSearchActive ? (
          <View style={[styles.headerSearchBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Feather name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search songs, artists..."
              placeholderTextColor={theme.textSecondary + '80'}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Feather name="x-circle" size={16} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {viewMode === 'playlist-tracks' ? selectedPlaylistName : 'Pick a Song 🎵'}
              </Text>
              {viewMode !== 'playlist-tracks' && (
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Choose what you're vibing to
                </Text>
              )}
            </View>
            {viewMode !== 'playlist-tracks' && (
              <Pressable 
                onPress={() => setIsSearchActive(true)}
                style={({ pressed }) => [
                  styles.headerSearchBtn,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  pressed && { opacity: 0.7 }
                ]}
              >
                <Feather name="search" size={20} color={theme.text} />
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* ── Current Vibe ── */}
      {currentVibe && viewMode === 'tabs' && !isSearchActive && (
        <View style={[styles.vibeBanner, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
          <View style={[styles.vibeIconWrap, { backgroundColor: theme.primary + '20' }]}>
            <Feather name="music" size={16} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.vibeLabel, { color: theme.textSecondary }]}>Now Vibing</Text>
            <Text style={[styles.vibeSong, { color: theme.text }]} numberOfLines={1}>
              {currentVibe.song}
            </Text>
            <Text style={[styles.vibeArtist, { color: theme.textSecondary }]} numberOfLines={1}>
              {currentVibe.artist}
            </Text>
          </View>
          <Pressable
            onPress={handleClearVibe}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="x" size={14} color="#ef4444" />
          </Pressable>
        </View>
      )}

      {/* ── Tabs ── */}
      {viewMode === 'tabs' && !isSearchActive && (
        <View style={[styles.tabRow, { borderColor: theme.border }]}>
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[
                  styles.tab,
                  isActive && [styles.tabActive, { backgroundColor: theme.primary + '12', borderColor: theme.primary }],
                ]}
                onPress={() => setTab(t.key)}
              >
                <Feather
                  name={t.icon as any}
                  size={15}
                  color={isActive ? theme.primary : theme.textSecondary}
                />
                <Text style={[styles.tabText, { color: isActive ? theme.primary : theme.textSecondary }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading...
          </Text>
        </View>
      ) : viewMode === 'playlist-tracks' ? (
        <FlatList
          data={playlistTracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No tracks in this playlist</Text>
          }
        />
      ) : isSearchActive ? (
        searching ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Searching...</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderTrack}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Feather name={searchError ? 'alert-circle' : 'search'} size={40} color={theme.textSecondary + '40'} />
                <Text style={[styles.emptyText, { color: searchError ? '#ef4444' : theme.textSecondary }]}>
                  {searchError || (searchQuery ? 'No results found' : 'Search for any song on Spotify')}
                </Text>
              </View>
            }
          />
        )
      ) : tab === 'recent' ? (
        <FlatList
          data={recentTracks}
          keyExtractor={(item) => item.id}
          renderItem={renderTrack}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No recently played tracks</Text>
          }
        />
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          renderItem={renderPlaylist}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No playlists found</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    marginBottom: 16,
    gap: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerSearchBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },

  // Current vibe banner
  vibeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  vibeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  vibeSong: { fontSize: 14, fontWeight: '700', marginTop: 1 },
  vibeArtist: { fontSize: 12, marginTop: 1 },
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {},
  tabText: { fontSize: 13, fontWeight: '600' },

  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  // Lists
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginBottom: 2,
    gap: 12,
  },
  trackArt: { width: 50, height: 50, borderRadius: 10 },
  trackArtPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  trackInfo: { flex: 1, minWidth: 0 },
  trackName: { fontSize: 15, fontWeight: '600' },
  trackArtist: { fontSize: 13, marginTop: 2 },
  selectBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  playlistArt: { width: 52, height: 52, borderRadius: 10 },

  // States
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
});
