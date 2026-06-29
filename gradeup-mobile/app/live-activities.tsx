import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import {
  getLiveActivityPrefs,
  setLiveActivityPrefs,
  type LiveActivityKind,
  type LiveActivityMode,
} from '@/src/liveActivityPrefs';
import { endAllLiveActivities } from '@/src/liveActivityManager';

const PAD = 20;
const RADIUS = 14;

type RowDef = {
  mode: LiveActivityMode;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  title: string;
  desc: string;
};

export default function LiveActivitiesSettings() {
  const { language } = useApp();
  const theme = useTheme();
  const themePack = useThemePack();
  const T = useTranslations(language);

  const isMonoTheme = themePack === 'mono';
  const monoIconBg = '#1f1f1f';
  const monoIconFg = '#f5f5f5';
  const themedIconBg = (color: string) => (isMonoTheme ? monoIconBg : color);
  const themedIconFg = (color: string) => (isMonoTheme ? monoIconFg : color);

  const [activeMode, setActiveMode] = useState<LiveActivityMode | undefined>(undefined);

  useEffect(() => {
    getLiveActivityPrefs().then((prefs) => setActiveMode(prefs.activeMode));
  }, []);

  const selectMode = useCallback((mode: LiveActivityMode) => {
    if (Platform.OS !== 'ios' && mode !== null) {
      Alert.alert(
        'Not Supported',
        'Live Activities are an iOS feature and have no effect on Android.'
      );
      return;
    }

    setActiveMode((prev) => {
      if (prev === mode) return prev;
      setLiveActivityPrefs({ activeMode: mode }).catch(() => {});
      endAllLiveActivities().catch(() => {});
      return mode;
    });
  }, []);

  const modeRows: RowDef[] = [
    {
      mode: 'studyTimer',
      icon: 'clock',
      color: '#10b981',
      title: T('liveActivityStudyTimer'),
      desc: T('liveActivityStudyTimerDesc'),
    },
    {
      mode: 'nextClass',
      icon: 'calendar',
      color: '#3b82f6',
      title: T('liveActivityNextClass'),
      desc: T('liveActivityNextClassDesc'),
    },
    {
      mode: 'deadline',
      icon: 'alert-circle',
      color: '#f59e0b',
      title: T('liveActivityDeadline'),
      desc: T('liveActivityDeadlineDesc'),
    },
    {
      mode: 'attendance',
      icon: 'check-square',
      color: '#ef4444',
      title: T('liveActivityAttendance'),
      desc: T('liveActivityAttendanceDesc'),
    },
  ];

  const offRow: RowDef = {
    mode: null,
    icon: 'minus-circle',
    color: '#6b7280',
    title: T('liveActivityOff'),
    desc: T('liveActivityOffDesc'),
  };

  const renderRow = (row: RowDef, selected: boolean, onPress: () => void) => (
    <Pressable
      key={row.mode ?? 'off'}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.75 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.iconBox, { backgroundColor: themedIconBg(row.color) }]}>
        <Feather name={row.icon} size={18} color={themedIconFg('#fff')} />
      </View>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={[styles.menuLabel, { color: theme.text }]}>{row.title}</Text>
        <Text style={[styles.rowFootnote, { color: theme.textSecondary }]} numberOfLines={2}>
          {row.desc}
        </Text>
      </View>
      <View
        style={[
          styles.radioOuter,
          { borderColor: selected ? theme.primary : theme.border },
        ]}
      >
        {selected ? <View style={[styles.radioInner, { backgroundColor: theme.primary }]} /> : null}
      </View>
    </Pressable>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="chevron-left" size={28} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.titleWrap}>
        <Text style={[styles.largeTitle, { color: theme.text }]}>{T('liveActivitiesTitle')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {T('liveActivitiesSubtitle')}
        </Text>
      </View>

      {activeMode !== undefined ? (
        <>
          <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
            {modeRows.map((row, idx) => (
              <View key={row.mode}>
                {idx > 0 ? <View style={styles.dividerList} /> : null}
                {renderRow(row, activeMode === row.mode, () => selectMode(row.mode as LiveActivityKind))}
              </View>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            {T('liveActivityOffSection')}
          </Text>
          <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
            {renderRow(offRow, activeMode === null, () => selectMode(null))}
          </View>

          <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
            {Platform.OS === 'ios'
              ? T('liveActivityRequiresIos')
              : 'Live Activities are an iOS feature and have no effect on Android.'}
          </Text>
        </>
      ) : (
        <View style={[styles.cardGroup, { backgroundColor: theme.card, paddingVertical: 24, alignItems: 'center' }]}>
          <ActivityIndicator color={theme.primary} />
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 56 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  titleWrap: {
    paddingHorizontal: PAD,
    marginBottom: 24,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginHorizontal: PAD + 4,
    marginTop: 20,
    marginBottom: 8,
  },
  cardGroup: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuLabel: { fontSize: 16, fontWeight: '400' },
  rowFootnote: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
    opacity: 0.85,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginHorizontal: PAD + 4,
    marginTop: 14,
    marginBottom: 4,
  },
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
});
