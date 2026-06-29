import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

type PdfWebViewProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  loadingColor?: string;
};

/** Native PDF preview backed by react-native-webview. See PdfWebView.web.tsx for the web iframe variant. */
export function PdfWebView({ uri, style, loadingColor }: PdfWebViewProps) {
  return (
    <WebView
      source={{ uri }}
      style={style}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={loadingColor} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
