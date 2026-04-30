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
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { isDarkTheme } from '@/constants/Themes';
import { useApp } from '@/src/context/AppContext';
import * as eventsApi from '@/src/lib/eventsApi';
import type { PostType } from '@/src/lib/eventsApi';

// ─── Types ────────────────────────────────────────────────────────────────────

const POST_TYPES: { type: PostType; label: string; icon: string; desc: string; tint: string }[] = [
  { type: 'event',   label: 'Event',   icon: 'calendar',  desc: 'Share a campus event',  tint: '#0A84FF' },
  { type: 'memo',    label: 'Memo',    icon: 'file-text', desc: 'Official announcement', tint: '#BF5AF2' },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const dark = isDarkTheme(theme.id);
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditing = !!editId;

  const [postType, setPostType] = useState<PostType>('event');
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
  const [authorityRequest, setAuthorityRequest] = useState<eventsApi.AuthorityRequest | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const isAuthority = authorityRequest?.status === 'approved';

  useEffect(() => {
    eventsApi.getMyAuthorityRequest().then(setAuthorityRequest);
  }, []);

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
        if (post.event_date) setEventDate(new Date(post.event_date + 'T00:00:00'));
        if (post.expires_at) {
          setHasExpiry(true);
          setExpiresAt(new Date(post.expires_at));
        }
      }
      setLoadingEdit(false);
    });
  }, [editId]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [210, 297], // A4 ratio
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if ((postType === 'memo' || postType === 'event') && !isAuthority) {
      Alert.alert('Not Authorized', `You need authority status to post ${postType}s.`);
      return;
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        let image_url = existingImageUrl;
        if (imageUri) image_url = await eventsApi.uploadPostImage(imageUri);
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
          university_id: authorityRequest?.university_id || userUni || undefined,
          campus_id: authorityRequest?.campus_id || undefined,
          organization_id: authorityRequest?.organization_id || undefined,
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

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert('Delete Post', 'This cannot be undone.', [
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
            Alert.alert('Error', e.message || 'Failed to delete.');
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const heroUri = imageUri || existingImageUrl;
  const activeMeta = POST_TYPES.find((p) => p.type === postType)!;

  if (loadingEdit) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ─── Nav bar ─── */}
      <View style={[styles.nav, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={[styles.navCancel, { color: theme.textSecondary }]}>Cancel</Text>
        </Pressable>

        <Text style={[styles.navTitle, { color: theme.text }]}>
          {isEditing ? 'Edit Post' : 'New Post'}
        </Text>

        <View style={styles.navRight}>
          {isEditing && (
            <Pressable
              onPress={handleDelete}
              hitSlop={10}
              disabled={submitting}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Feather name="trash-2" size={18} color={theme.danger} />
            </Pressable>
          )}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !title.trim()}
            style={({ pressed }) => [
              styles.postBtn,
              { backgroundColor: theme.text },
              (!title.trim() || submitting) && { opacity: 0.3 },
              pressed && { opacity: 0.75 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Text style={[styles.postBtnText, { color: theme.background }]}>
                {isEditing ? 'Save' : 'Post'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Type selector ─── */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>TYPE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {POST_TYPES.map((pt, i) => {
              const active = postType === pt.type;
              const locked = (pt.type === 'event' || pt.type === 'memo') && !isAuthority;
              return (
                <React.Fragment key={pt.type}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                  <Pressable
                    onPress={() => {
                      if (locked) {
                        Alert.alert(
                          'Authority Required',
                          `Only verified authorities can post ${pt.type}s. Would you like to request authority?`,
                          [
                            { text: 'Not now', style: 'cancel' },
                            { text: 'Request', onPress: () => router.push('/community/request-authority' as any) },
                          ]
                        );
                      } else {
                        setPostType(pt.type);
                      }
                    }}
                    style={({ pressed }) => [styles.typeRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: pt.tint + '18' }]}>
                      <Feather name={pt.icon as any} size={16} color={pt.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.typeLabel, { color: theme.text }]}>{pt.label}</Text>
                      <Text style={[styles.typeDesc, { color: theme.textSecondary }]}>{pt.desc}</Text>
                    </View>
                    {locked ? (
                      <Feather name="lock" size={14} color={theme.textSecondary} />
                    ) : active ? (
                      <Feather name="check-circle" size={18} color={pt.tint} />
                    ) : (
                      <View style={[styles.radioEmpty, { borderColor: theme.border }]} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* ─── Content ─── */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>CONTENT</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TextInput
              style={[styles.titleInput, { color: theme.text }]}
              placeholder="Title"
              placeholderTextColor={theme.textSecondary + '99'}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              returnKeyType="next"
            />
            <View style={[styles.separator, { backgroundColor: theme.border }]} />
            <TextInput
              style={[styles.bodyInput, { color: theme.text }]}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary + '99'}
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* ─── Image ─── */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>IMAGE</Text>
          {heroUri ? (
            <View style={styles.heroWrap}>
              <Image source={{ uri: heroUri }} style={styles.heroImg} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.heroActions}>
                <Pressable
                  onPress={pickImage}
                  style={[styles.heroBtn, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
                >
                  <Feather name="camera" size={14} color="#1c1c1e" />
                  <Text style={styles.heroBtnText}>Change</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setImageUri(null); setExistingImageUrl(null); }}
                  style={[styles.heroBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
                >
                  <Feather name="trash-2" size={14} color="#fff" />
                  <Text style={[styles.heroBtnText, { color: '#fff' }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={pickImage}
              style={({ pressed }) => [
                styles.imagePlaceholder,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.imagePlaceholderIcon, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="image" size={22} color={theme.textSecondary} />
              </View>
              <Text style={[styles.imagePlaceholderText, { color: theme.textSecondary }]}>
                Add a cover image
              </Text>
              <Text style={[styles.imagePlaceholderSub, { color: theme.textSecondary }]}>
                Optional · A4 Portrait recommended
              </Text>
            </Pressable>
          )}
        </View>

        {/* ─── Details ─── */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>DETAILS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>

            {/* Date */}
            <Pressable
              onPress={() => setShowDatePicker((v) => !v)}
              style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.7 }]}
            >
              <Feather name="calendar" size={16} color={activeMeta.tint} style={styles.detailIcon} />
              <Text style={[styles.detailLabel, { color: theme.text }]}>Date</Text>
              <Text style={[styles.detailValue, { color: eventDate ? theme.text : theme.textSecondary }]}>
                {eventDate ? formatDate(eventDate) : 'Optional'}
              </Text>
              <Feather
                name={showDatePicker ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={theme.textSecondary}
              />
            </Pressable>

            {Platform.OS === 'ios' && showDatePicker && (
              <View style={[styles.inlinePicker, { borderTopColor: theme.border }]}>
                <DateTimePicker
                  value={eventDate || new Date()}
                  mode="date"
                  display="inline"
                  themeVariant={dark ? 'dark' : 'light'}
                  accentColor={activeMeta.tint}
                  onChange={(_, d) => { if (d) setEventDate(d); }}
                />
                {eventDate && (
                  <Pressable
                    onPress={() => { setEventDate(null); setShowDatePicker(false); }}
                    style={styles.clearDateBtn}
                  >
                    <Text style={[styles.clearDateText, { color: theme.danger }]}>Clear date</Text>
                  </Pressable>
                )}
              </View>
            )}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={eventDate || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowDatePicker(false);
                  if (e.type === 'set' && d) setEventDate(d);
                }}
              />
            )}

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            {/* Time */}
            <View style={styles.detailRow}>
              <Feather name="clock" size={16} color={activeMeta.tint} style={styles.detailIcon} />
              <Text style={[styles.detailLabel, { color: theme.text }]}>Time</Text>
              <TextInput
                style={[styles.detailInput, { color: theme.text }]}
                placeholder="e.g. 10:00 AM – 2:00 PM"
                placeholderTextColor={theme.textSecondary}
                value={eventTime}
                onChangeText={setEventTime}
                textAlign="right"
              />
            </View>

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            {/* Location */}
            <View style={styles.detailRow}>
              <Feather name="map-pin" size={16} color={activeMeta.tint} style={styles.detailIcon} />
              <Text style={[styles.detailLabel, { color: theme.text }]}>Location</Text>
              <TextInput
                style={[styles.detailInput, { color: theme.text }]}
                placeholder="Optional"
                placeholderTextColor={theme.textSecondary}
                value={location}
                onChangeText={setLocation}
                textAlign="right"
              />
            </View>
          </View>
        </View>

        {/* ─── Expiry ─── */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.detailRow}>
              <Feather name="clock" size={16} color={theme.textSecondary} style={styles.detailIcon} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailLabel, { color: theme.text }]}>Expiry date</Text>
                <Text style={[styles.typeDesc, { color: theme.textSecondary }]}>
                  Hidden from feed after this date
                </Text>
              </View>
              <Pressable
                onPress={() => setHasExpiry((v) => !v)}
                style={[styles.toggle, { backgroundColor: hasExpiry ? activeMeta.tint : theme.backgroundSecondary }]}
              >
                <View style={[styles.toggleThumb, hasExpiry && styles.toggleThumbOn]} />
              </Pressable>
            </View>

            {hasExpiry && (
              <>
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
                <Pressable
                  onPress={() => setShowExpiryPicker((v) => !v)}
                  style={({ pressed }) => [styles.detailRow, pressed && { opacity: 0.7 }]}
                >
                  <Feather name="calendar" size={16} color={theme.textSecondary} style={styles.detailIcon} />
                  <Text style={[styles.detailLabel, { color: theme.text }]}>Expires on</Text>
                  <Text style={[styles.detailValue, { color: theme.text }]}>{formatDate(expiresAt)}</Text>
                  <Feather
                    name={showExpiryPicker ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={theme.textSecondary}
                  />
                </Pressable>

                {Platform.OS === 'ios' && showExpiryPicker && (
                  <View style={[styles.inlinePicker, { borderTopColor: theme.border }]}>
                    <DateTimePicker
                      value={expiresAt}
                      mode="date"
                      display="inline"
                      minimumDate={new Date()}
                      themeVariant={dark ? 'dark' : 'light'}
                      accentColor={activeMeta.tint}
                      onChange={(_, d) => { if (d) setExpiresAt(d); }}
                    />
                  </View>
                )}
                {Platform.OS === 'android' && showExpiryPicker && (
                  <DateTimePicker
                    value={expiresAt}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onChange={(e, d) => {
                      setShowExpiryPicker(false);
                      if (e.type === 'set' && d) setExpiresAt(d);
                    }}
                  />
                )}
              </>
            )}
          </View>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Nav
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navCancel: { fontSize: 16, fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  // Scroll
  scroll: { paddingBottom: 60 },

  // Section grouping
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingLeft: 4,
  },

  // Grouped card (iOS Settings style)
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 52 },

  // Type rows
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  typeDesc: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  radioEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },

  // Content inputs
  titleInput: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bodyInput: {
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    minHeight: 90,
  },

  // Image
  heroWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    aspectRatio: 210 / 297,
    position: 'relative',
  },
  heroImg: { width: '100%', height: '100%' },
  heroActions: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  heroBtnText: { fontSize: 13, fontWeight: '600', color: '#1c1c1e' },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 210 / 297,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  imagePlaceholderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  imagePlaceholderSub: { fontSize: 12, fontWeight: '400' },

  // Detail rows (Settings-style)
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 50,
  },
  detailIcon: { marginRight: 12 },
  detailLabel: { fontSize: 15, fontWeight: '500', flex: 1, letterSpacing: -0.2 },
  detailValue: { fontSize: 15, fontWeight: '400', marginRight: 6 },
  detailInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    padding: 0,
    textAlign: 'right',
  },

  // Inline date picker
  inlinePicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  clearDateBtn: { alignItems: 'center', paddingVertical: 8 },
  clearDateText: { fontSize: 14, fontWeight: '600' },

  // Toggle
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
