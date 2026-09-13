import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@expo/vector-icons/Feather';

import { useApp } from '@/src/context/AppContext';
import { useTheme, useThemePack } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { invokeDeleteAccount } from '@/src/lib/invokeDeleteAccount';
import { cancelAllTaskNotifications } from '@/src/notificationManager';
import { cancelAllAttendanceNotifications } from '@/src/attendanceNotifications';
import { cancelAllRevisionNotifications } from '@/src/revisionNotifications';
import {
  openPrivacyPolicy,
  openTermsOfUse,
  openCommunityGuidelines,
} from '@/src/constants/legal';

const PAD = 20;
const RADIUS = 14;

const CLEAR_DATA_PHRASE = 'delete data';
const DELETE_ACCOUNT_PHRASE = 'delete my account';

// Keep in sync with app/(auth)/profile-setup.tsx and app/(tabs)/_layout.tsx.
const PROFILE_SETUP_SKIPPED_KEY_PREFIX = 'profile_setup_skipped_v1:';

async function clearAllProfileSetupSkipFlags(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter((k) => k.startsWith(PROFILE_SETUP_SKIPPED_KEY_PREFIX));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    /* non-fatal */
  }
}

export default function AccountLegal() {
  const { language, clearSemesterData } = useApp();
  const theme = useTheme();
  const themePack = useThemePack();
  const isMonoTheme = themePack === 'mono';
  const monoIconBg = '#1f1f1f';
  const monoIconFg = '#f5f5f5';
  const themedIconBg = (color: string) => (isMonoTheme ? monoIconBg : color);
  const themedIconFg = (color: string) => (isMonoTheme ? monoIconFg : color);
  const T = useTranslations(language);

  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataPhrase, setClearDataPhrase] = useState('');
  const [clearDataBusy, setClearDataBusy] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteAccountPhrase, setDeleteAccountPhrase] = useState('');
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

  const handleLogout = () => {
    Alert.alert(T('logOutConfirmTitle'), T('logOutConfirmBody'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('logOut'),
        onPress: () => {
          void (async () => {
            try {
              const { disconnectClassroom } = await import('@/src/lib/googleClassroom');
              await disconnectClassroom().catch(() => {});
            } catch {}
            await cancelAllTaskNotifications().catch(() => {});
            await cancelAllRevisionNotifications().catch(() => {});
            await cancelAllAttendanceNotifications().catch(() => {});
            await clearAllProfileSetupSkipFlags();
            await supabase.auth.signOut();
            router.replace('/(auth)/login' as any);
          })();
        },
      },
    ]);
  };

  const openDeleteAccountStep1 = () => {
    Alert.alert(T('deleteAccountStep1Title'), T('deleteAccountStep1Body'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('continue'),
        style: 'destructive',
        onPress: () => {
          setDeleteAccountPhrase('');
          setDeleteAccountModalOpen(true);
        },
      },
    ]);
  };

  const openDeleteAccountAfterPhrase = () => {
    const typed = deleteAccountPhrase.trim().toLowerCase();
    if (typed !== DELETE_ACCOUNT_PHRASE) return;
    setDeleteAccountModalOpen(false);
    setTimeout(() => {
      Alert.alert(T('deleteAccountStep2Title'), T('deleteAccountStep2Body'), [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('deleteAccountDelete'),
          style: 'destructive',
          onPress: () => {
            void runDeleteAccount();
          },
        },
      ]);
    }, 320);
  };

  const runDeleteAccount = async () => {
    setDeleteAccountBusy(true);
    try {
      const result = await invokeDeleteAccount();
      if (result.ok) {
        try {
          const { disconnectClassroom } = await import('@/src/lib/googleClassroom');
          await disconnectClassroom().catch(() => {});
        } catch {}
        await cancelAllTaskNotifications().catch(() => {});
        await cancelAllRevisionNotifications().catch(() => {});
        await cancelAllAttendanceNotifications().catch(() => {});
        await clearAllProfileSetupSkipFlags();
        await supabase.auth.signOut().catch(() => {});
        router.replace('/(auth)/login' as any);
        return;
      }
      Alert.alert(T('error'), result.message || T('deleteAccountError'));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : T('deleteAccountError'));
    } finally {
      setDeleteAccountBusy(false);
      setDeleteAccountPhrase('');
    }
  };

  const openClearDataStep1 = () => {
    Alert.alert(T('clearDataStep1Title'), T('clearDataStep1Body'), [
      { text: T('cancel'), style: 'cancel' },
      {
        text: T('continue'),
        style: 'destructive',
        onPress: () => {
          setClearDataPhrase('');
          setClearDataModalOpen(true);
        },
      },
    ]);
  };

  const openClearDataStep3 = () => {
    const typed = clearDataPhrase.trim().toLowerCase();
    if (typed !== CLEAR_DATA_PHRASE) return;
    setClearDataModalOpen(false);
    setTimeout(() => {
      Alert.alert(T('clearDataStep3Title'), T('clearDataStep3Body'), [
        { text: T('cancel'), style: 'cancel' },
        {
          text: T('clearDataDeleteAll'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setClearDataBusy(true);
              try {
                await clearSemesterData();
                setClearDataPhrase('');
                Alert.alert(T('clearData'), T('clearDataSuccess'));
              } catch (e) {
                Alert.alert(T('error'), e instanceof Error ? e.message : T('clearDataError'));
              } finally {
                setClearDataBusy(false);
              }
            })();
          },
        },
      ]);
    }, 320);
  };

  return (
    <>
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
            <Text style={[styles.backText, { color: theme.primary }]}>Settings</Text>
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <Text style={[styles.largeTitle, { color: theme.text }]}>{T('accountLegalSection')}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>LEGAL</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => void openPrivacyPolicy()}
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy"
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#0ea5e9') }]}>
              <Feather name="shield" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Privacy Policy</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                How Rencana collects, uses, and protects your data
              </Text>
            </View>
            <Feather name="external-link" size={18} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={openTermsOfUse}
            accessibilityRole="button"
            accessibilityLabel="Open Terms of Use"
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#64748b') }]}>
              <Feather name="file-text" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Terms of Use (EULA)</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                The agreement you accept to use Rencana
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={openCommunityGuidelines}
            accessibilityRole="button"
            accessibilityLabel="Open Community Guidelines"
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#8b5cf6') }]}>
              <Feather name="users" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Community Guidelines</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Rules for reactions, shared tasks, and study circles
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.backgroundSecondary }]}
            onPress={handleLogout}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#64748b') }]}>
              <Feather name="log-out" size={18} color={themedIconFg('#fff')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: theme.text }]}>{T('logOut')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('logOutDesc')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>DANGER ZONE</Text>
        <View style={[styles.cardGroup, { backgroundColor: theme.card }]}>
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { backgroundColor: 'rgba(254, 226, 226, 0.6)' },
              clearDataBusy && { opacity: 0.6 },
            ]}
            onPress={openClearDataStep1}
            disabled={clearDataBusy}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#fecaca') }]}>
              <Feather name="trash-2" size={18} color={themedIconFg('#dc2626')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: '#b91c1c', fontWeight: '700' }]}>{T('clearData')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('clearDataDesc')}</Text>
            </View>
            {clearDataBusy ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
          </Pressable>
          <View style={styles.dividerList} />
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { backgroundColor: 'rgba(254, 226, 226, 0.6)' },
              deleteAccountBusy && { opacity: 0.6 },
            ]}
            onPress={openDeleteAccountStep1}
            disabled={deleteAccountBusy}
          >
            <View style={[styles.iconBox, { backgroundColor: themedIconBg('#fecaca') }]}>
              <Feather name="user-x" size={18} color={themedIconFg('#b91c1c')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: '#b91c1c', fontWeight: '700' }]}>{T('deleteAccount')}</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{T('deleteAccountDesc')}</Text>
            </View>
            {deleteAccountBusy ? <ActivityIndicator size="small" color="#b91c1c" /> : null}
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={clearDataModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !clearDataBusy && setClearDataModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.syncBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !clearDataBusy && setClearDataModalOpen(false)}
          />
          <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.syncTitle, { color: '#b91c1c' }]}>{T('clearDataStep2Title')}</Text>
            <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('clearDataStep2Body')}</Text>
            <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>
              {T('clearDataPhraseHint')}
            </Text>
            <TextInput
              value={clearDataPhrase}
              onChangeText={setClearDataPhrase}
              placeholder={CLEAR_DATA_PHRASE}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!clearDataBusy}
              style={[
                styles.syncInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
            <View style={styles.syncActions}>
              <Pressable
                style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
                onPress={() => !clearDataBusy && setClearDataModalOpen(false)}
                disabled={clearDataBusy}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.syncBtnPrimary,
                  {
                    backgroundColor:
                      clearDataPhrase.trim().toLowerCase() === CLEAR_DATA_PHRASE ? '#b91c1c' : theme.border,
                  },
                ]}
                onPress={openClearDataStep3}
                disabled={clearDataBusy || clearDataPhrase.trim().toLowerCase() !== CLEAR_DATA_PHRASE}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{T('continue')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={deleteAccountModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.syncBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
          />
          <View style={[styles.syncSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.syncTitle, { color: '#b91c1c' }]}>{T('deleteAccountModalTitle')}</Text>
            <Text style={[styles.syncDesc, { color: theme.textSecondary }]}>{T('deleteAccountModalBody')}</Text>
            <Text style={[styles.syncFieldLabel, { color: theme.text, marginTop: 14 }]}>
              {T('deleteAccountPhraseHint')}
            </Text>
            <TextInput
              value={deleteAccountPhrase}
              onChangeText={setDeleteAccountPhrase}
              placeholder={DELETE_ACCOUNT_PHRASE}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleteAccountBusy}
              style={[
                styles.syncInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
            />
            <View style={styles.syncActions}>
              <Pressable
                style={[styles.syncBtnSecondary, { borderColor: theme.border }]}
                onPress={() => !deleteAccountBusy && setDeleteAccountModalOpen(false)}
                disabled={deleteAccountBusy}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>{T('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.syncBtnPrimary,
                  {
                    backgroundColor:
                      deleteAccountPhrase.trim().toLowerCase() === DELETE_ACCOUNT_PHRASE
                        ? '#b91c1c'
                        : theme.border,
                  },
                ]}
                onPress={openDeleteAccountAfterPhrase}
                disabled={
                  deleteAccountBusy || deleteAccountPhrase.trim().toLowerCase() !== DELETE_ACCOUNT_PHRASE
                }
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{T('continue')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 52, paddingBottom: 40 },
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
    marginBottom: 4,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: PAD,
    marginBottom: 6,
    marginTop: 16,
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
    paddingVertical: 10,
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
  syncBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  syncSheet: {
    borderRadius: RADIUS,
    padding: 20,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  syncTitle: { fontSize: 18, fontWeight: '800' },
  syncDesc: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  syncFieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  syncInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  syncActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  syncBtnSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  syncBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
});
