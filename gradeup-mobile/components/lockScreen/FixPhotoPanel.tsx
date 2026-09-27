import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as MediaLibrary from 'expo-media-library';
import Animated from 'react-native-reanimated';

import type { TranslationKey } from '@/src/i18n';
import { requestLockScreenRender, whenLockScreenTodayReady } from '@/src/lib/lockScreen/lockScreenRenderQueue';
import { lockScreenImageUriFor } from '@/src/lib/lockScreen/lockScreenStore';

import { SETUP_GREEN, SetupNote, SetupSymbol, setupEntering, setupHaptic } from './SetupStepCard';

/**
 * The fix for "iPhone couldn't set the wallpaper" (setup step 2).
 *
 * Set Wallpaper Photo can only replace a plain Photo lock screen, so when the
 * current one is Shuffle, Live, Weather and so on the run fails every time.
 * The student makes a Photo lock screen once, from today's picture, and every
 * later run can replace it. The picture is the JPEG the render host already
 * wrote to the App Group, so nothing is captured again.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'denied' | 'error';

/** Long enough for one capture when today's picture is missing, short enough to still feel like a tap. */
const PICTURE_WAIT_MS = 8000;

async function saveTodaysPicture(todayISO: string): Promise<Exclude<SaveState, 'idle' | 'saving'>> {
  try {
    // Look for the picture before asking for Photos access, so a missing
    // picture never costs the student a permission prompt for nothing.
    let uri = lockScreenImageUriFor(todayISO);
    if (!uri) {
      void requestLockScreenRender({ priority: 'today', reason: 'fix-photo' });
      if (await whenLockScreenTodayReady(PICTURE_WAIT_MS)) uri = lockScreenImageUriFor(todayISO);
    }
    if (!uri) return 'error';
    // Add-only access: all this needs is to put one picture in the library.
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') return 'denied';
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'error';
  }
}

function NumberedStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepDot}>
        <Text style={styles.stepDotText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

export interface FixPhotoPanelProps {
  T: (key: TranslationKey) => string;
  /** Local date (YYYY-MM-DD) of the picture to save. */
  todayISO: string;
  accent: string;
  reduceMotion: boolean;
}

export default function FixPhotoPanel({ T, todayISO, accent, reduceMotion }: FixPhotoPanelProps) {
  const [state, setState] = useState<SaveState>('idle');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = useCallback(async () => {
    setupHaptic('light');
    setState('saving');
    const result = await saveTodaysPicture(todayISO);
    if (!mounted.current) return;
    setState(result);
    setupHaptic(result === 'saved' ? 'success' : 'warn');
  }, [todayISO]);

  const saved = state === 'saved';
  const busy = state === 'saving';

  return (
    <Animated.View entering={setupEntering(reduceMotion)} style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.title}>{T('lsFixPhotoTitle')}</Text>
        <Text style={styles.body}>{T('lsFixPhotoBody')}</Text>
      </View>

      <NumberedStep n={1}>
        <Pressable
          onPress={save}
          disabled={busy || saved}
          accessibilityRole="button"
          accessibilityLabel={saved ? T('lsSaved') : T('lsFix1')}
          accessibilityState={{ disabled: busy || saved, busy }}
          style={({ pressed }) => [
            styles.saveButton,
            saved && styles.saveButtonDone,
            pressed && styles.saveButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : saved ? (
            <SetupSymbol sf="checkmark.circle.fill" feather="check-circle" size={17} color={SETUP_GREEN} />
          ) : (
            <SetupSymbol sf="square.and.arrow.down" feather="download" size={17} color="#FFFFFF" />
          )}
          <Text style={[styles.saveText, saved && { color: SETUP_GREEN }]} numberOfLines={1}>
            {saved ? T('lsSaved') : T('lsFix1')}
          </Text>
        </Pressable>
        {state === 'denied' ? (
          <View style={styles.inlineRow}>
            <Text style={styles.hint}>{T('lsSaveDenied')}</Text>
            <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={6} accessibilityRole="link">
              <Text style={[styles.hintLink, { color: accent }]}>{T('lsOpenSettings')}</Text>
            </Pressable>
          </View>
        ) : null}
        {state === 'error' ? <Text style={styles.hint}>{T('lsSaveError')}</Text> : null}
      </NumberedStep>

      <NumberedStep n={2}>
        <Text style={styles.stepText}>{T('lsFix2')}</Text>
      </NumberedStep>

      <NumberedStep n={3}>
        <Text style={styles.stepText}>{T('lsFix3')}</Text>
      </NumberedStep>

      <SetupNote icon="info">{T('lsFixFocusTip')}</SetupNote>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 12,
  },
  head: {
    gap: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  body: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepBody: {
    flex: 1,
    gap: 8,
  },
  stepText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    paddingTop: 2,
  },
  saveButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  saveButtonDone: {
    backgroundColor: 'rgba(48,209,88,0.14)',
  },
  saveButtonPressed: {
    opacity: 0.7,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
  },
  hint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '600',
  },
  hintLink: {
    fontSize: 13,
    fontWeight: '700',
  },
});
