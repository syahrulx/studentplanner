import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { submitUserReport, type UserReportKind } from '@/src/lib/reportsApi';

const PAD = 20;
const RADIUS = 14;

const KIND_OPTIONS: ReadonlyArray<{
  kind: UserReportKind;
  labelKey:
    | 'reportKindBug'
    | 'reportKindIssue'
    | 'reportKindFaq'
    | 'reportKindAppComplaint'
    | 'reportKindUserComplaint'
    | 'reportKindOther';
  icon: keyof typeof Feather.glyphMap;
  color: string;
}> = [
  { kind: 'bug',            labelKey: 'reportKindBug',            icon: 'alert-triangle', color: '#ef4444' },
  { kind: 'issue',          labelKey: 'reportKindIssue',          icon: 'tool',           color: '#f59e0b' },
  { kind: 'faq',            labelKey: 'reportKindFaq',            icon: 'help-circle',    color: '#3b82f6' },
  { kind: 'app_complaint',  labelKey: 'reportKindAppComplaint',   icon: 'message-square', color: '#8b5cf6' },
  { kind: 'user_complaint', labelKey: 'reportKindUserComplaint',  icon: 'user-x',         color: '#ec4899' },
  { kind: 'other',          labelKey: 'reportKindOther',          icon: 'more-horizontal',color: '#64748b' },
];

export default function ReportIssueScreen() {
  const { language } = useApp();
  const T = useTranslations(language);
  const theme = useTheme();

  const [kind, setKind] = useState<UserReportKind>('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [targetUserHandle, setTargetUserHandle] = useState('');
  const [busy, setBusy] = useState(false);

  const showsTargetField = kind === 'user_complaint';
  const canSubmit = useMemo(
    () => subject.trim().length > 0 && message.trim().length > 0 && !busy,
    [subject, message, busy],
  );

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await submitUserReport({
        kind,
        subject,
        message,
        targetUserHandle: showsTargetField ? targetUserHandle : undefined,
      });
      Alert.alert(T('reportSubmittedTitle'), T('reportSubmittedBody'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(T('error'), msg || T('reportSubmitError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.55 }]}
            hitSlop={10}
          >
            <Feather name="chevron-left" size={26} color={theme.text} />
            <Text style={[styles.backText, { color: theme.text }]}>{T('back')}</Text>
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <Text style={[styles.largeTitle, { color: theme.text }]}>{T('reportIssueTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {T('reportIssueDesc')}
          </Text>
        </View>

        {/* Type selector */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('reportTypeLabel')}
        </Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          {KIND_OPTIONS.map((opt, idx) => {
            const selected = kind === opt.kind;
            return (
              <View key={opt.kind}>
                {idx > 0 ? <View style={styles.dividerList} /> : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && { backgroundColor: theme.backgroundSecondary },
                  ]}
                  onPress={() => setKind(opt.kind)}
                >
                  <View style={[styles.iconBox, { backgroundColor: opt.color }]}>
                    <Feather name={opt.icon} size={16} color="#fff" />
                  </View>
                  <Text style={[styles.menuLabel, { color: theme.text }]}>{T(opt.labelKey)}</Text>
                  {selected ? (
                    <Feather name="check" size={20} color={theme.accent} />
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Optional target user — only for user_complaint */}
        {showsTargetField ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              {T('reportTargetLabel')}
            </Text>
            <View
              style={[
                styles.inputBox,
                { backgroundColor: theme.card, borderColor: theme.border ?? 'rgba(150,150,150,0.2)' },
              ]}
            >
              <TextInput
                value={targetUserHandle}
                onChangeText={setTargetUserHandle}
                placeholder={T('reportTargetPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={200}
                style={[styles.singleLineInput, { color: theme.text }]}
              />
            </View>
          </>
        ) : null}

        {/* Subject */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('reportSubjectLabel')}
        </Text>
        <View
          style={[
            styles.inputBox,
            { backgroundColor: theme.card, borderColor: theme.border ?? 'rgba(150,150,150,0.2)' },
          ]}
        >
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder={T('reportSubjectPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            maxLength={200}
            style={[styles.singleLineInput, { color: theme.text }]}
          />
        </View>

        {/* Message */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {T('reportMessageLabel')}
        </Text>
        <View
          style={[
            styles.inputBox,
            styles.multilineBox,
            { backgroundColor: theme.card, borderColor: theme.border ?? 'rgba(150,150,150,0.2)' },
          ]}
        >
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={T('reportMessagePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            maxLength={4000}
            style={[styles.multilineInput, { color: theme.text }]}
          />
        </View>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          {message.trim().length}/4000
        </Text>

        {/* Submit */}
        <Pressable
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: theme.accent, opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>{T('reportSubmit')}</Text>
          )}
        </Pressable>

        <Text style={[styles.footnote, { color: theme.textSecondary }]}>
          {T('reportFootnote')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: 56 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  backText: { fontSize: 17, fontWeight: '500', marginLeft: -4 },
  titleWrap: { paddingHorizontal: PAD, marginBottom: 8 },
  largeTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, marginTop: 6, lineHeight: 19 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 8,
    marginTop: 24,
    letterSpacing: -0.2,
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
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '400' },
  dividerList: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(150,150,150,0.2)', marginLeft: 52 },
  inputBox: {
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multilineBox: { minHeight: 160 },
  singleLineInput: {
    fontSize: 16,
    paddingVertical: 0,
  },
  multilineInput: {
    fontSize: 16,
    minHeight: 140,
    paddingVertical: 0,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
    marginHorizontal: PAD + 4,
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: 28,
    marginHorizontal: PAD,
    borderRadius: RADIUS,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footnote: {
    fontSize: 12,
    marginTop: 14,
    marginHorizontal: PAD + 4,
    lineHeight: 17,
  },
});
