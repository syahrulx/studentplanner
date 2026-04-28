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
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';

export default function RequestAuthorityScreen() {
  const theme = useTheme();
  const { user } = useApp();

  const [roleTitle, setRoleTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingRequest, setExistingRequest] = useState<eventsApi.AuthorityRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || '';

  useEffect(() => {
    eventsApi.getMyAuthorityRequest().then((req) => {
      setExistingRequest(req);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!roleTitle.trim()) {
      Alert.alert('Required', 'Please enter your role title.');
      return;
    }
    if (!justification.trim()) {
      Alert.alert('Required', 'Please provide a justification.');
      return;
    }

    setSubmitting(true);
    try {
      await eventsApi.requestAuthority({
        university_id: userUni,
        role_title: roleTitle.trim(),
        justification: justification.trim(),
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

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: '#8b5cf6' + '12', borderColor: '#8b5cf6' + '30' }]}>
          <Feather name="shield" size={20} color="#8b5cf6" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: '#8b5cf6' }]}>What is Authority Status?</Text>
            <Text style={[styles.infoDesc, { color: theme.textSecondary }]}>
              Authority status allows you to post official memos on behalf of your university or organization. 
              Your request will be reviewed by the admin team.
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
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Role</Text>
              <Text style={[styles.statusValue, { color: theme.text }]}>{existingRequest.role_title}</Text>
            </View>
            {existingRequest.status === 'approved' && (
              <Text style={[styles.approvedText, { color: '#10b981' }]}>
                ✅ You can now post memos!
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
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>YOUR ROLE TITLE *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. Student Council President"
              placeholderTextColor={theme.textSecondary}
              value={roleTitle}
              onChangeText={setRoleTitle}
              maxLength={80}
            />

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>JUSTIFICATION *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="Why should you be granted authority status? Describe your role and responsibilities..."
              placeholderTextColor={theme.textSecondary}
              value={justification}
              onChangeText={setJustification}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

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
});
