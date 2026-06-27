import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';
import { useTheme } from '@/hooks/useTheme';

type MasterDetailProps = {
  /** List / master pane content */
  master: React.ReactNode;
  /** Detail pane content — only shown on tablet when selected */
  detail?: React.ReactNode;
  /** Whether a detail item is selected (tablet only) */
  hasSelection?: boolean;
  /** Placeholder when no selection on tablet */
  detailPlaceholder?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  masterStyle?: StyleProp<ViewStyle>;
  detailStyle?: StyleProp<ViewStyle>;
};

/**
 * On phone: renders only the master pane (detail via route navigation).
 * On tablet: side-by-side master (~360-400px) + detail pane.
 */
export function MasterDetail({
  master,
  detail,
  hasSelection = false,
  detailPlaceholder,
  style,
  masterStyle,
  detailStyle,
}: MasterDetailProps) {
  const theme = useTheme();
  const { twoPane, masterPaneWidth } = useResponsive();

  if (!twoPane) {
    return <View style={[styles.phoneRoot, style]}>{master}</View>;
  }

  return (
    <View style={[styles.tabletRoot, style]}>
      <View style={[styles.masterPane, { width: masterPaneWidth, borderRightColor: theme.border }, masterStyle]}>
        {master}
      </View>
      <View style={[styles.detailPane, detailStyle]}>
        {hasSelection && detail
          ? detail
          : detailPlaceholder ?? (
              <View style={styles.emptyDetail} />
            )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneRoot: {
    flex: 1,
  },
  tabletRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  masterPane: {
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
  },
  emptyDetail: {
    flex: 1,
  },
});
