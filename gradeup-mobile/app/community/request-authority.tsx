import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';

export default function RequestAuthorityScreen() {
  const theme = useTheme();
  const { user } = useApp();

  const [roleTitle, setRoleTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<eventsApi.AuthorityRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const [campuses, setCampuses] = useState<eventsApi.Campus[]>([]);
  const [organizations, setOrganizations] = useState<eventsApi.Organization[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerData, setPickerData] = useState<{ id: string; name: string }[]>([]);
  const [pickerTitle, setPickerTitle] = useState('');
  const [pickerOnSelect, setPickerOnSelect] = useState<(id: string) => void>(() => () => {});

  const userUni = (user as any)?.university_id || (user as any)?.universityId || '';

  useEffect(() => {
    Promise.all([
      eventsApi.getMyAuthorityRequest(),
      userUni ? eventsApi.fetchCampuses(userUni) : Promise.resolve([]),
      userUni ? eventsApi.fetchOrganizations(userUni) : Promise.resolve([])
    ]).then(([req, camps, orgs]) => {
      setExistingRequest(req);
      setCampuses(camps);
      setOrganizations(orgs);
      setLoading(false);
    });
  }, [userUni]);

  const availableOrgs = organizations.filter(o => !o.campus_id || o.campus_id === selectedCampusId);

  const pickProofImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setProofUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!roleTitle.trim()) {
      Alert.alert('Required', 'Please enter your jawatan (position/role).');
      return;
    }
    if (!justification.trim()) {
      Alert.alert('Required', 'Please provide a justification.');
      return;
    }
    if (!proofUri) {
      Alert.alert('Required', 'Please upload proof of your jawatankuasa (e.g. appointment letter, ID card).');
      return;
    }

    setSubmitting(true);
    try {
      await eventsApi.requestAuthority({
        university_id: userUni,
        campus_id: selectedCampusId || undefined,
        organization_id: selectedOrgId || undefined,
        role_title: roleTitle.trim(),
        justification: justification.trim(),
        proof_uri: proofUri,
      });
      Alert.alert('Request Submitted', 'Your authority request has been sent to the admin for review.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#10b981',
    rejected: '#ef4444',
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Request Authority</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: '#8b5cf6' + '12', borderColor: '#8b5cf6' + '30' }]}>
          <Feather name="shield" size={20} color="#8b5cf6" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: '#8b5cf6' }]}>What is Authority Status?</Text>
            <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
              Authority status allows you to post official events and memos on behalf of your university or organization.{'\n'}
              You must provide proof of your committee/jawatankuasa role. Your request will be reviewed by admin.
            </Text>
          </View>
        </View>

        {/* Existing request status */}
        {existingRequest && (
          <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.statusHeader}>
              <Feather name="info" size={16} color={statusColors[existingRequest.status] || theme.textSecondary} />
              <Text style={[styles.statusTitle, { color: theme.text }]}>Current Request</Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={[styles.statusBadge, { backgroundColor: (statusColors[existingRequest.status] || '#999') + '18' }]}>
                <Text style={[styles.statusBadgeText, { color: statusColors[existingRequest.status] || '#999' }]}>
                  {existingRequest.status.charAt(0).toUpperCase() + existingRequest.status.slice(1)}
                </Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Jawatan</Text>
              <Text style={[styles.statusValue, { color: theme.text }]}>{existingRequest.role_title}</Text>
            </View>
            {existingRequest.status === 'approved' && (
              <Text style={[styles.approvedText, { color: '#10b981' }]}>
                ✅ You can now post events and memos!
              </Text>
            )}
            {existingRequest.status === 'rejected' && (
              <Text style={[styles.rejectedText, { color: '#ef4444' }]}>
                Your previous request was rejected. You may submit a new one below.
              </Text>
            )}
          </View>
        )}

        {/* Form (hide if approved or pending) */}
        {(!existingRequest || existingRequest.status === 'rejected') && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>CAMPUS (OPTIONAL)</Text>
            <Pressable
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, justifyContent: 'center' }]}
              onPress={() => {
                setPickerTitle('Select Campus');
                setPickerData([{ id: '', name: 'None' }, ...campuses]);
                setPickerOnSelect(() => (id: string) => {
                  setSelectedCampusId(id || null);
                  setSelectedOrgId(null); // reset org when campus changes
                });
                setPickerVisible(true);
              }}
            >
              <Text style={{ color: selectedCampusId ? theme.text : theme.textSecondary, fontSize: 15 }}>
                {selectedCampusId ? campuses.find(c => c.id === selectedCampusId)?.name : 'Select your campus...'}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ORGANIZATION / CLUB (OPTIONAL)</Text>
            <Pressable
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, justifyContent: 'center' }]}
              onPress={() => {
                setPickerTitle('Select Organization');
                setPickerData([{ id: '', name: 'None' }, ...availableOrgs]);
                setPickerOnSelect(() => (id: string) => setSelectedOrgId(id || null));
                setPickerVisible(true);
              }}
            >
              <Text style={{ color: selectedOrgId ? theme.text : theme.textSecondary, fontSize: 15 }}>
                {selectedOrgId ? organizations.find(o => o.id === selectedOrgId)?.name : 'Select organization...'}
              </Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>JAWATAN (POSITION) *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. Ketua Biro Publisiti MPP"
              placeholderTextColor={theme.textSecondary}
              value={roleTitle}
              onChangeText={setRoleTitle}
              maxLength={80}
            />

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>JUSTIFICATION *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="Describe your role, responsibilities, and why you need authority status..."
              placeholderTextColor={theme.textSecondary}
              value={justification}
              onChangeText={setJustification}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>PROOF OF JAWATANKUASA *</Text>
            <Text style={[styles.proofHint, { color: theme.textSecondary }]}>
              Upload a photo of your appointment letter, committee ID, or any official document proving your role.
            </Text>
            {proofUri ? (
              <View style={styles.proofPreviewWrap}>
                <Image source={{ uri: proofUri }} style={styles.proofPreview} resizeMode="cover" />
                <Pressable style={styles.proofRemove} onPress={() => setProofUri(null)}>
                  <Feather name="x" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.proofPicker, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={pickProofImage}
              >
                <Feather name="upload" size={24} color="#8b5cf6" />
                <Text style={[styles.proofPickerText, { color: '#8b5cf6' }]}>
                  Tap to upload proof
                </Text>
                <Text style={[styles.proofPickerSub, { color: theme.textSecondary }]}>
                  Surat pelantikan, kad jawatankuasa, etc.
                </Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: '#8b5cf6' },
                pressed && { opacity: 0.85 },
                submitting && { opacity: 0.5 },
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="shield" size={18} color="#fff" />
                  <Text style={styles.submitBtnText}>Submit Request</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Reusable Picker Modal */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={e => e.stopPropagation()}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{pickerTitle}</Text>
            </View>
            <FlatList
              data={pickerData}
              keyExtractor={item => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.sheetItem, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    pickerOnSelect(item.id);
                    setPickerVisible(false);
                  }}
                >
                  <Text style={[styles.sheetItemText, { color: theme.text }]}>{item.name}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 60 },
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoDesc: { fontSize: 12, lineHeight: 18 },
  statusCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel: { fontSize: 13 },
  statusValue: { fontSize: 13, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  approvedText: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  rejectedText: { fontSize: 12, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  textArea: { minHeight: 120 },
  proofHint: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  proofPicker: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 6,
  },
  proofPickerText: { fontSize: 14, fontWeight: '700' },
  proofPickerSub: { fontSize: 11 },
  proofPreviewWrap: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  proofPreview: { width: '100%', height: 220, borderRadius: 14 },
  proofRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 30,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: '80%',
  },
  grabber: {
    width: 40,
    height: 4,
    backgroundColor: '#cbd5e1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700' },
  sheetItem: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetItemText: { fontSize: 16 },
});
