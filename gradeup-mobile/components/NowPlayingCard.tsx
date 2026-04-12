import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Alert } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const SPOTIFY_GREEN = '#1DB954';
const BAR_COUNT = 3;
const BAR_WIDTH = 3;
const BAR_MAX = 18;
const BAR_MIN = 4;

interface NowPlayingCardProps {
  song: string;
  artist: string;
  albumArt?: string;
  trackUrl?: string;
  /** If provided, shows an "Add to Library" heart button */
  onAddToLibrary?: () => Promise<{ ok: boolean; message?: string }>;
  /** If true, shows as the user's own vibe (no add button) */
  isOwnProfile?: boolean;
  /** Optional translation function; falls back to English. */
  T?: (key: string) => string;
}

function EqBar({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(BAR_MIN)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: BAR_MAX,
          duration: 300 + Math.random() * 200,
          useNativeDriver: false,
          delay,
        }),
        Animated.timing(anim, {
          toValue: BAR_MIN,
          duration: 300 + Math.random() * 200,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={{
        width: BAR_WIDTH,
        height: anim,
        backgroundColor: SPOTIFY_GREEN,
        borderRadius: 1.5,
      }}
    />
  );
}

export default function NowPlayingCard({ song, artist, albumArt, onAddToLibrary, isOwnProfile, T: _T }: NowPlayingCardProps) {
  const fallback = (key: string) => key;
  const T = _T || fallback;
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!onAddToLibrary || added || adding) return;
    setAdding(true);
    try {
      const result = await onAddToLibrary();
      if (result.ok) {
        setAdded(true);
        Alert.alert(T('nowPlayingAddedTitle'), T('nowPlayingAddedBody').replace('{song}', song));
      } else {
        Alert.alert(T('nowPlayingSaveFailTitle'), result.message || T('nowPlayingSaveFailBody'));
      }
    } catch (e) {
      Alert.alert(T('nowPlayingErrorTitle'), e instanceof Error ? e.message : T('nowPlayingSaveFailBody'));
    }
    setAdding(false);
  };

  return (
    <View style={styles.card}>
      {/* Header label */}
      <View style={styles.labelRow}>
        <Feather name="music" size={11} color={SPOTIFY_GREEN} />
        <Text style={styles.label}>
          {isOwnProfile ? T('nowPlayingYourVibe') : T('nowPlayingFriendVibe')}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.row}>
        {albumArt ? (
          <Image source={{ uri: albumArt }} style={styles.art} />
        ) : (
          <View style={[styles.art, styles.artPlaceholder]}>
            <Feather name="disc" size={22} color="#fff" />
          </View>
        )}

        <View style={styles.textWrap}>
          <Text style={styles.songName} numberOfLines={1}>
            {song}
          </Text>
          <Text style={styles.artistName} numberOfLines={1}>
            {artist}
          </Text>
        </View>

        {/* Animated equalizer */}
        <View style={styles.eqWrap}>
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <EqBar key={i} delay={i * 120} />
          ))}
        </View>
      </View>

      {/* Add to Library button (for friends only) */}
      {onAddToLibrary && !isOwnProfile && (
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            added && styles.addBtnDone,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleAdd}
          disabled={added || adding}
        >
          <Feather
            name={added ? 'check' : 'heart'}
            size={14}
            color={added ? '#10b981' : SPOTIFY_GREEN}
          />
          <Text style={[styles.addBtnText, added && { color: '#10b981' }]}>
            {adding ? T('nowPlayingAddBtnAdding') : added ? T('nowPlayingAddBtnSaved') : T('nowPlayingAddBtn')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0d1117',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(29,185,84,0.25)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: SPOTIFY_GREEN,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  art: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  artPlaceholder: {
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  songName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  artistName: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  eqWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: BAR_MAX,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(29,185,84,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29,185,84,0.3)',
  },
  addBtnDone: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: SPOTIFY_GREEN,
  },
});
