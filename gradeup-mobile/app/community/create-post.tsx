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
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { PostType } from '@/src/lib/eventsApi';

const POST_TYPES: { type: PostType; label: string; emoji: string; desc: string }[] = [
  { type: 'service', label: 'Service', emoji: '🔧', desc: 'Offer or request a service' },
  { type: 'event', label: 'Event', emoji: '📅', desc: 'Share an event (authority)' },
  { type: 'memo', label: 'Memo', emoji: '📋', desc: 'Official memo (authority)' },
];

export default function CreatePostScreen() {
  const theme = useTheme();
  const { user } = useApp();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditing = !!editId;

  const [postType, setPostType] = useState<PostType>('service');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date>(new Date(Date.now() + 7 * 86400000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorityStatus, setAuthorityStatus] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const userCampus = (user as any)?.campus || null;

  useEffect(() => {
    eventsApi.getMyAuthorityStatus().then(setAuthorityStatus);
  }, []);

  // Load existing post data for editing
  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    eventsApi.fetchPost(editId).then((post) => {
      if (post) {
        setPostType(post.post_type);
        setTitle(post.title);
        setBody(post.body || '');
        setExistingImageUrl(post.image_url);
        setEventTime(post.event_time || '');
        setLocation(post.location || '');
        if (post.event_date) {
          setEventDate(new Date(post.event_date + 'T00:00:00'));
        }
        if (post.expires_at) {
          setHasExpiry(true);
          setExpiresAt(new Date(post.expires_at));
        }
      }
      setLoadingEdit(false);
    });
  }, [editId]);

  const isAuthority = authorityStatus === 'approved';
  const canPostEvent = isAuthority;
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
      Alert.alert('Not Authorized', 'You need authority status to post memos.');
      return;
    }
    if (postType === 'event' && !canPostEvent) {
      Alert.alert('Not Authorized', 'You need authority status to post events.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        // Upload new image if changed
        let image_url = existingImageUrl;
        if (imageUri) {
          image_url = await eventsApi.uploadPostImage(imageUri);
        }
        await eventsApi.updatePost(editId!, {
          title: title.trim(),
          body: body.trim() || null,
          image_url,
          event_date: eventDate ? eventDate.toISOString().split('T')[0] : null,
          event_time: eventTime.trim() || null,
          location: location.trim() || null,
          expires_at: hasExpiry ? expiresAt.toISOString() : null,
        });
      } else {
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
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || `Failed to ${isEditing ? 'update' : 'create'} post.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEdit) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await eventsApi.deletePost(editId);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to delete post.');
            setSubmitting(false);
          }
        },
      },
    ]);
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>{isEditing ? 'Edit Post' : 'New Post'}</Text>
        {isEditing ? (
          <Pressable onPress={handleDelete} hitSlop={10} disabled={submitting}>
            <Feather name="trash-2" size={20} color={theme.danger || '#ef4444'} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Post type selector */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>POST TYPE</Text>
        <View style={styles.typeRow}>
          {POST_TYPES.map((pt) => {
            const active = postType === pt.type;
            const locked = (pt.type === 'memo' && !canPostMemo) || (pt.type === 'event' && !canPostEvent);
            return (
              <Pressable
                key={pt.type}
                style={[
                  styles.typeCard,
                  {
                    backgroundColor: active ? theme.primary + '15' : theme.card,
                    borderColor: active ? theme.primary : theme.border,
                    opacity: locked ? 0.5 : 1,
                  },
                ]}
                onPress={() => {
                  if (locked) {
                    Alert.alert(
                      'Authority Required',
                      `You need authority status to post ${pt.type}s. Would you like to request authority?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Request Authority', onPress: () => router.push('/community/request-authority' as any) },
                      ]
                    );
                  } else {
                    setPostType(pt.type);
                  }
                }}
              >
                {locked && (
                  <View style={styles.lockBadge}>
                    <Feather name="lock" size={10} color="#8b5cf6" />
                  </View>
                )}

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
        ) : existingImageUrl ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: existingImageUrl }} style={styles.imagePreview} resizeMode="cover" />
            <Pressable style={styles.imageRemove} onPress={() => setExistingImageUrl(null)}>
              <Feather name="x" size={18} color="#fff" />
            </Pressable>
            <Pressable style={[styles.imageChange, { backgroundColor: theme.primary }]} onPress={pickImage}>
              <Feather name="camera" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Change</Text>
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

        {/* Date, Time, Location — available for all post types */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>DATE</Text>
        <Pressable
          style={[styles.input, styles.dateBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Feather name="calendar" size={16} color={theme.primary} />
          <Text style={{ color: eventDate ? theme.text : theme.textSecondary, fontSize: 15 }}>
            {eventDate ? eventDate.toLocaleDateString() : 'Select date (optional)'}
          </Text>
        </Pressable>
        {showDatePicker && (
          <View style={[styles.pickerWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <DateTimePicker
              value={eventDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, date) => {
                if (Platform.OS !== 'ios') setShowDatePicker(false);
                if (date) setEventDate(date);
              }}
            />
            {Platform.OS === 'ios' && (
              <Pressable
                style={[styles.pickerDone, { backgroundColor: theme.primary }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Done</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>TIME</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="e.g. 10:00 AM - 2:00 PM (optional)"
          placeholderTextColor={theme.textSecondary}
          value={eventTime}
          onChangeText={setEventTime}
        />

        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>LOCATION</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="e.g. Dewan Sri Budiman (optional)"
          placeholderTextColor={theme.textSecondary}
          value={location}
          onChangeText={setLocation}
        />

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
              <View style={[styles.pickerWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <DateTimePicker
                  value={expiresAt}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    if (Platform.OS !== 'ios') setShowExpiryPicker(false);
                    if (date) setExpiresAt(date);
                  }}
                />
                {Platform.OS === 'ios' && (
                  <Pressable
                    style={[styles.pickerDone, { backgroundColor: theme.primary }]}
                    onPress={() => setShowExpiryPicker(false)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Done</Text>
                  </Pressable>
                )}
              </View>
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
              <Text style={styles.submitBtnText}>{isEditing ? 'Update' : 'Post'}</Text>
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
  lockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#8b5cf620',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  imageChange: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
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
  pickerWrap: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  pickerDone: {
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
});
