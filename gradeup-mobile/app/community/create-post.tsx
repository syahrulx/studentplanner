import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { PostType } from '@/src/lib/eventsApi';

const POST_TYPES: { type: PostType; label: string; emoji: string; desc: string }[] = [
  { type: 'event', label: 'Event', emoji: '📅', desc: 'Share a university event' },
  { type: 'service', label: 'Service', emoji: '🔧', desc: 'Offer or request a service' },
  { type: 'memo', label: 'Memo', emoji: '📋', desc: 'Official memo (authority only)' },
];

export default function CreatePostScreen() {
  const theme = useTheme();
  const { user } = useApp();

  const [postType, setPostType] = useState<PostType>('event');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date>(new Date(Date.now() + 7 * 86400000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorityStatus, setAuthorityStatus] = useState<string | null>(null);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const userCampus = (user as any)?.campus || null;

  useEffect(() => {
    eventsApi.getMyAuthorityStatus().then(setAuthorityStatus);
  }, []);

  const isAuthority = authorityStatus === 'approved';
  const canPostMemo = isAuthority;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (postType === 'memo' && !canPostMemo) {
      Alert.alert('Not Authorized', 'You need authority status to post memos. Request authority in your profile.');
      return;
    }

    setSubmitting(true);
    try {
      await eventsApi.createPost({
        post_type: postType,
        title: title.trim(),
        body: body.trim() || undefined,
        image_uri: imageUri || undefined,
        university_id: userUni || undefined,
        campus: userCampus || undefined,
        event_date: eventDate ? eventDate.toISOString().split('T')[0] : undefined,
        event_time: eventTime.trim() || undefined,
        location: location.trim() || undefined,
        expires_at: hasExpiry ? expiresAt.toISOString() : undefined,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Post type selector */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>POST TYPE</Text>
        <View style={styles.typeRow}>
          {POST_TYPES.map((pt) => {
            const active = postType === pt.type;
            const disabled = pt.type === 'memo' && !canPostMemo;
            return (
              <Pressable
                key={pt.type}
                style={[
                  styles.typeCard,
                  {
                    backgroundColor: active ? theme.primary + '15' : theme.card,
                    borderColor: active ? theme.primary : theme.border,
                    opacity: disabled ? 0.4 : 1,
                  },
                ]}
                onPress={() => !disabled && setPostType(pt.type)}
                disabled={disabled}
              >
                <Text style={{ fontSize: 22 }}>{pt.emoji}</Text>
                <Text style={[styles.typeCardLabel, { color: active ? theme.primary : theme.text }]}>
                  {pt.label}
                </Text>
                <Text style={[styles.typeCardDesc, { color: theme.textSecondary }]} numberOfLines={1}>
                  {pt.desc}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {postType === 'memo' && !canPostMemo && (
          <Pressable
            style={[styles.authorityBanner, { backgroundColor: '#8b5cf6' + '15', borderColor: '#8b5cf6' + '30' }]}
            onPress={() => router.push('/community/request-authority' as any)}
          >
            <Feather name="shield" size={16} color="#8b5cf6" />
            <Text style={[styles.authorityBannerText, { color: '#8b5cf6' }]}>
              Request authority status to post memos →
            </Text>
          </Pressable>
        )}

        {/* Title */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TITLE *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="What's happening?"
          placeholderTextColor={theme.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />

        {/* Body */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="Add more details..."
          placeholderTextColor={theme.textSecondary}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Image */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>IMAGE</Text>
        {imageUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            <Pressable style={styles.imageRemove} onPress={() => setImageUri(null)}>
              <Feather name="x" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.imagePicker, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={pickImage}
          >
            <Feather name="image" size={24} color={theme.textSecondary} />
            <Text style={[styles.imagePickerText, { color: theme.textSecondary }]}>Tap to add an image</Text>
          </Pressable>
        )}

        {/* Event-specific fields */}
        {postType === 'event' && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>EVENT DATE</Text>
            <Pressable
              style={[styles.input, styles.dateBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Feather name="calendar" size={16} color={theme.primary} />
              <Text style={{ color: eventDate ? theme.text : theme.textSecondary, fontSize: 15 }}>
                {eventDate ? eventDate.toLocaleDateString() : 'Select date'}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={eventDate || new Date()}
                mode="date"
                display="default"
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) setEventDate(date);
                }}
              />
            )}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>EVENT TIME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. 10:00 AM - 2:00 PM"
              placeholderTextColor={theme.textSecondary}
              value={eventTime}
              onChangeText={setEventTime}
            />

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>LOCATION</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. Dewan Sri Budiman"
              placeholderTextColor={theme.textSecondary}
              value={location}
              onChangeText={setLocation}
            />
          </>
        )}

        {/* Expiry */}
        <View style={styles.expiryRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginBottom: 0 }]}>SET EXPIRY DATE</Text>
            <Text style={{ fontSize: 11, color: theme.textSecondary }}>Post will be hidden after this date</Text>
          </View>
          <Pressable
            style={[styles.toggle, { backgroundColor: hasExpiry ? theme.primary : theme.border }]}
            onPress={() => setHasExpiry(!hasExpiry)}
          >
            <View style={[styles.toggleThumb, hasExpiry && styles.toggleThumbActive]} />
          </Pressable>
        </View>
        {hasExpiry && (
          <>
            <Pressable
              style={[styles.input, styles.dateBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => setShowExpiryPicker(true)}
            >
              <Feather name="clock" size={16} color={theme.primary} />
              <Text style={{ color: theme.text, fontSize: 15 }}>
                {expiresAt.toLocaleDateString()}
              </Text>
            </Pressable>
            {showExpiryPicker && (
              <DateTimePicker
                value={expiresAt}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowExpiryPicker(false);
                  if (date) setExpiresAt(date);
                }}
              />
            )}
          </>
        )}

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: theme.primary },
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
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Post</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  typeCardLabel: { fontSize: 13, fontWeight: '700' },
  typeCardDesc: { fontSize: 9, textAlign: 'center' },
  authorityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  authorityBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  textArea: { minHeight: 100 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  imagePicker: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  imagePickerText: { fontSize: 13, fontWeight: '500' },
  imagePreviewWrap: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  imagePreview: { width: '100%', height: 180, borderRadius: 14 },
  imageRemove: {
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
  expiryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: { alignSelf: 'flex-end' },
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
