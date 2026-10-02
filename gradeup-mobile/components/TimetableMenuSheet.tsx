import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SegmentedControl from '@/components/SegmentedControl';
import type { ThemePalette } from '@/constants/Themes';
import type { TranslationKey } from '@/src/i18n';
import { contrastText } from '@/src/lib/contrast';
import type { TimetablePdfOrientation } from '@/src/lib/timetablePdf';
import type { TimetableSlotDetailsVisibility } from '@/src/storage';

/**
 * The Timetable tab's ⋮ menu, as a bottom sheet in iOS's inset-grouped style
 * (the Settings app look): one kind of container throughout, a coloured icon
 * tile per row, choices as segmented controls inside their row, and the reset
 * alone at the bottom where it can't be hit by accident.
 *
 * It replaced a long dropdown that mixed places, the view choice, card toggles
 * and the reset, and ran off the screen. Campus Map is not here because the
 * header already has its pin; the old wallpaper download became Export to PDF.
 */

type Translate = (key: TranslationKey) => string;
type ViewMode = 'week' | 'list';
type FeatherName = keyof typeof Feather.glyphMap;

export interface TimetableMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemePalette;
  T: Translate;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  slotDetails: TimetableSlotDetailsVisibility;
  onSlotDetailsChange: (patch: Partial<TimetableSlotDetailsVisibility>) => void;
  /** Shows the NEW badge on the Lock screen row. */
  lockScreenIsNew: boolean;
  onEditClasses: () => void;
  onLockScreen: () => void;
  /** Last orientation used; the Page control starts on it. */
  pdfOrientation: TimetablePdfOrientation;
  onExportPdf: (orientation: TimetablePdfOrientation) => void;
  /** Opens the save-as-picture sheet. Separate from the PDF: a PNG is what a
   *  student sets as a wallpaper, a PDF is what they print or send. */
  onSaveImage: () => void;
  /**
   * Fired once the sheet's Modal has actually unmounted.
   *
   * iOS drops a request to present a modal while another is still dismissing,
   * so a caller that opens its own modal from a row here has to wait for this
   * rather than act on the same tick as onClose.
   */
  onClosed?: () => void;
  /** While the PDF is being made the row shows a spinner and ignores taps. */
  exportingPdf: boolean;
  onReset: () => void;
}

/** iOS system colours for the icon tiles; they read on light and dark sheets alike. */
const TILE = {
  blue: '#007AFF',
  purple: '#AF52DE',
  indigo: '#5856D6',
  orange: '#FF9500',
  red: '#FF3B30',
  green: '#34C759',
  teal: '#30B0C7',
  gray: '#8E8E93',
} as const;

const SHEET_SPRING = { damping: 22, stiffness: 180, mass: 0.9, useNativeDriver: true } as const;
const ROW_PAD_X = 14;
const TILE_SIZE = 29;
const TILE_GAP = 12;

function selectionHaptic() {
  Haptics.selectionAsync().catch(() => {});
}

/** A dark surface needs the dark segmented control, a light one the light control. */
function isDarkSurface(color: string): boolean {
  return contrastText(color) === '#ffffff';
}

export default function TimetableMenuSheet(props: TimetableMenuSheetProps) {
  const { visible, onClose, onClosed, theme, T } = props;
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();

  // Stay mounted through the closing slide, then let the Modal go.
  const [mounted, setMounted] = useState(visible);
  const slide = useRef(new Animated.Value(0)).current;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slide, { ...SHEET_SPRING, toValue: 1 }).start();
    } else if (mounted) {
      Animated.timing(slide, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setMounted(false);
        onClosedRef.current?.();
      });
    }
  }, [visible, mounted, slide]);

  if (!mounted) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [winH * 0.6, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={T('lsClose')} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, maxHeight: winH * 0.92, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {T('timetableMenuTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              style={({ pressed }) => [styles.headerSide, styles.doneBtn, pressed && styles.pressed]}
            >
              <Text style={[styles.doneText, { color: theme.primary }]}>{T('lsFullClose')}</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
          >
            <SheetContent {...props} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SheetContent({
  theme,
  T,
  viewMode,
  onViewModeChange,
  slotDetails,
  onSlotDetailsChange,
  lockScreenIsNew,
  onEditClasses,
  onLockScreen,
  pdfOrientation,
  onExportPdf,
  onSaveImage,
  exportingPdf,
  onReset,
}: TimetableMenuSheetProps) {
  const [orientation, setOrientation] = useState<TimetablePdfOrientation>(pdfOrientation);
  const segmentVariant = isDarkSurface(theme.card) ? 'dark' : 'light';
  // A near-white accent (Mono, Spider) would put the white thumb on a white track.
  const trackOn = isDarkSurface(theme.primary) ? theme.primary : TILE.gray;

  const toggles: {
    key: keyof TimetableSlotDetailsVisibility;
    icon: FeatherName;
    tile: string;
    label: TranslationKey;
    sub?: TranslationKey;
  }[] = [
    { key: 'courseName', icon: 'book-open', tile: TILE.orange, label: 'timetableMenuCourseName' },
    { key: 'room', icon: 'map-pin', tile: TILE.red, label: 'timetableMenuRoom' },
    { key: 'lecturer', icon: 'user', tile: TILE.green, label: 'timetableMenuLecturer' },
    { key: 'group', icon: 'users', tile: TILE.teal, label: 'timetableMenuGroup' },
    { key: 'use12HourTime', icon: 'clock', tile: TILE.blue, label: 'timetableMenu12Hour', sub: 'timetableMenu12HourSub' },
    // The only switch that turns on seven scrolling columns; course names no
    // longer do, so it is offered whatever else is on.
    {
      key: 'scrollAllDaysInCompact',
      icon: 'columns',
      tile: TILE.indigo,
      label: 'timetableMenuAllDays',
      sub: 'timetableMenuAllDaysSub',
    },
  ];

  return (
    <>
      <Group theme={theme}>
        <Row theme={theme} icon="edit-3" tile={TILE.blue} label={T('timetableEditClasses')} onPress={onEditClasses} chevron />
        <Row
          theme={theme}
          icon="lock"
          tile={TILE.purple}
          label={T('lsTitle')}
          onPress={onLockScreen}
          chevron
          divider
          badge={lockScreenIsNew ? T('lsNewBadge') : undefined}
        />
      </Group>

      <SectionHeader theme={theme}>{T('timetableMenuView')}</SectionHeader>
      <Group theme={theme}>
        <Row theme={theme} icon="layout" tile={TILE.indigo} label={T('timetableMenuLayout')}>
          <SegmentedControl
            options={[
              { value: 'week', label: T('timetableMenuGrid') },
              { value: 'list', label: T('timetableMenuList') },
            ]}
            value={viewMode}
            onChange={onViewModeChange}
            variant={segmentVariant}
            style={styles.segment}
          />
        </Row>
      </Group>

      <SectionHeader theme={theme}>{T('timetableMenuShowOnCards')}</SectionHeader>
      <Group theme={theme}>
        {toggles.map((row, i) => (
          <Row
            key={row.key}
            theme={theme}
            icon={row.icon}
            tile={row.tile}
            label={T(row.label)}
            sub={row.sub ? T(row.sub) : undefined}
            divider={i > 0}
          >
            <Switch
              value={slotDetails[row.key]}
              onValueChange={(value) => {
                selectionHaptic();
                onSlotDetailsChange({ [row.key]: value });
              }}
              trackColor={{ false: theme.border, true: trackOn }}
              ios_backgroundColor={theme.border}
              accessibilityLabel={T(row.label)}
            />
          </Row>
        ))}
      </Group>

      <SectionHeader theme={theme}>{T('timetableMenuShare')}</SectionHeader>
      <Group theme={theme}>
        <Row theme={theme} icon="file" tile={TILE.gray} label={T('timetableMenuPage')}>
          <SegmentedControl
            options={[
              { value: 'portrait', label: T('timetablePdfPortrait') },
              { value: 'landscape', label: T('timetablePdfLandscape') },
            ]}
            value={orientation}
            onChange={setOrientation}
            variant={segmentVariant}
            style={styles.segmentWide}
          />
        </Row>
        <Row
          theme={theme}
          icon="image"
          tile={TILE.purple}
          label={T('timetableSaveImageTitle')}
          sub={T('timetableSaveImageSub')}
          onPress={onSaveImage}
          divider
        >
          <Feather name="download" size={18} color={theme.textSecondary} />
        </Row>
        <Row
          theme={theme}
          icon="file-text"
          tile={TILE.blue}
          label={T('timetableMenuExportPdf')}
          sub={T(orientation === 'portrait' ? 'timetablePdfPortraitSub' : 'timetablePdfLandscapeSub')}
          onPress={exportingPdf ? undefined : () => onExportPdf(orientation)}
          divider
          busy={exportingPdf}
        >
          {exportingPdf ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Feather name="share" size={18} color={theme.textSecondary} />
          )}
        </Row>
      </Group>

      <Group theme={theme} style={styles.resetGroup}>
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          style={({ pressed }) => [styles.resetRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
        >
          <Text style={[styles.resetText, { color: theme.danger }]}>{T('timetableMenuReset')}</Text>
        </Pressable>
      </Group>
    </>
  );
}

function SectionHeader({ theme, children }: { theme: ThemePalette; children: string }) {
  return <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{children.toUpperCase()}</Text>;
}

function Group({
  theme,
  children,
  style,
}: {
  theme: ThemePalette;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.cardBorder }, style]}>
      {children}
    </View>
  );
}

function Row({
  theme,
  icon,
  tile,
  label,
  sub,
  badge,
  chevron,
  divider,
  busy,
  onPress,
  children,
}: {
  theme: ThemePalette;
  icon: FeatherName;
  tile: string;
  label: string;
  sub?: string;
  badge?: string;
  chevron?: boolean;
  divider?: boolean;
  busy?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {divider ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
      <View style={[styles.tile, { backgroundColor: tile }]}>
        <Feather name={icon} size={16} color="#FFFFFF" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.text }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <Text style={[styles.badgeText, { color: contrastText(theme.primary) }]}>{badge}</Text>
        </View>
      ) : null}
      {children}
      {chevron ? <Feather name="chevron-right" size={18} color={theme.textSecondary} style={styles.chevron} /> : null}
    </>
  );

  if (!onPress && !busy) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy }}
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSecondary }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.32)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 2.5, marginTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 16 },
  headerSide: { width: 64 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  doneBtn: { alignItems: 'flex-end' },
  doneText: { fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  sectionHeader: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 22,
    marginBottom: 7,
    marginLeft: ROW_PAD_X,
  },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: ROW_PAD_X, paddingVertical: 8 },
  divider: {
    position: 'absolute',
    top: 0,
    left: ROW_PAD_X + TILE_SIZE + TILE_GAP,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 7.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: TILE_GAP,
  },
  rowText: { flex: 1, paddingRight: 10 },
  rowLabel: { fontSize: 16, fontWeight: '500', letterSpacing: -0.2 },
  rowSub: { fontSize: 12.5, fontWeight: '400', marginTop: 1 },
  chevron: { marginLeft: 6, marginRight: -4 },
  badge: { height: 18, paddingHorizontal: 7, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  segment: { width: 148 },
  segmentWide: { width: 188 },

  resetGroup: { marginTop: 26 },
  resetRow: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
