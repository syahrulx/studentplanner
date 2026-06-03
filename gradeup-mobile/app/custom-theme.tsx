import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { buildCustomTheme, type ThemePalette } from '@/constants/Themes';
import { LinearGradient } from 'expo-linear-gradient';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc',
  '#ffffff', '#000000',
];

export default function CustomThemeScreen() {
  const theme = useTheme();
  const { user, customThemeColors, setCustomThemeColors, setThemePack, themePack, theme: baseThemeId } = useApp();
  
  const isPro = user?.subscriptionPlan === 'pro';

  // Default to user's existing custom colors or defaults based on dark/light
  const isDark = baseThemeId === 'dark' || baseThemeId === 'midnight';
  const defaultColors = customThemeColors ?? {
    primary: '#3b82f6',
    card: isDark ? '#1e293b' : '#ffffff',
    background: isDark ? '#0f172a' : '#f8fafc',
  };

  const [primary, setPrimary] = useState(defaultColors.primary);
  const [card, setCard] = useState(defaultColors.card);
  const [background, setBackground] = useState(defaultColors.background);
  const [text, setText] = useState(defaultColors.text ?? (isDark ? '#f1f5f9' : '#0f172a'));
  const [textSecondary, setTextSecondary] = useState(defaultColors.textSecondary ?? (isDark ? '#94a3b8' : '#64748b'));
  const [textInverse, setTextInverse] = useState(defaultColors.textInverse ?? (isDark ? '#0f172a' : '#ffffff'));
  const [border, setBorder] = useState(defaultColors.border ?? (isDark ? '#334155' : '#e2e8f0'));
  const [focusCard, setFocusCard] = useState(defaultColors.focusCard ?? (isDark ? '#1e3a5f' : '#eff6ff'));
  const [focusCardText, setFocusCardText] = useState(defaultColors.focusCardText ?? (isDark ? '#e0f2fe' : '#1e3a8a'));
  
  type PickerTab = 'primary' | 'card' | 'bg' | 'text' | 'subtext' | 'inverse' | 'border' | 'pulse' | 'pulse text';
  const [activePicker, setActivePicker] = useState<PickerTab>('primary');

  // Preview Theme
  const previewTheme: ThemePalette = buildCustomTheme({ primary, card, background, text, textSecondary, textInverse, border, focusCard, focusCardText }, baseThemeId);

  const handleSave = () => {
    if (!isPro) {
      Alert.alert('Pro Feature', 'Custom App Themes are available on the Pro plan.');
      return;
    }
    setCustomThemeColors({ primary, card, background, text, textSecondary, textInverse, border, focusCard, focusCardText });
    setThemePack('custom');
    router.back();
  };

  const handleReset = () => {
    setPrimary('#3b82f6');
    setCard(isDark ? '#1e293b' : '#ffffff');
    setBackground(isDark ? '#0f172a' : '#f8fafc');
    setText(isDark ? '#f1f5f9' : '#0f172a');
    setTextSecondary(isDark ? '#94a3b8' : '#64748b');
    setTextInverse(isDark ? '#0f172a' : '#ffffff');
    setBorder(isDark ? '#334155' : '#e2e8f0');
    setFocusCard(isDark ? '#1e3a5f' : '#eff6ff');
    setFocusCardText(isDark ? '#e0f2fe' : '#1e3a8a');
  };

  const activeColor = 
    activePicker === 'primary' ? primary : 
    activePicker === 'card' ? card : 
    activePicker === 'bg' ? background :
    activePicker === 'text' ? text :
    activePicker === 'subtext' ? textSecondary :
    activePicker === 'inverse' ? textInverse : 
    activePicker === 'border' ? border :
    activePicker === 'pulse' ? focusCard : focusCardText;

  const setActiveColor = (c: string) => {
    if (activePicker === 'primary') setPrimary(c);
    if (activePicker === 'card') setCard(c);
    if (activePicker === 'bg') setBackground(c);
    if (activePicker === 'text') setText(c);
    if (activePicker === 'subtext') setTextSecondary(c);
    if (activePicker === 'inverse') setTextInverse(c);
    if (activePicker === 'border') setBorder(c);
    if (activePicker === 'pulse') setFocusCard(c);
    if (activePicker === 'pulse text') setFocusCardText(c);
  };

  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Feather name="chevron-left" size={28} color={theme.text} />
          </Pressable>
        </View>
        <View style={styles.proLock}>
          <Feather name="lock" size={48} color={theme.primary} />
          <Text style={[styles.proLockTitle, { color: theme.text }]}>Pro Feature</Text>
          <Text style={[styles.proLockDesc, { color: theme.textSecondary }]}>Custom app themes are only available for Pro users.</Text>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.primary, marginTop: 24, paddingHorizontal: 32 }]}
            onPress={() => router.push('/subscription-plans')}
          >
            <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>View Plans</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Custom Theme</Text>
        <Pressable onPress={handleReset} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
          <Feather name="rotate-ccw" size={22} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>Build your aesthetic</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Choose your colors below. The app will automatically adjust contrast and borders.</Text>
        
        {/* Live Preview */}
        <View style={[styles.previewWrap, { backgroundColor: previewTheme.background, borderColor: previewTheme.border, padding: 0 }]}>
          
          {/* Fake Dashboard Header */}
          <View style={[styles.previewHeader, { backgroundColor: previewTheme.primary }]}>
            <LinearGradient
              colors={[previewTheme.accent2, previewTheme.primary, previewTheme.secondary]}
              locations={[0, 0.55, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            
            {/* Fake Pulse Card */}
            <View style={[styles.previewPulseCard, { backgroundColor: previewTheme.focusCard, borderColor: previewTheme.border }]}>
              <Text style={[styles.previewPulseWeek, { color: previewTheme.focusCardText }]}>WEEK 8</Text>
              <Text style={[styles.previewPulseLabel, { color: previewTheme.focusCardText, opacity: 0.85 }]}>SEMESTER PULSE</Text>
              <View style={[styles.previewPulseBadge, { backgroundColor: previewTheme.primary }]}>
                <Text style={[styles.previewPulseBadgeText, { color: previewTheme.textInverse }]}>W9 PEAK</Text>
              </View>
              <View style={styles.previewPulseDots}>
                <View style={[styles.previewPulseDot, { backgroundColor: previewTheme.border }]} />
                <View style={[styles.previewPulseDot, { backgroundColor: previewTheme.border }]} />
                <View style={[styles.previewPulseDot, { backgroundColor: previewTheme.focusCardText }]} />
                <View style={[styles.previewPulseDot, { backgroundColor: previewTheme.border }]} />
              </View>
            </View>
          </View>
          
          <View style={{ padding: 16 }}>
            <Text style={[styles.previewSectionTitle, { color: previewTheme.primary }]}>Today's focus</Text>
            
            <View style={[styles.previewCard, { backgroundColor: previewTheme.card, borderColor: previewTheme.cardBorder, marginTop: 12 }]}>
              <View style={styles.previewCardTop}>
                <View style={[styles.previewIconWrap, { backgroundColor: previewTheme.primary + '20' }]}>
                  <Feather name="check-square" size={16} color={previewTheme.primary} />
                </View>
                <Text style={[styles.previewCardTitle, { color: previewTheme.text }]}>Example Task</Text>
              </View>
              <Text style={[styles.previewCardDesc, { color: previewTheme.textSecondary }]}>Due tomorrow at 11:59 PM</Text>
              <View style={[styles.previewBadge, { backgroundColor: previewTheme.primary }]}>
                <Text style={[styles.previewBadgeText, { color: previewTheme.textInverse }]}>Done</Text>
              </View>
            </View>
          </View>
          
          {/* Fake Tab Bar */}
          <View style={[styles.previewTabBar, { backgroundColor: previewTheme.card, borderTopColor: previewTheme.border }]}>
            <Feather name="home" size={20} color={previewTheme.tabIconDefault} />
            <Feather name="calendar" size={20} color={previewTheme.tabIconDefault} />
            <View style={[styles.previewAddBtn, { backgroundColor: previewTheme.primary }]}>
              <Feather name="plus" size={16} color={previewTheme.textInverse} />
            </View>
            <Feather name="message-square" size={20} color={previewTheme.tabIconDefault} />
            <Feather name="user" size={20} color={previewTheme.tabIconSelected} />
          </View>
        </View>

        {/* Pickers */}
        <View style={styles.sections}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
            {(['primary', 'card', 'bg', 'text', 'subtext', 'inverse', 'border', 'pulse', 'pulse text'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActivePicker(tab)}
                style={[
                  styles.tabBtn,
                  { backgroundColor: activePicker === tab ? theme.card : 'transparent' },
                  activePicker === tab && { borderColor: theme.border, borderWidth: 1 }
                ]}
              >
                <Text style={[styles.tabBtnText, { color: activePicker === tab ? theme.text : theme.textSecondary }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.colorPickerWrap}>
            <View style={styles.hexRow}>
              <Text style={[styles.hexLabel, { color: theme.textSecondary }]}>HEX code</Text>
              <TextInput
                style={[styles.hexInput, { color: theme.text, backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                value={activeColor}
                onChangeText={setActiveColor}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            
            <View style={styles.swatches}>
              {PRESET_COLORS.map(c => (
                <Pressable
                  key={c}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    activeColor.toLowerCase() === c.toLowerCase() && { borderWidth: 2, borderColor: theme.text }
                  ]}
                  onPress={() => setActiveColor(c)}
                />
              ))}
            </View>
          </View>
        </View>

      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.bottomSafe, { backgroundColor: theme.background }]}>
        <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
          <LinearGradient
            colors={[theme.primary, theme.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.saveBtn}
          >
            <Text style={[styles.saveBtnText, { color: theme.textInverse }]}>Apply Theme</Text>
          </LinearGradient>
        </Pressable>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 8 },
  iconBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  subtitle: { marginTop: 8, fontSize: 15, fontWeight: '500', lineHeight: 22 },
  
  previewWrap: {
    marginTop: 24,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 280,
    justifyContent: 'space-between',
  },
  previewHeader: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  previewPulseCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    marginTop: 10,
  },
  previewPulseWeek: { fontSize: 16, fontWeight: '800' },
  previewPulseLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  previewPulseBadge: { position: 'absolute', top: 14, right: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  previewPulseBadgeText: { fontSize: 9, fontWeight: '800' },
  previewPulseDots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  previewPulseDot: { width: 6, height: 6, borderRadius: 3 },
  
  previewSectionTitle: { fontSize: 16, fontWeight: '800' },
  
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  previewCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  previewCardTitle: { fontSize: 15, fontWeight: '700' },
  previewCardDesc: { fontSize: 12, marginTop: 8, marginLeft: 40 },
  previewBadge: { alignSelf: 'flex-start', marginLeft: 40, marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  previewBadgeText: { fontSize: 10, fontWeight: '700' },
  
  previewTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginHorizontal: -16,
  },
  previewAddBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  
  sections: { marginTop: 32 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderRadius: 10 },
  tabBtnText: { fontSize: 14, fontWeight: '700' },
  
  colorPickerWrap: { marginTop: 8 },
  hexRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  hexLabel: { fontSize: 14, fontWeight: '600' },
  hexInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontWeight: '600', width: 120, textAlign: 'center' },
  
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 36, height: 36, borderRadius: 18 },

  bottomSafe: { paddingHorizontal: 20, paddingTop: 12 },
  saveBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '800' },

  proLock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  proLockTitle: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  proLockDesc: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
});
