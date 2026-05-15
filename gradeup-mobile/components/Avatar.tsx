import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

// Trigger
export function Avatar({ name, avatarUrl, size = 44 }: { name?: string; avatarUrl?: string; size?: number }) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
  const colorIdx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={200}
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
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '800' }}>
        {(name || '?').toUpperCase().slice(0, 2)}
      </Text>
    </View>
  );
}
