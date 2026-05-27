import React, { useState, useEffect, useRef } from 'react';
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
import { LocationUniCampusBlock } from '@/components/LocationUniCampusBlock';
import * as servicesApi from '@/src/lib/servicesApi';
import * as eventsApi from '@/src/lib/eventsApi';
import {
  SERVICE_CATEGORIES,
  checkContentModeration,
  isValidSurveyUrl,
  getSurveyPostEligibility,
  type ServiceKind,
  type PriceType,
  type ServiceNegotiationMode,
} from '@/src/lib/servicesApi';

const KIND_OPTIONS: { id: ServiceKind; title: string; subtitle: string; icon: string; tint: string }[] = [
  { id: 'request', title: 'Need a service', subtitle: 'Ask the community for help', icon: 'help-circle', tint: '#0A84FF' },
  { id: 'offer',   title: 'Offer a service', subtitle: 'Help others, set your terms', icon: 'gift',        tint: '#30D158' },
];



const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function formatDateTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const min = m < 10 ? '0' + m : m;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${h}:${min} ${ampm}`;
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
  const [priceType, setPriceType] = useState<PriceType>('fixed');
  const [priceAmount, setPriceAmount] = useState('');
  const [location, setLocation] = useState('');
  const [formUniversityId, setFormUniversityId] = useState<string | null>(null);
  const [formCampusId, setFormCampusId] = useState<string | null>(null);
  const [campusNameResolved, setCampusNameResolved] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [deadlineType, setDeadlineType] = useState<'asap' | 'later'>('asap');
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Standard vs open marketplace (new “offer” posts); locked when editing; ignored for “request” posts (always standard). */
  const [negotiationMode, setNegotiationMode] = useState<ServiceNegotiationMode>('standard');

  // ── FYP Survey state ────────────────────────────────────────────────────────
  const [surveyUrl, setSurveyUrl]     = useState('');
  const [surveyTopic, setSurveyTopic] = useState('');
  const [surveyCourse, setSurveyCourse] = useState('');
  const [surveyQuota, setSurveyQuota] = useState(30);
  /** null = not checked yet, obj = loaded */
  const [surveyEligibility, setSurveyEligibility] = useState<{
    eligible: boolean;
    responseCount: number;
    needed: number;
    bootstrapMode: boolean;
    poolSize: number;
  } | null>(null);
  const [surveyUrlError, setSurveyUrlError] = useState<string | null>(null);

  const userUni = (user as any)?.university_id || (user as any)?.universityId || null;
  const didInitUniversity = useRef(false);
  const isSurvey = category === 'fyp_survey';

  // Load reciprocity eligibility whenever user switches to fyp_survey category
  useEffect(() => {
    if (!isSurvey || isEditing) return;
    setSurveyEligibility(null);
    getSurveyPostEligibility().then(setSurveyEligibility).catch(console.error);
  }, [isSurvey, isEditing]);

  // Auto-populate title from topic for surveys (title is required by DB but not shown)
  useEffect(() => {
    if (!isSurvey) return;
    setTitle(surveyTopic.trim() || 'FYP Survey');
  }, [isSurvey, surveyTopic]);

  // Validate survey URL in real-time
  useEffect(() => {
    if (!isSurvey || !surveyUrl.trim()) {
      setSurveyUrlError(null);
      return;
    }
    setSurveyUrlError(
      isValidSurveyUrl(surveyUrl)
        ? null
        : 'Use a Google Forms, Microsoft Forms, Typeform, SurveyMonkey, Tally, Jotform, or Qualtrics link'
    );
  }, [surveyUrl, isSurvey]);

  useEffect(() => {
    if (editId || didInitUniversity.current) return;
    if (userUni) {
      setFormUniversityId(userUni);
      didInitUniversity.current = true;
    }
  }, [editId, userUni]);

  // Load for edit
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    didInitUniversity.current = true;
    servicesApi.fetchService(editId).then((s) => {
      if (s) {
        setKind(s.service_kind || 'request');
        setCategory(s.service_category || 'other');
        setTitle(s.title);
        setBody(s.body || '');
        setExistingImageUrl(s.image_url);
        setPriceType('fixed'); // Force fixed price
        setNegotiationMode(s.service_negotiation_mode === 'open_service' ? 'open_service' : 'standard');
        if (s.price_amount != null) setPriceAmount(String(s.price_amount));
        setLocation(s.location || '');
        setFormUniversityId(s.university_id);
        if (s.university_id) {
          eventsApi.fetchCampuses(s.university_id).then((camps) => {
            if (s.campus) {
              const m = camps.find(
                (c) => c.name.trim().toLowerCase() === s.campus!.trim().toLowerCase()
              );
              if (m) {
                setFormCampusId(m.id);
                setCampusNameResolved(m.name);
              } else {
                setFormCampusId(null);
                setCampusNameResolved(s.campus);
              }
            } else {
              setFormCampusId(null);
              setCampusNameResolved(null);
            }
          });
        } else {
          setFormCampusId(null);
          setCampusNameResolved(null);
        }
        if (s.deadline_at) {
          setDeadline(new Date(s.deadline_at));
          setDeadlineType('later');
        } else {
          setDeadlineType('asap');
        }
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

    // Survey-specific validation
    if (isSurvey) {
      if (!surveyUrl.trim()) {
        Alert.alert('Required', 'Please paste your survey link.');
        return;
      }
      if (!isValidSurveyUrl(surveyUrl)) {
        Alert.alert('Invalid link', 'Please use a Google Forms, Typeform, Microsoft Forms, SurveyMonkey, Tally, Jotform, or Qualtrics link.');
        return;
      }
      if (surveyEligibility && !surveyEligibility.eligible) {
        Alert.alert(
          'Respond to surveys first 🤝',
          `You need to respond to ${surveyEligibility.needed} more survey${surveyEligibility.needed === 1 ? '' : 's'} before posting your own. Browse the FYP Surveys tab to help out fellow students!`
        );
        return;
      }
    } else if (priceType === 'fixed' && (!priceAmount || isNaN(Number(priceAmount)))) {
      Alert.alert('Required', 'Please enter a valid price amount.');
      return;
    }

    // Content moderation: block explicit/prohibited content
    const bannedWord = checkContentModeration(title, body);
    if (bannedWord) {
      Alert.alert(
        'Content Not Allowed',
        'Your service request contains content that violates our community guidelines. Explicit, illegal, or prohibited services are not allowed on this platform.',
      );
      return;
    }

    const processSubmit = async () => {
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
            deadline_at: deadlineType === 'later' && deadline ? deadline.toISOString() : null,
            university_id: formUniversityId || null,
            campus: campusNameResolved || null,
          });
        } else {
          await servicesApi.createService({
            kind,
            title: title.trim(),
            body: body.trim() || undefined,
            image_uri: imageUri || undefined,
            category,
            price_type: isSurvey ? 'free' : priceType,
            price_amount: isSurvey ? undefined : (priceType === 'fixed' ? Number(priceAmount) : undefined),
            currency: 'MYR',
            location: location.trim() || undefined,
            deadline_at: deadlineType === 'later' && deadline ? deadline.toISOString() : undefined,
            university_id: formUniversityId || undefined,
            campus: campusNameResolved || undefined,
            negotiation_mode: kind === 'offer' ? negotiationMode : 'standard',
            // Survey-specific
            survey_url: isSurvey ? surveyUrl.trim() : undefined,
            survey_quota: isSurvey ? surveyQuota : undefined,
            survey_topic: isSurvey ? surveyTopic.trim() || undefined : undefined,
            survey_course: isSurvey ? surveyCourse.trim() || undefined : undefined,
          });
        }
        router.back();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to submit');
      } finally {
        setSubmitting(false);
      }
    };

    if (!isEditing) {
      Alert.alert(
        'Platform Disclaimer',
        'Rencana serves solely as a platform to assist students in finding opportunities for extra income.\n\nPlease be advised that Rencana does not handle payments, and we assume no liability or responsibility for any monetary transactions, service fulfillments, or any accidents, injuries, or incidents that may occur during the provision of services (including riding, transportation, and running errands).\n\nAll activities are undertaken strictly at your own risk.\n\nDo you agree to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Agree', onPress: processSubmit },
        ]
      );
    } else {
      processSubmit();
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
      style={[styles.root, { backgroundColor: theme.backgroundSecondary ?? theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.pageScroll,
          { paddingTop: Math.max(insets.top, 16) + 4, paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.5 }}>
            <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
          </Pressable>
          <View style={styles.heroCenter}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>
              {isEditing ? 'Edit Service' : 'New Service'}
            </Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              {isSurvey ? 'FYP Survey' : kind === 'offer' ? 'Offering help' : 'Requesting help'}
            </Text>
          </View>
          <View style={styles.navRight}>
            {isEditing && (
              <Pressable onPress={handleDelete} hitSlop={10} disabled={submitting}>
                <Feather name="trash-2" size={18} color={theme.danger} />
              </Pressable>
            )}
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || (!isSurvey && !title.trim()) || (isSurvey && !surveyUrl.trim())}
              style={({ pressed }) => [
                styles.postBtn,
                { backgroundColor: theme.primary },
                ((!isSurvey && !title.trim()) || (isSurvey && !surveyUrl.trim()) || submitting) && { opacity: 0.3 },
                pressed && { opacity: 0.75 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.postBtnText, { color: theme.textInverse }]}>
                  {isEditing ? 'Save' : 'Post'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Kind toggle — hide for surveys (always 'offer' semantically) */}
        {!isSurvey && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>I want to</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              {KIND_OPTIONS.map((k, i) => {
                const active = kind === k.id;
                return (
                  <React.Fragment key={k.id}>
                    {i > 0 && <View style={[styles.hairline, { backgroundColor: theme.border }]} />}
                    <Pressable
                      onPress={() => setKind(k.id)}
                      style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.6 }]}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: k.tint + '18' }]}>
                        <Feather name={k.icon as any} size={16} color={k.tint} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>{k.title}</Text>
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
          </>
        )}

        {/* Category scroll */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Category</Text>
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
                <Feather name={c.icon as any} size={14} color={active ? c.tint : theme.textSecondary} />
                <Text style={[styles.catText, { color: active ? c.tint : theme.text }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* DETAILS + IMAGE — hidden for surveys */}
        {!isSurvey && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Details</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              <TextInput
                style={[styles.titleInput, { color: theme.text }]}
                placeholder={kind === 'request' ? 'What do you need?' : 'What can you help with?'}
                placeholderTextColor={theme.textSecondary + '88'}
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                returnKeyType="next"
              />
              <View style={[styles.hairline, { backgroundColor: theme.border }]} />
              <TextInput
                style={[styles.bodyInput, { color: theme.text }]}
                placeholder="Add more details (optional)"
                placeholderTextColor={theme.textSecondary + '88'}
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Image */}
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Photo (optional)</Text>
            {heroUri ? (
              <View style={styles.heroWrap}>
                <Image source={{ uri: heroUri }} style={styles.heroImg} resizeMode="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <View style={styles.heroActions}>
                  <Pressable onPress={pickImage} style={[styles.heroBtn, { backgroundColor: theme.card + 'E8' }]}>
                    <Feather name="camera" size={14} color={theme.text} />
                    <Text style={[styles.heroBtnText, { color: theme.text }]}>Change</Text>
                  </Pressable>
                  <Pressable onPress={() => { setImageUri(null); setExistingImageUrl(null); }} style={[styles.heroBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    <Feather name="trash-2" size={14} color="#fff" />
                    <Text style={[styles.heroBtnText, { color: '#fff' }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={pickImage}
                style={({ pressed }) => [styles.imagePlaceholder, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
              >
                <Feather name="image" size={22} color={theme.textSecondary} />
                <Text style={[styles.imageText, { color: theme.textSecondary }]}>Tap to add photo</Text>
              </Pressable>
            )}

            {/* Price */}
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Price</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              <View style={styles.groupRow}>
                <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>Amount (MYR)</Text>
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
            </View>
          </>
        )}

        {/* FYP Survey fields */}
        {isSurvey && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Survey link</Text>
            <View style={[styles.group, { backgroundColor: theme.card, borderColor: surveyUrlError ? '#FF453A' : undefined, borderWidth: surveyUrlError ? 1 : 0 }]}>
              <TextInput
                style={[styles.urlInput, { color: theme.text }]}
                placeholder="Paste your Google Forms / Typeform link…"
                placeholderTextColor={theme.textSecondary + '88'}
                value={surveyUrl}
                onChangeText={setSurveyUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            {surveyUrlError ? (
              <Text style={[styles.hint, { color: '#FF453A' }]}>{surveyUrlError}</Text>
            ) : surveyUrl.trim() && !surveyUrlError ? (
              <Text style={[styles.hint, { color: '#30D158' }]}>✓ Valid link</Text>
            ) : (
              <Text style={[styles.hint, { color: theme.textSecondary }]}>Google Forms · Typeform · MS Forms · SurveyMonkey · Tally · Jotform · Qualtrics</Text>
            )}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Survey topic</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              <TextInput
                style={[styles.bodyInput, { color: theme.text }]}
                placeholder="e.g. Student mental health at public universities in Malaysia"
                placeholderTextColor={theme.textSecondary + '88'}
                value={surveyTopic}
                onChangeText={setSurveyTopic}
                maxLength={200}
                multiline
                textAlignVertical="top"
              />
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Respondents needed</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              <View style={styles.groupRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{surveyQuota} respondents</Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Disappears automatically when reached</Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setSurveyQuota((q) => Math.max(5, q - 5))}
                    style={[styles.stepBtn, { backgroundColor: theme.backgroundSecondary ?? theme.background }]}
                  >
                    <Feather name="minus" size={16} color={theme.text} />
                  </Pressable>
                  <Text style={[styles.stepValue, { color: theme.text }]}>{surveyQuota}</Text>
                  <Pressable
                    onPress={() => setSurveyQuota((q) => Math.min(500, q + 5))}
                    style={[styles.stepBtn, { backgroundColor: theme.backgroundSecondary ?? theme.background }]}
                  >
                    <Feather name="plus" size={16} color={theme.text} />
                  </Pressable>
                </View>
              </View>
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>Min 5 · Max 500 · Default 30</Text>
          </>
        )}

        {/* Offers & Responses — hide for surveys */}
        {!isSurvey && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Offers & responses</Text>
            <View style={[styles.group, { backgroundColor: theme.card }]}>
              {isEditing ? (
                <View style={[styles.groupRow, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>Mode (locked)</Text>
                    <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                      {negotiationMode === 'open_service'
                        ? 'Open marketplace — multiple listings & feedback; post ends after 7 days.'
                        : 'Standard — you accept one provider for the job.'}
                    </Text>
                  </View>
                </View>
              ) : kind === 'offer' ? (
                <>
                  <Pressable onPress={() => setNegotiationMode('standard')} style={({ pressed }) => [styles.groupRow, { alignItems: 'flex-start' }, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.iconCircle, { backgroundColor: '#0A84FF18' }]}>
                      <Feather name="check-circle" size={16} color="#0A84FF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>Normal</Text>
                      <Text style={[styles.rowSub, { color: theme.textSecondary }]}>One client when they accept your offer — usual flow.</Text>
                    </View>
                    {negotiationMode === 'standard' ? <Feather name="check-circle" size={18} color="#0A84FF" /> : <View style={[styles.radio, { borderColor: theme.border }]} />}
                  </Pressable>
                  <View style={[styles.hairline, { backgroundColor: theme.border, marginLeft: 52 }]} />
                  <Pressable onPress={() => setNegotiationMode('open_service')} style={({ pressed }) => [styles.groupRow, { alignItems: 'flex-start' }, pressed && { opacity: 0.7 }]}>
                    <View style={[styles.iconCircle, { backgroundColor: '#30D15818' }]}>
                      <Feather name="users" size={16} color="#30D158" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>Open marketplace</Text>
                      <Text style={[styles.rowSub, { color: theme.textSecondary }]}>Many students can list rates and leave feedback; post ends after 7 days.</Text>
                    </View>
                    {negotiationMode === 'open_service' ? <Feather name="check-circle" size={18} color="#30D158" /> : <View style={[styles.radio, { borderColor: theme.border }]} />}
                  </Pressable>
                </>
              ) : (
                <View style={[styles.groupRow, { alignItems: 'flex-start' }]}>
                  <View style={[styles.iconCircle, { backgroundColor: '#0A84FF18' }]}>
                    <Feather name="info" size={16} color="#0A84FF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>How offers work</Text>
                    <Text style={[styles.rowSub, { color: theme.textSecondary }]}>People send offers on your request; you accept one to assign the job and chat.</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Location & deadline */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>Location & timing</Text>
        <View style={[styles.group, { backgroundColor: theme.card }]}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            <LocationUniCampusBlock
              universityId={formUniversityId}
              campusId={formCampusId}
              locationDetail={location}
              onUniversityIdChange={setFormUniversityId}
              onCampusIdChange={(id, name) => { setFormCampusId(id); setCampusNameResolved(name); }}
              onLocationDetailChange={setLocation}
              accentColor={activeCat.tint}
            />
          </View>

          <View style={[styles.hairline, { backgroundColor: theme.border }]} />

          <View style={styles.groupRow}>
            <Feather name="clock" size={16} color={activeCat.tint} style={{ marginRight: 12 }} />
            <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>Timing</Text>
            <View style={styles.segmented}>
              <Pressable
                onPress={() => setDeadlineType('asap')}
                style={[styles.segmentBtn, { borderColor: theme.border }, deadlineType === 'asap' && { backgroundColor: theme.text, borderColor: theme.text }]}
              >
                <Text style={[styles.segmentText, { color: theme.textSecondary }, deadlineType === 'asap' && { color: theme.background }]}>ASAP</Text>
              </Pressable>
              <Pressable
                onPress={() => { setDeadlineType('later'); if (!deadline) setDeadline(new Date()); }}
                style={[styles.segmentBtn, { borderColor: theme.border }, deadlineType === 'later' && { backgroundColor: theme.text, borderColor: theme.text }]}
              >
                <Text style={[styles.segmentText, { color: theme.textSecondary }, deadlineType === 'later' && { color: theme.background }]}>Set time</Text>
              </Pressable>
            </View>
          </View>

          {deadlineType === 'later' && (
            <>
              <View style={[styles.hairline, { backgroundColor: theme.border }]} />
              <Pressable
                onPress={() => setShowDeadlinePicker((v) => !v)}
                style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.rowTitle, { color: theme.text, flex: 1, marginLeft: 28 }]}>Date & Time</Text>
                <Text style={[styles.rowValue, { color: theme.primary }]}>
                  {deadline ? formatDateTime(deadline) : 'Not set'}
                </Text>
                <Feather name={showDeadlinePicker ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} style={{ marginLeft: 4 }} />
              </Pressable>
              {Platform.OS === 'ios' && showDeadlinePicker && (
                <View style={[styles.inlinePicker, { borderTopColor: theme.border }]}>
                  <DateTimePicker
                    value={deadline || new Date()}
                    mode="datetime"
                    display="spinner"
                    minimumDate={new Date()}
                    themeVariant={dark ? 'dark' : 'light'}
                    accentColor={activeKind.tint}
                    onChange={(_, d) => { if (d) setDeadline(d); }}
                  />
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
                    if (e.type === 'set' && d) { setDeadline(d); setShowTimePicker(true); }
                  }}
                />
              )}
              {Platform.OS === 'android' && showTimePicker && (
                <DateTimePicker
                  value={deadline || new Date()}
                  mode="time"
                  display="default"
                  onChange={(e, d) => {
                    setShowTimePicker(false);
                    if (e.type === 'set' && d) {
                      const newD = deadline || new Date();
                      newD.setHours(d.getHours());
                      newD.setMinutes(d.getMinutes());
                      setDeadline(new Date(newD));
                    }
                  }}
                />
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageScroll: { paddingHorizontal: 16 },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  heroCenter: { flex: 1, alignItems: 'center' },
  heroTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  heroSub: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  cancelText: { fontSize: 17, fontWeight: '400' },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  postBtn: {
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 20, minWidth: 58,
    alignItems: 'center', justifyContent: 'center',
  },
  postBtnText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  // ── Section labels ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 13, fontWeight: '400',
    marginBottom: 6, marginTop: 20, paddingLeft: 4,
  },

  // ── Group card ────────────────────────────────────────────────────────────
  group: {
    borderRadius: 12, overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
    }),
  },
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, minHeight: 50,
  },
  hairline: { height: StyleSheet.hairlineWidth },

  // ── Row text ─────────────────────────────────────────────────────────────
  rowTitle: { fontSize: 17, fontWeight: '400' },
  rowSub: { fontSize: 13, fontWeight: '400', marginTop: 2, lineHeight: 17 },
  rowValue: { fontSize: 17, fontWeight: '400', marginRight: 4 },
  iconCircle: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },

  // ── Category chips ────────────────────────────────────────────────────────
  catScroll: { flexDirection: 'row', gap: 8, paddingRight: 4, paddingBottom: 2 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18, borderWidth: StyleSheet.hairlineWidth,
  },
  catText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },

  // ── Inputs ────────────────────────────────────────────────────────────────
  titleInput: {
    fontSize: 17, fontWeight: '600', letterSpacing: -0.3,
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 50,
  },
  urlInput: {
    fontSize: 15, fontWeight: '400',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 50,
  },
  bodyInput: {
    fontSize: 15, lineHeight: 22,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, minHeight: 88,
  },
  amountInput: { fontSize: 17, fontWeight: '500', padding: 0, minWidth: 100 },

  // ── Image ─────────────────────────────────────────────────────────────────
  heroWrap: { borderRadius: 12, overflow: 'hidden', height: 160, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroActions: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 8 },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  heroBtnText: { fontSize: 13, fontWeight: '600' },
  imagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 10,
    height: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  imageText: { fontSize: 15, fontWeight: '400' },

  // ── Segmented timing ──────────────────────────────────────────────────────
  segmented: { flexDirection: 'row', gap: 8 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  segmentText: { fontSize: 13, fontWeight: '600' },

  // ── Stepper ───────────────────────────────────────────────────────────────
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 16, fontWeight: '700', minWidth: 36, textAlign: 'center' },

  // ── Misc ─────────────────────────────────────────────────────────────────
  hint: { fontSize: 12, marginTop: 5, paddingLeft: 4, lineHeight: 16, marginBottom: 2 },
  inlinePicker: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingBottom: 8 },

  // legacy compatibility
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
});

