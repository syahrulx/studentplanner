import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenContainer } from '@/components/ScreenContainer';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { getFirstSuccess } from '@/src/lib/smartCapture/smartCaptureSetupState';

/**
 * Setup and education for the two Smart Capture automations.
 *
 * The Back Tap card walks through installing a shortcut that runs
 * `Take Screenshot → Rencana: Plan from screenshot` (the App Intent declared in
 * modules/smart-capture/ios-app-target/SmartCaptureIntents.swift) and then
 * binding it to Back Tap in Accessibility settings. iOS gives apps no way to
 * create the shortcut or set Back Tap programmatically, so the flow is guided
 * rather than automatic.
 */

/**
 * iCloud link to the published "Plan from screenshot" shortcut.
 *
 * To recreate it: Shortcuts → new shortcut → add "Take Screenshot" → add
 * Rencana's "Plan from screenshot" action and pass the screenshot into it →
 * name it "Plan from screenshot" → Share → Copy iCloud Link.
 *
 * Until it is published, the button falls back to opening the Shortcuts app so
 * the user can build it manually from the steps shown on screen.
 */
const SMART_CAPTURE_SHORTCUT_URL = '';
const SHORTCUTS_APP_URL = 'shortcuts://';

export default function SmartAutomations() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const isIos = Platform.OS === 'ios';

  const [backTapWorking, setBackTapWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    void getFirstSuccess().then((success) => {
      if (alive) setBackTapWorking(success?.source === 'back_tap');
    });
    return () => {
      alive = false;
    };
  }, []);

  const openShortcut = useCallback(() => {
    const url = SMART_CAPTURE_SHORTCUT_URL || SHORTCUTS_APP_URL;
    Linking.openURL(url).catch(() => {});
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={26} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
        </Pressable>
      </View>

      <LinearGradient
        colors={[theme.primary, theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroIcon}>
          <Feather name="zap" size={22} color={theme.textInverse} />
        </View>
        <Text style={[styles.heroTitle, { color: theme.textInverse }]}>{T('smartAutomations')}</Text>
        <Text style={[styles.heroSub, { color: theme.textInverse }]}>
          {T('smartAutomationsSub')}
        </Text>
      </LinearGradient>

      <Card theme={theme}>
        <CardHeader theme={theme} icon="share-2" title={T('saShareTitle')} body={T('saShareBody')} />
        <Step theme={theme} index={1} label={T('saShareStep1')} />
        <Step theme={theme} index={2} label={T('saShareStep2')} />
        <Step theme={theme} index={3} label={T('saShareStep3')} last />
      </Card>

      {isIos ? (
        <Card theme={theme}>
          <CardHeader
            theme={theme}
            icon="smartphone"
            title={T('saBackTapTitle')}
            body={T('saBackTapBody')}
          />

          <Step theme={theme} index={1} label={T('saBackTapStep1')} sub={T('saBackTapStep1Sub')}>
            <ActionButton theme={theme} label={T('saAddShortcut')} onPress={openShortcut} />
          </Step>

          <Step theme={theme} index={2} label={T('saBackTapStep2')} sub={T('saBackTapStep2Sub')}>
            <ActionButton theme={theme} label={T('saOpenSettings')} onPress={openSettings} />
          </Step>

          <Step theme={theme} index={3} label={T('saBackTapStep3')} last>
            <View style={styles.statusRow}>
              <Feather
                name={backTapWorking ? 'check-circle' : 'clock'}
                size={15}
                color={backTapWorking ? theme.success : theme.textSecondary}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: backTapWorking ? theme.success : theme.textSecondary },
                ]}
              >
                {backTapWorking ? T('saDone') : T('saWaitingFirst')}
              </Text>
            </View>
          </Step>
        </Card>
      ) : (
        <Card theme={theme}>
          <CardHeader
            theme={theme}
            icon="crop"
            title={T('scFromScreenshot')}
            body={T('saAndroidHint')}
          />
        </Card>
      )}
    </ScreenContainer>
  );
}

type ThemeShape = ReturnType<typeof useTheme>;

function Card({ theme, children }: { theme: ThemeShape; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      {children}
    </View>
  );
}

function CardHeader({
  theme,
  icon,
  title,
  body,
}: {
  theme: ThemeShape;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.cardIcon, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name={icon} size={18} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{body}</Text>
      </View>
    </View>
  );
}

function Step({
  theme,
  index,
  label,
  sub,
  last,
  children,
}: {
  theme: ThemeShape;
  index: number;
  label: string;
  sub?: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepGutter}>
        <View style={[styles.stepDot, { backgroundColor: theme.primary }]}>
          <Text style={[styles.stepDotText, { color: theme.textInverse }]}>{index}</Text>
        </View>
        {last ? null : <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
      </View>
      <View style={[styles.stepBody, last && { paddingBottom: 4 }]}>
        <Text style={[styles.stepLabel, { color: theme.text }]}>{label}</Text>
        {sub ? <Text style={[styles.stepSub, { color: theme.textSecondary }]}>{sub}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function ActionButton({
  theme,
  label,
  onPress,
}: {
  theme: ThemeShape;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.actionBtnText, { color: theme.primary }]}>{label}</Text>
      <Feather name="arrow-up-right" size={14} color={theme.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 16, fontWeight: '600', marginLeft: -4 },

  hero: { borderRadius: 26, padding: 22, gap: 6 },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { fontSize: 13, fontWeight: '600', opacity: 0.86, lineHeight: 19 },

  card: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 4 },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  cardBody: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginTop: 3 },

  step: { flexDirection: 'row', gap: 12 },
  stepGutter: { alignItems: 'center', width: 24 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { fontSize: 12, fontWeight: '900' },
  stepLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  stepBody: { flex: 1, paddingBottom: 18, gap: 4 },
  stepLabel: { fontSize: 14, fontWeight: '800' },
  stepSub: { fontSize: 12.5, fontWeight: '500', lineHeight: 18 },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '800' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  statusText: { fontSize: 13, fontWeight: '700' },
});
