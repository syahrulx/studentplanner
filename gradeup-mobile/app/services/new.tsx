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
import * as servicesApi from '@/src/lib/servicesApi';
import {
  SERVICE_CATEGORIES,
  type ServiceKind,
  type PriceType,
} from '@/src/lib/servicesApi';

const KIND_OPTIONS: { id: ServiceKind; title: string; subtitle: string; icon: string; tint: string }[] = [
  { id: 'request', title: 'Need a service', subtitle: 'Ask the community for help', icon: 'help-circle', tint: '#0A84FF' },
  { id: 'offer',   title: 'Offer a service', subtitle: 'Help others, set your terms', icon: 'gift',        tint: '#30D158' },
];

const PRICE_OPTIONS: { id: PriceType; label: string; sub: string }[] = [
  { id: 'free',       label: 'Free',       sub: 'No payment expected' },
  { id: 'fixed',      label: 'Fixed',      sub: 'Set a price' },
  { id: 'negotiable', label: 'Negotiable', sub: 'Discuss with taker' },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function NewServiceScreen() {
  const theme = useTheme();
  const dark = isDarkTheme(theme.id);
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { editId, kind: kindParam } = useLocalSearchParams<{ editId?: string; kind?: string }>();
  const isEditing = !!editId;

  const [kind, setKind] = useState<ServiceKind>(
    (kindParam === 'offer' ? 'offer' : 'request') as ServiceKind
  );
  const [category, setCategory] = useState<string>('tutoring');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [priceType, setPriceType] = useState<PriceType>('negotiable');
  const [priceAmount, setPriceAmount] = useState('');
  const [location, setLocation] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const userCampus = (user as any)?.campus || null;

  // Load for edit
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    servicesApi.fetchService(editId).then((s) => {
      if (s) {
        setKind(s.service_kind || 'request');
        setCategory(s.service_category || 'other');
        setTitle(s.title);
        setBody(s.body || '');
        setExistingImageUrl(s.image_url);
        setPriceType(s.price_type || 'negotiable');
        if (s.price_amount != null) setPriceAmount(String(s.price_amount));
        setLocation(s.location || '');
        if (s.deadline_at) setDeadline(new Date(s.deadline_at));
      }
      setLoading(false);
    });
  }, [editId]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (priceType === 'fixed' && (!priceAmount || isNaN(Number(priceAmount)))) {
      Alert.alert('Required', 'Please enter a valid price amount.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        let image_url = existingImageUrl;
        if (imageUri) {
          const { uploadPostImage } = await import('@/src/lib/eventsApi');
          image_url = await uploadPostImage(imageUri);
        }
        await servicesApi.updateService(editId!, {
          title: title.trim(),
          body: body.trim() || null,
          image_url,
          service_kind: kind,
          service_category: category,
          price_type: priceType,
          price_amount: priceType === 'fixed' ? Number(priceAmount) : null,
          currency: 'MYR',
          location: location.trim() || null,
          deadline_at: deadline ? deadline.toISOString() : null,
        });
      } else {
        await servicesApi.createService({
          kind,
          title: title.trim(),
          body: body.trim() || undefined,
          image_uri: imageUri || undefined,
          category,
          price_type: priceType,
          price_amount: priceType === 'fixed' ? Number(priceAmount) : undefined,
          currency: 'MYR',
          location: location.trim() || undefined,
          deadline_at: deadline ? deadline.toISOString() : undefined,
          university_id: userUni || undefined,
          campus: userCampus || undefined,
        });
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert('Delete Service', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await servicesApi.deleteService(editId);
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to delete');
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const heroUri = imageUri || existingImageUrl;
  const activeKind = KIND_OPTIONS.find((k) => k.id === kind)!;
  const activeCat = SERVICE_CATEGORIES.find((c) => c.id === category) || SERVICE_CATEGORIES[0];

  if (loading) {
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
      {/* Nav */}
      <View style={[styles.nav, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={[styles.navCancel, { color: theme.textSecondary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]}>
          {isEditing ? 'Edit Service' : 'New Service'}
        </Text>
        <View style={styles.navRight}>
          {isEditing && (
            <Pressable onPress={handleDelete} hitSlop={10} disabled={submitting}>
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
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Kind toggle */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>I WANT TO</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {KIND_OPTIONS.map((k, i) => {
              const active = kind === k.id;
              return (
                <React.Fragment key={k.id}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                  <Pressable
                    onPress={() => setKind(k.id)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: k.tint + '18' }]}>
                      <Feather name={k.icon as any} size={16} color={k.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: theme.text }]}>{k.title}</Text>
                      <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{k.subtitle}</Text>
                    </View>
                    {active ? (
                      <Feather name="check-circle" size={18} color={k.tint} />
                    ) : (
                      <View style={[styles.radio, { borderColor: theme.border }]} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Category */}
        <View style={styles.sectionWide}>
          <Text style={[styles.sectionHeader, styles.sectionHeaderInset, { color: theme.textSecondary }]}>
            CATEGORY
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {SERVICE_CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[
                    styles.catChip,
                    active
                      ? { backgroundColor: c.tint + '22', borderColor: c.tint }
                      : { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                  <Text
                    style={[
                      styles.catText,
                      { color: active ? c.tint : theme.text },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>DETAILS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TextInput
              style={[styles.titleInput, { color: theme.text }]}
              placeholder={kind === 'request' ? 'What do you need?' : 'What can you help with?'}
              placeholderTextColor={theme.textSecondary + '99'}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              returnKeyType="next"
            />
            <View style={[styles.separator, { backgroundColor: theme.border }]} />
            <TextInput
              style={[styles.bodyInput, { color: theme.text }]}
              placeholder="Add more details (optional)"
              placeholderTextColor={theme.textSecondary + '99'}
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Image */}
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
                <Pressable onPress={pickImage} style={[styles.heroBtn, { backgroundColor: 'rgba(255,255,255,0.9)' }]}>
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
              <View style={[styles.imageIcon, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="image" size={20} color={theme.textSecondary} />
              </View>
              <Text style={[styles.imageText, { color: theme.textSecondary }]}>Add a photo (optional)</Text>
            </Pressable>
          )}
        </View>

        {/* Price */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>PRICE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {PRICE_OPTIONS.map((p, i) => {
              const active = priceType === p.id;
              return (
                <React.Fragment key={p.id}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: theme.border }]} />}
                  <Pressable
                    onPress={() => setPriceType(p.id)}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: theme.text }]}>{p.label}</Text>
                      <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{p.sub}</Text>
                    </View>
                    {active ? (
                      <Feather name="check-circle" size={18} color={activeKind.tint} />
                    ) : (
                      <View style={[styles.radio, { borderColor: theme.border }]} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}

            {priceType === 'fixed' && (
              <>
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: theme.text }]}>Amount (MYR)</Text>
                  <TextInput
                    style={[styles.amountInput, { color: theme.text }]}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    value={priceAmount}
                    onChangeText={setPriceAmount}
                    textAlign="right"
                  />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Location & deadline */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>WHERE & WHEN</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.row}>
              <Feather name="map-pin" size={16} color={activeCat.tint} style={{ marginRight: 12 }} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Location</Text>
              <TextInput
                style={[styles.amountInput, { color: theme.text }]}
                placeholder="Optional"
                placeholderTextColor={theme.textSecondary}
                value={location}
                onChangeText={setLocation}
                textAlign="right"
              />
            </View>

            <View style={[styles.separator, { backgroundColor: theme.border }]} />

            <Pressable
              onPress={() => setShowDeadlinePicker((v) => !v)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Feather name="clock" size={16} color={activeCat.tint} style={{ marginRight: 12 }} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>Deadline</Text>
              <Text style={[styles.rowValue, { color: deadline ? theme.text : theme.textSecondary }]}>
                {deadline ? formatDate(deadline) : 'No deadline'}
              </Text>
              <Feather
                name={showDeadlinePicker ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={theme.textSecondary}
              />
            </Pressable>

            {Platform.OS === 'ios' && showDeadlinePicker && (
              <View style={[styles.inlinePicker, { borderTopColor: theme.border }]}>
                <DateTimePicker
                  value={deadline || new Date()}
                  mode="date"
                  display="inline"
                  minimumDate={new Date()}
                  themeVariant={dark ? 'dark' : 'light'}
                  accentColor={activeKind.tint}
                  onChange={(_, d) => { if (d) setDeadline(d); }}
                />
                {deadline && (
                  <Pressable onPress={() => { setDeadline(null); setShowDeadlinePicker(false); }} style={styles.clearBtn}>
                    <Text style={[styles.clearBtnText, { color: theme.danger }]}>Clear deadline</Text>
                  </Pressable>
                )}
              </View>
            )}
            {Platform.OS === 'android' && showDeadlinePicker && (
              <DateTimePicker
                value={deadline || new Date()}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(e, d) => {
                  setShowDeadlinePicker(false);
                  if (e.type === 'set' && d) setDeadline(d);
                }}
              />
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

  section: { marginTop: 24, paddingHorizontal: 20 },
  sectionWide: { marginTop: 24 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionHeaderInset: { paddingHorizontal: 20 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 52 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 50,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, flex: 1 },
  rowSub: { fontSize: 12, fontWeight: '400', marginTop: 2 },
  rowValue: { fontSize: 15, fontWeight: '400', marginRight: 6 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },

  catScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  catText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },

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

  heroWrap: { borderRadius: 16, overflow: 'hidden', height: 180, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroActions: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 8 },
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
    height: 110,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  imageIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  imageText: { fontSize: 13, fontWeight: '500' },

  amountInput: {
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
    minWidth: 100,
  },

  inlinePicker: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  clearBtn: { alignItems: 'center', paddingVertical: 8 },
  clearBtnText: { fontSize: 14, fontWeight: '600' },
});
