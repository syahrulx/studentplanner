import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Alert } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const MUSIC_COLOR = '#FA243C';
const BAR_COUNT = 3;
const BAR_WIDTH = 3;
const BAR_MAX = 18;
const BAR_MIN = 4;

interface NowPlayingCardProps {
  song: string;
  artist: string;
  albumArt?: string;
  trackUrl?: string;
  /** If provided, shows a "Listen on Apple Music" button */
  trackId?: string;
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
        backgroundColor: MUSIC_COLOR,
      }}
    />
  );
}

import { Linking } from 'react-native';

export default function NowPlayingCard({ song, artist, albumArt, trackId, isOwnProfile, T: _T }: NowPlayingCardProps) {
  const fallback = (key: string) => key;
  const T = _T || fallback;

  const handleOpen = () => {
    if (!trackId?.trim()) return;
    const url = `https://music.apple.com/song/${trackId.trim()}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open Apple Music.');
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Feather name="music" size={11} color={MUSIC_COLOR} />
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

      {/* Open in Apple Music button (for friends only) */}
      {trackId && !isOwnProfile && (
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleOpen}
        >
          <Feather
            name="external-link"
            size={14}
            color="#fff"
          />
          <Text style={[styles.addBtnText, { color: '#fff' }]}>
            Listen on Apple Music
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
    borderColor: 'rgba(250,36,60,0.25)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  label: {
    fontSize: 10,
    color: MUSIC_COLOR,
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
    backgroundColor: MUSIC_COLOR,
    borderWidth: 1,
    borderColor: 'rgba(250,36,60,0.8)',
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 13,
    color: MUSIC_COLOR,
  },
});
