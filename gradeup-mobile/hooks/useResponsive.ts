import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

const TABLET_MIN = 700;
const LARGE_TABLET_MIN = 1024;
const DESKTOP_MIN = 1024;

export type ResponsiveLayout = {
  width: number;
  height: number;
  isTablet: boolean;
  isLargeTablet: boolean;
  /** Wide web viewport: render a left sidebar instead of the bottom tab pill. */
  isDesktop: boolean;
  contentMaxWidth: number;
  gutter: number;
  columns: number;
  twoPane: boolean;
  masterPaneWidth: number;
  fontScale: number;
  spacingScale: number;
};

export function useResponsive(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= TABLET_MIN;
    const isLargeTablet = width >= LARGE_TABLET_MIN;
    // Desktop chrome (sidebar) is a web-only concept; native tablets keep the pill.
    const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN;

    const contentMaxWidth = isLargeTablet ? 820 : isTablet ? 720 : 600;
    const gutter = isLargeTablet ? 28 : isTablet ? 24 : 16;
    const columns = isLargeTablet ? 3 : isTablet ? 2 : 1;
    const masterPaneWidth = isLargeTablet ? 400 : 360;
    const fontScale = isTablet ? 1.05 : 1;
    const spacingScale = isTablet ? 1.15 : 1;

    return {
      width,
      height,
      isTablet,
      isLargeTablet,
      isDesktop,
      contentMaxWidth,
      gutter,
      columns,
      twoPane: isTablet,
      masterPaneWidth,
      fontScale,
      spacingScale,
    };
  }, [width, height]);
}
