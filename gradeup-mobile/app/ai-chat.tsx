import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/src/context/AppContext';
import { useTranslations } from '@/src/i18n';
import { useTheme } from '@/hooks/useTheme';
import { enqueueCapture } from '@/src/lib/smartCapture/captureInboxStore';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';

function hexLuminance(hex: string): number | null {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return null;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return null;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  if (raw.length !== 6) return hex;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Muted label on `theme.primary`: uses inverse text color so light gold → dark subtitle, dark blue → light subtitle */
function onPrimaryMuted(inverseHex: string, primaryHex: string): string {
  const L = hexLuminance(primaryHex);
  const a = L != null && L > 0.5 ? 0.62 : 0.78;
  return hexToRgba(inverseHex, a);
}

function onPrimaryChipBg(inverseHex: string): string {
  return hexToRgba(inverseHex, 0.14);
}

export default function AiChat() {
  const { language } = useApp();
  const theme = useTheme();
  const T = useTranslations(language);
  const headerSubColor = useMemo(
    () => onPrimaryMuted(theme.textInverse, theme.primary),
    [theme.textInverse, theme.primary],
  );
  const headerIconBg = useMemo(() => onPrimaryChipBg(theme.textInverse), [theme.textInverse]);

  const scrollRef = useRef<ScrollView>(null);
  const [chatInput, setChatInput] = useState('');
  const [isPicking, setIsPicking] = useState(false);

  // Both entry points hand off to the Smart Capture sheet, which owns
  // extraction, review and undo for every capture source.
  const handleSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    enqueueCapture({ source: 'paste', text });
    router.replace('/smart-capture' as never);
  };

  const handlePickScreenshot = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      if (!(await ensureImageLibraryAccessForPicker())) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsMultipleSelection: false,
      });
      const uri = result.canceled ? null : result.assets?.[0]?.uri;
      if (!uri) return;
      enqueueCapture({ source: 'picker', imageUri: uri });
      router.replace('/smart-capture' as never);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />
      <KeyboardAvoidingView
        style={[s.sheetContainer, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.header, { backgroundColor: theme.primary }]}>
          <View style={s.headerLeft}>
            <Pressable onPress={() => router.back()} style={s.backBtn}>
              <Feather name="arrow-down" size={24} color={theme.textInverse} />
            </Pressable>
            <View style={[s.headerIcon, { backgroundColor: headerIconBg }]}>
              <Feather name="clipboard" size={18} color={theme.textInverse} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: theme.textInverse }]}>{T('smartCapture')}</Text>
              <Text style={[s.headerSub, { color: headerSubColor }]}>
                {T('smartCaptureSub').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={[s.messagesList, { backgroundColor: theme.background }]}
          contentContainerStyle={s.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[s.bubble, s.bubbleAi, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.bubbleText, { color: theme.text }]}>{T('aiPlannerIntro')}</Text>
          </View>

          <Pressable
            onPress={handlePickScreenshot}
            disabled={isPicking}
            style={({ pressed }) => [
              s.scanRow,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed || isPicking ? 0.7 : 1,
              },
            ]}
          >
            <View style={[s.scanIcon, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="image" size={18} color={theme.primary} />
            </View>
            <Text style={[s.scanLabel, { color: theme.text }]}>{T('scScanScreenshot')}</Text>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/smart-automations' as never)}
            style={({ pressed }) => [s.automationsLink, pressed && { opacity: 0.6 }]}
          >
            <Feather name="zap" size={13} color={theme.primary} />
            <Text style={[s.automationsLinkText, { color: theme.primary }]}>
              {T('smartAutomations')}
            </Text>
          </Pressable>
        </ScrollView>

        <View style={[s.inputRow, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
          <TextInput
            style={[s.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
            value={chatInput}
            onChangeText={setChatInput}
            placeholder={T('aiPlannerPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            style={[s.sendBtn, { backgroundColor: theme.primary }, !chatInput.trim() && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={!chatInput.trim()}
          >
            <Feather name="search" size={18} color={theme.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: { 
    height: '70%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { marginRight: 4 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  headerSub: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  
  messagesList: { flex: 1 },
  messagesContent: { padding: 20, paddingBottom: 40, gap: 12 },
  bubbleWrap: { alignItems: 'flex-start' },
  bubbleRight: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 20 },
  bubbleAi: { borderWidth: 1, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  scanIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scanLabel: { flex: 1, fontSize: 14, fontWeight: '800' },
  automationsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 6 },
  automationsLinkText: { fontSize: 12, fontWeight: '800' },

  inputRow: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    gap: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '500',
    borderWidth: 1,
    maxHeight: 100,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
