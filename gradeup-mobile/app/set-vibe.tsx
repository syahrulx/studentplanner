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
import { useApp } from '@/src/context/AppContext';
import { useCommunity } from '@/src/context/CommunityContext';
import * as spotifyAuth from '@/src/lib/spotifyAuth';
import type { SpotifyTrack } from '@/src/lib/spotifyAuth';

export default function SetVibeScreen() {
  const theme = useTheme();
  const { refreshMyActivity } = useCommunity();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const vibe = await spotifyAuth.getMyVibe();
      if (vibe) setCurrentVibe({ song: vibe.song, artist: vibe.artist });
    } catch (e: any) {
      console.warn('[SetVibe] loadData error:', e);
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
        setSearchError(e?.message || 'Search failed. Please try again.');
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
      Alert.alert('Could not set vibe', 'Please try again.');
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
      Alert.alert('Could not clear vibe', 'Please try again.');
    }
    setSaving(false);
  };

  const handleBack = () => {
    router.back();
  };

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
      </View>

      {/* ── Current Vibe ── */}
      {currentVibe && searchQuery.length === 0 && (
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

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading...
          </Text>
        </View>
      ) : searching ? (
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
                {searchError || (searchQuery ? 'No results found' : 'Search for any song')}
              </Text>
            </View>
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
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

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

  // States
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
});
