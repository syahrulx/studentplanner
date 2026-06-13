import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Image, Platform,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useTranslations } from '@/src/i18n';
import { supabase } from '@/src/lib/supabase';
import { ensureImageLibraryAccessForPicker } from '@/src/lib/imageLibraryPickerGate';
import * as roomsApi from '@/src/lib/campusRoomsApi';
import type { ExtractedRoom } from '@/src/lib/campusRoomsApi';

const MAX_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 1000;

type PickedFile = { uri: string; name: string; mimeType: string };
type EditableRoom = ExtractedRoom & { _key: string };

let keyCounter = 0;
const nextKey = () => `r${keyCounter++}`;

/** A real faculty name never contains '@'. Treat email-like or empty values as
 *  "no faculty" so rooms aren't mis-tagged (some profiles have an email here). */
function sanitizeFaculty(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.includes('@')) return null;
  return v;
}

export default function CampusMapUploadScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, language } = useApp();
  const T = useTranslations(language);
  const params = useLocalSearchParams<{ prefillCode?: string }>();

  const userCampus: string | null = ((user as any)?.campus ?? '').trim() || null;
  const userFaculty: string | null = sanitizeFaculty((user as any)?.faculty);

  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<EditableRoom[] | null>(
    typeof params.prefillCode === 'string' && params.prefillCode.trim()
      ? [{ _key: nextKey(), room_code: params.prefillCode.trim(), room_label: '', building: '', level: '', description: '' }]
      : null,
  );

  // Faculty registry (per campus). User picks one from the dropdown or adds a new one.
  const [faculties, setFaculties] = useState<string[]>([]);
  const [faculty, setFaculty] = useState<string | null>(userFaculty);
  const [facultyModal, setFacultyModal] = useState(false);
  const [newFaculty, setNewFaculty] = useState('');
  const [addingFaculty, setAddingFaculty] = useState(false);
  const newFacultyRef = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    roomsApi
      .fetchCampusFaculties(userCampus)
      .then((list) => {
        if (!active) return;
        setFaculties(list);
        // Default to the user's profile faculty if it's a known option.
        setFaculty((cur) => cur ?? (userFaculty && list.includes(userFaculty) ? userFaculty : null));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userCampus, userFaculty]);

  const handleAddFaculty = useCallback(async () => {
    const name = newFaculty.trim();
    if (!name) return;
    setAddingFaculty(true);
    try {
      const saved = await roomsApi.addCampusFaculty(name, userCampus);
      setFaculties((prev) => (prev.includes(saved) ? prev : [...prev, saved].sort((a, b) => a.localeCompare(b))));
      setFaculty(saved);
      setNewFaculty('');
      setFacultyModal(false);
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || 'Could not add faculty.');
    } finally {
      setAddingFaculty(false);
    }
  }, [newFaculty, userCampus, T]);

  const requireFaculty = useCallback((): boolean => {
    if (faculty?.trim()) return true;
    Alert.alert(T('error'), T('campusMapFacultyRequired'));
    setFacultyModal(true);
    return false;
  }, [faculty, T]);

  const pickPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setPicked({ uri: file.uri, name: file.name ?? 'directory.pdf', mimeType: file.mimeType ?? 'application/pdf' });
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick PDF.');
    }
  }, [T]);

  const pickImage = useCallback(async () => {
    try {
      const ok = await ensureImageLibraryAccessForPicker();
      if (!ok) {
        Alert.alert(T('error'), T('campusMapPhotoAccess'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
      if (result.canceled) return;
      const asset = result.assets[0];
      setPicked({ uri: asset.uri, name: asset.fileName ?? 'directory.jpg', mimeType: asset.mimeType ?? 'image/jpeg' });
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Could not pick image.');
    }
  }, [T]);

  const runExtract = useCallback(async () => {
    if (!picked || busy) return;
    if (!requireFaculty()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      Alert.alert(T('signInRequired'), T('campusMapAuthRequired'));
      return;
    }
    await supabase.auth.refreshSession();
    setBusy(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.uri, { encoding: 'base64' });
      if (!b64 || b64.length > MAX_BASE64_CHARS) {
        Alert.alert(T('error'), T('campusMapFileTooLarge'));
        return;
      }
      const { rooms, error } = await roomsApi.extractRoomsFromFile({
        file_base64: b64,
        mime_type: picked.mimeType,
      });
      if (error) {
        if (error.code === 'ROOMMAP_EXTRACT_LIMIT') {
          Alert.alert(T('campusMapExtractLimitTitle'), error.message);
        } else if (error.code !== 'MONTHLY_TOKEN_LIMIT') {
          // Monthly-limit alert is surfaced inside the API helper.
          Alert.alert(T('error'), `${error.message}${error.code ? ` (${error.code})` : ''}`);
        }
        return;
      }
      if (rooms.length === 0) {
        Alert.alert(T('error'), T('campusMapZeroRooms'));
        return;
      }
      setRows(rooms.map((r) => ({ ...r, _key: nextKey() })));
    } catch (e) {
      Alert.alert(T('error'), e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setBusy(false);
    }
  }, [picked, busy, faculty, T, requireFaculty]);

  const updateRow = (key: string, field: keyof ExtractedRoom, value: string) => {
    setRows((prev) => prev?.map((r) => (r._key === key ? { ...r, [field]: value } : r)) ?? null);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev?.filter((r) => r._key !== key) ?? null);
  };

  const addBlankRow = () => {
    setRows((prev) => [...(prev ?? []), { _key: nextKey(), room_code: '', room_label: '', building: '', level: '', description: '' }]);
  };

  const startManualAdd = useCallback(() => {
    if (!requireFaculty()) return;
    addBlankRow();
  }, [requireFaculty]);

  const saveRooms = useCallback(async () => {
    if (!rows || busy) return;
    if (!requireFaculty()) return;
    const valid = rows.filter((r) => r.room_code.trim().length > 0);
    if (valid.length === 0) {
      Alert.alert(T('error'), T('campusMapNeedCode'));
      return;
    }
    setBusy(true);
    try {
      let sourceUrl: string | null = null;
      const isPdf = picked?.mimeType === 'application/pdf';
      if (picked) {
        sourceUrl = await roomsApi.uploadDirectoryFile(picked.uri, isPdf);
      }
      const source = picked ? (isPdf ? 'pdf' : 'photo') : 'photo';
      const saved = await roomsApi.saveExtractedRooms(
        valid.map(({ _key, ...r }) => r),
        source,
        sourceUrl,
        faculty,
      );
      Alert.alert(T('campusMapSavedTitle'), T('campusMapSavedBody').replace('{n}', String(saved)), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(T('error'), e?.message || T('campusMapSaveFailed'));
    } finally {
      setBusy(false);
    }
  }, [rows, busy, picked, faculty, T, requireFaculty]);

  const isPdfPicked = picked?.mimeType === 'application/pdf';

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.navBack} hitSlop={12}>
          <Feather name="chevron-left" size={28} color={theme.primary} />
        </Pressable>
        <Text style={[styles.largeTitle, { color: theme.text }]}>{T('campusMapUploadTitle')}</Text>
        <Text style={[styles.intro, { color: theme.textSecondary }]}>{T('campusMapUploadSubtitle')}</Text>

        {/* LOCATION */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{T('campusMapSectionLocation')}</Text>
        <View style={[styles.group, { backgroundColor: theme.card }]}>
          {userCampus ? (
            <>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{T('campusMapCampusLabel')}</Text>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]} numberOfLines={1}>{userCampus}</Text>
              </View>
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            </>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => setFacultyModal(true)}
          >
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              {T('campusMapFacultyLabel')}
              <Text style={{ color: '#ef4444' }}> *</Text>
            </Text>
            <Text
              style={[styles.rowValue, { color: faculty ? theme.text : '#ef4444' }]}
              numberOfLines={1}
            >
              {faculty || T('campusMapSelectFaculty')}
            </Text>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
        <Text style={[styles.footnote, { color: theme.textSecondary }]}>{T('campusMapFacultyRequiredHint')}</Text>

        {/* DIRECTORY */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{T('campusMapSectionDirectory')}</Text>
        <View style={[styles.group, { backgroundColor: theme.card }]}>
          {picked ? (
            <>
              <View style={styles.row}>
                {isPdfPicked ? (
                  <View style={[styles.thumbPdf, { backgroundColor: theme.primary + '14' }]}>
                    <Feather name="file-text" size={20} color={theme.primary} />
                  </View>
                ) : (
                  <Image source={{ uri: picked.uri }} style={styles.thumbImg} resizeMode="cover" />
                )}
                <Text style={[styles.rowLabel, { color: theme.text, flex: 1 }]} numberOfLines={1}>{picked.name}</Text>
                <Pressable onPress={() => setPicked(null)} hitSlop={10}>
                  <Feather name="x-circle" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            </>
          ) : null}
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={pickImage} disabled={busy}>
            <Feather name="image" size={20} color={theme.primary} style={styles.rowLead} />
            <Text style={[styles.rowLabel, { color: theme.text, flex: 1 }]}>{T('campusMapPickPhoto')}</Text>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={pickPdf} disabled={busy}>
            <Feather name="file-text" size={20} color={theme.primary} style={styles.rowLead} />
            <Text style={[styles.rowLabel, { color: theme.text, flex: 1 }]}>{T('campusMapPickPdf')}</Text>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.footnoteRow}>
          <Feather name="check-circle" size={13} color="#16a34a" />
          <Text style={[styles.footnote, { color: '#16a34a', marginTop: 0, marginLeft: 5, flex: 1 }]}>{T('campusMapNoTokenNote')}</Text>
        </View>

        {!rows ? (
          <>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }, (!picked || busy || !faculty) && { opacity: 0.4 }]}
              onPress={() => {
                if (!requireFaculty()) return;
                if (!picked) {
                  Alert.alert(T('error'), T('campusMapNoFile'));
                  return;
                }
                void runExtract();
              }}
              disabled={busy}
            >
              {busy && picked ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{T('campusMapExtract')}</Text>
              )}
            </Pressable>

            {busy && picked ? (
              <Text style={[styles.centerHint, { color: theme.textSecondary }]}>{T('campusMapExtracting')}</Text>
            ) : null}

            <Pressable style={styles.textBtn} onPress={startManualAdd}>
              <Text style={[styles.textBtnLabel, { color: theme.primary }]}>{T('campusMapAddManual')}</Text>
            </Pressable>
          </>
        ) : null}

        {/* Editable review list */}
        {rows ? (
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary, marginTop: 0 }]}>
              {T('campusMapReviewTitle')} · {rows.length}
            </Text>
            <Text style={[styles.footnote, { color: theme.textSecondary, marginTop: -2, marginBottom: 10 }]}>{T('campusMapReviewHint')}</Text>

            {rows.map((r) => (
              <View key={r._key} style={[styles.group, { backgroundColor: theme.card, marginBottom: 12 }]}>
                <View style={styles.roomHead}>
                  <TextInput
                    style={[styles.codeInput, { color: theme.text }]}
                    placeholder={T('campusMapFieldCode')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.room_code}
                    onChangeText={(v) => updateRow(r._key, 'room_code', v)}
                    autoCapitalize="characters"
                  />
                  <Pressable onPress={() => removeRow(r._key)} hitSlop={10}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </Pressable>
                </View>
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
                <TextInput
                  style={[styles.cellInput, { color: theme.text }]}
                  placeholder={T('campusMapFieldLabel')}
                  placeholderTextColor={theme.textSecondary}
                  value={r.room_label}
                  onChangeText={(v) => updateRow(r._key, 'room_label', v)}
                />
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
                <View style={styles.cellRow}>
                  <TextInput
                    style={[styles.cellInput, { color: theme.text, flex: 1 }]}
                    placeholder={T('campusMapFieldBuilding')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.building}
                    onChangeText={(v) => updateRow(r._key, 'building', v)}
                  />
                  <View style={[styles.separatorV, { backgroundColor: theme.border }]} />
                  <TextInput
                    style={[styles.cellInput, { color: theme.text, flex: 1 }]}
                    placeholder={T('campusMapFieldLevel')}
                    placeholderTextColor={theme.textSecondary}
                    value={r.level}
                    onChangeText={(v) => updateRow(r._key, 'level', v)}
                  />
                </View>
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
                <TextInput
                  style={[styles.cellInput, { color: theme.text, minHeight: 44 }]}
                  placeholder={T('campusMapFieldDescription')}
                  placeholderTextColor={theme.textSecondary}
                  value={r.description}
                  onChangeText={(v) => updateRow(r._key, 'description', v)}
                  multiline
                />
              </View>
            ))}

            <Pressable style={styles.textBtn} onPress={startManualAdd}>
              <Feather name="plus" size={16} color={theme.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.textBtnLabel, { color: theme.primary }]}>{T('campusMapAddRow')}</Text>
            </Pressable>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }, (busy || !faculty) && { opacity: 0.4 }]}
              onPress={() => void saveRooms()}
              disabled={busy || !faculty}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{T('campusMapSave')}</Text>}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={facultyModal} transparent animationType="slide" onRequestClose={() => setFacultyModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFacultyModal(false)} />
        <View style={[styles.modalSheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: theme.text }]}>{T('campusMapSelectFaculty')}</Text>

          {/* Add new faculty */}
          <View style={styles.addFacultyRow}>
            <TextInput
              ref={newFacultyRef}
              style={[styles.addFacultyInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              placeholder={T('campusMapAddFacultyPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              value={newFaculty}
              onChangeText={setNewFaculty}
              autoCapitalize="characters"
              onSubmitEditing={() => void handleAddFaculty()}
              returnKeyType="done"
            />
            <Pressable
              style={({ pressed }) => [styles.addFacultyBtn, { backgroundColor: theme.primary }, (pressed || addingFaculty) && { opacity: 0.6 }]}
              onPress={() => {
                if (!newFaculty.trim()) {
                  newFacultyRef.current?.focus();
                  return;
                }
                void handleAddFaculty();
              }}
              disabled={addingFaculty}
            >
              {addingFaculty ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="plus" size={20} color="#fff" />}
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
            {faculties.length === 0 ? (
              <Text style={[styles.facultyEmpty, { color: theme.textSecondary }]}>{T('campusMapNoFacultiesYet')}</Text>
            ) : (
              faculties.map((f) => {
                const active = f === faculty;
                return (
                  <Pressable
                    key={f}
                    style={({ pressed }) => [styles.facultyOption, { borderBottomColor: theme.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => { setFaculty(f); setFacultyModal(false); }}
                  >
                    <Text style={[styles.facultyOptionText, { color: theme.text, fontWeight: active ? '600' : '400' }]}>{f}</Text>
                    {active ? <Feather name="check" size={20} color={theme.primary} /> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navBack: { width: 40, height: 36, justifyContent: 'center', marginLeft: -6, marginBottom: 2 },

  largeTitle: { fontSize: 30, fontWeight: '700', letterSpacing: 0.36 },
  intro: { fontSize: 15, lineHeight: 21, marginTop: 6 },

  sectionHeader: { fontSize: 12.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 26, marginBottom: 8, marginLeft: 16 },

  group: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16, paddingVertical: 11 },
  rowLead: { marginRight: 12 },
  rowLabel: { fontSize: 17, fontWeight: '400' },
  rowValue: { fontSize: 17, flexShrink: 1, textAlign: 'right', marginLeft: 'auto', maxWidth: '64%' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  separatorV: { width: StyleSheet.hairlineWidth },

  thumbImg: { width: 34, height: 34, borderRadius: 8, marginRight: 12 },
  thumbPdf: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },

  footnote: { fontSize: 13, lineHeight: 18, marginTop: 7, marginHorizontal: 16 },
  footnoteRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 7, marginHorizontal: 16 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 14, marginTop: 26 },
  primaryBtnText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  centerHint: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  textBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, marginTop: 2 },
  textBtnLabel: { fontSize: 16, fontWeight: '500' },

  // Review room cards (grouped, borderless inset inputs)
  roomHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  codeInput: { flex: 1, fontSize: 17, fontWeight: '600', paddingVertical: 8 },
  cellRow: { flexDirection: 'row', alignItems: 'center' },
  cellInput: { fontSize: 15, paddingHorizontal: 16, paddingVertical: 12 },

  // Faculty modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  modalHandle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#c7c7cc', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 14 },
  addFacultyRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  addFacultyInput: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  addFacultyBtn: { width: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  facultyOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  facultyOptionText: { fontSize: 16, flex: 1 },
  facultyEmpty: { fontSize: 14, lineHeight: 20, paddingVertical: 20, textAlign: 'center' },
});
