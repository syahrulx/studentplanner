import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';

type CommunityMapPlaceholderProps = {
  style?: StyleProp<ViewStyle>;
  /** Override the body copy (defaults to the dev-build message). */
  message?: string;
};

/**
 * Shown in place of the native Mapbox campus map when the native module isn't
 * available — i.e. on web (no @rnmapbox/maps web build) and in Expo Go.
 */
export function CommunityMapPlaceholder({ style, message }: CommunityMapPlaceholderProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.backgroundSecondary },
        style,
      ]}
    >
      <Feather name="map" size={40} color={theme.textSecondary} />
      <Text style={[styles.title, { color: theme.textSecondary }]}>Map unavailable here</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {message ?? 'The live campus map is available in the Rencana mobile app.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 12, fontSize: 15, fontWeight: '600' },
  body: { marginTop: 4, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});
