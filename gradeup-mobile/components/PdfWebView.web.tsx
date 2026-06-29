import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type PdfWebViewProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  loadingColor?: string;
};

/** Web PDF preview using a native browser <iframe> (no react-native-webview on web). */
export function PdfWebView({ uri, style }: PdfWebViewProps) {
  return (
    <View style={[styles.fill, style]}>
      {/* @ts-expect-error react-native-web renders DOM; iframe is valid on web. */}
      <iframe
        src={uri}
        title="PDF preview"
        style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
