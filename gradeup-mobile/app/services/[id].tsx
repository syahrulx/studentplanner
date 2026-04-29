import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  ActionSheetIOS,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import {
  getCategory,
  formatPrice,
  statusMeta,
  getViewerRole,
  type ServicePost,
  type ServiceReview,
} from '@/src/lib/servicesApi';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDateLong(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function ServiceDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = user?.id || null;

  const [service, setService] = useState<ServicePost | null>(null);
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, r] = await Promise.all([
        servicesApi.fetchService(id),
        servicesApi.fetchReviewsForService(id),
      ]);
      setService(s);
      setReviews(r);
    } catch (e) {
      console.error('[ServiceDetail] load error:', e);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  if (loading || !service) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  const role = getViewerRole(service, userId);
  const cat = getCategory(service.service_category);
  const sm = statusMeta(service.service_status);
  const isOpen = service.service_status === 'open';
  const isClaimed = service.service_status === 'claimed';
  const isCompleted = service.service_status === 'completed';
  const isCancelled = service.service_status === 'cancelled';

  const myReview = reviews.find((r) => r.reviewer_id === userId);
  const canReview = isCompleted && (role === 'requester' || role === 'taker') && !myReview;

  // ─── Actions ──────────────────────────────────────────────────────────────
  const wrap = async (label: string, fn: () => Promise<void>, success?: string) => {
    setActing(true);
    try {
      await fn();
      if (success) Alert.alert('Done', success);
      await load();
    } catch (e: any) {
      Alert.alert(label + ' failed', e.message || 'Something went wrong');
    } finally {
      setActing(false);
    }
  };

  const onClaim = () =>
    Alert.alert(
      service.service_kind === 'offer' ? 'Take this offer?' : 'Take this request?',
      service.service_kind === 'offer'
        ? `You're agreeing to receive this offer. The provider (${service.author_name}) will be notified.`
        : `You're agreeing to handle this request. The requester (${service.author_name}) will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take it', onPress: () => wrap('Claim', () => servicesApi.claimService(service.id)) },
      ]
    );

  const onUnclaim = () =>
    Alert.alert(
      'Release this?',
      'It will become available for someone else to take.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', style: 'destructive', onPress: () => wrap('Release', () => servicesApi.unclaimService(service.id)) },
      ]
    );

  const onComplete = () =>
    Alert.alert(
      'Mark as completed?',
      'Confirm this service was delivered. You can leave a rating after.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => wrap('Complete', () => servicesApi.completeService(service.id), 'Service completed.') },
      ]
    );

  const onCancel = () =>
    Alert.alert(
      'Cancel this service?',
      'This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel service', style: 'destructive', onPress: () => wrap('Cancel', () => servicesApi.cancelService(service.id)) },
      ]
    );

  const onEdit = () => router.push({ pathname: '/services/new', params: { editId: service.id } } as any);

  const showRequesterMenu = () => {
    if (!service) return;
    const canEdit = isOpen;
    const canCancel = isOpen || isClaimed;
    const options: string[] = ['Cancel'];
    const actions: (() => void)[] = [() => {}];
    if (canEdit) {
      options.push('Edit service');
      actions.push(onEdit);
    }
    if (canCancel) {
      options.push('Cancel service');
      actions.push(onCancel);
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: canCancel ? options.length - 1 : undefined,
        },
        (idx) => actions[idx]?.()
      );
    } else {
      Alert.alert(
        'Manage service',
        undefined,
        options.map((label, i) => ({
          text: label,
          style: i === 0 ? 'cancel' : i === options.length - 1 && canCancel ? 'destructive' : 'default',
          onPress: actions[i],
        })) as any
      );
    }
  };

  const submitReview = async () => {
    if (!service) return;
    const reviewee = role === 'requester' ? service.claimed_by : service.author_id;
    if (!reviewee) return;
    setReviewSubmitting(true);
    try {
      await servicesApi.submitReview({
        service_id: service.id,
        reviewee_id: reviewee,
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewOpen(false);
      setReviewComment('');
      setReviewRating(5);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ─── CTA config based on (role, status) ──────────────────────────────────
  // Requester actions (edit/cancel) live in the action sheet via the "more" button,
  // so the bottom CTA is reserved for primary forward actions only.
  const cta: { label: string; icon: string; onPress: () => void; color: string; secondary?: boolean } | null = (() => {
    if (role === 'observer' && isOpen) {
      return {
        label: service.service_kind === 'offer' ? 'Take this offer' : 'Take this request',
        icon: 'check',
        onPress: onClaim,
        color: '#0A84FF',
      };
    }
    if (role === 'taker' && isClaimed) {
      return { label: 'Release claim', icon: 'rotate-ccw', onPress: onUnclaim, color: '#FF453A', secondary: true };
    }
    if (role === 'requester' && isClaimed) {
      return { label: 'Mark as completed', icon: 'check-circle', onPress: onComplete, color: '#30D158' };
    }
    return null;
  })();

  // Status banner — when there's no actionable CTA, give the user context.
  const statusBanner: { label: string; icon: string; tint: string } | null = (() => {
    if (cta) return null;
    if (role === 'requester' && isOpen) {
      return { label: 'Waiting for someone to take this', icon: 'clock', tint: '#FF9F0A' };
    }
    if (isCompleted) return { label: 'This service is completed', icon: 'check-circle', tint: '#0A84FF' };
    if (isCancelled) return { label: 'This service was cancelled', icon: 'x-circle', tint: '#8E8E93' };
    if (role === 'observer' && isClaimed) {
      return { label: 'Already taken by someone else', icon: 'lock', tint: '#8E8E93' };
    }
    return null;
  })();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]} numberOfLines={1}>
          Service
        </Text>
        <View style={{ width: 26, alignItems: 'flex-end' }}>
          {role === 'requester' && (isOpen || isClaimed) && (
            <Pressable onPress={showRequesterMenu} hitSlop={10}>
              <Feather name="more-horizontal" size={22} color={theme.text} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        {service.image_url ? (
          <View style={styles.heroWrap}>
            <Image source={{ uri: service.image_url }} style={styles.heroImg} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)']}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.heroChips}>
              <View style={[styles.chipFilled, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
                <Feather
                  name={service.service_kind === 'offer' ? 'gift' : 'help-circle'}
                  size={11}
                  color="#1c1c1e"
                />
                <Text style={[styles.chipText, { color: '#1c1c1e' }]}>
                  {service.service_kind === 'offer' ? 'Offering' : 'Requesting'}
                </Text>
              </View>
              <View style={[styles.chipFilled, { backgroundColor: sm.tint }]}>
                <Text style={[styles.chipText, { color: '#fff' }]}>{sm.label}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.heroPlaceholder, { backgroundColor: cat.tint + '14' }]}>
            <Text style={{ fontSize: 56 }}>{cat.emoji}</Text>
            <View style={styles.heroChipsAlt}>
              <View style={[styles.chipPlain, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Feather
                  name={service.service_kind === 'offer' ? 'gift' : 'help-circle'}
                  size={11}
                  color={theme.text}
                />
                <Text style={[styles.chipText, { color: theme.text }]}>
                  {service.service_kind === 'offer' ? 'Offering' : 'Requesting'}
                </Text>
              </View>
              <View style={[styles.chipFilled, { backgroundColor: sm.tint }]}>
                <Text style={[styles.chipText, { color: '#fff' }]}>{sm.label}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Title block */}
        <View style={styles.section}>
          <Text style={[styles.title, { color: theme.text }]}>{service.title}</Text>
          {service.body ? (
            <Text style={[styles.body, { color: theme.textSecondary }]}>{service.body}</Text>
          ) : null}
        </View>

        {/* Quick info chips */}
        <View style={styles.section}>
          <View style={styles.metaRow}>
            <View style={[styles.metaChip, { backgroundColor: cat.tint + '14' }]}>
              <Text style={{ fontSize: 13 }}>{cat.emoji}</Text>
              <Text style={[styles.metaChipText, { color: cat.tint }]}>{cat.label}</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="dollar-sign" size={11} color={theme.text} />
              <Text style={[styles.metaChipText, { color: theme.text }]}>{formatPrice(service)}</Text>
            </View>
            {service.deadline_at && (
              <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="clock" size={11} color={theme.text} />
                <Text style={[styles.metaChipText, { color: theme.text }]}>
                  By {formatDateLong(service.deadline_at)}
                </Text>
              </View>
            )}
            {service.location && (
              <View style={[styles.metaChip, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name="map-pin" size={11} color={theme.text} />
                <Text style={[styles.metaChipText, { color: theme.text }]}>{service.location}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status timeline */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>STATUS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TimelineRow
              icon="plus"
              label="Posted"
              meta={timeAgo(service.created_at)}
              tint={theme.textSecondary}
              textColor={theme.text}
              metaColor={theme.textSecondary}
            />
            {(service.claimed_at || isClaimed || isCompleted) && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />
                <TimelineRow
                  icon="user-check"
                  label={service.claimer_name ? `${service.claimer_name} took this` : 'Taken'}
                  meta={service.claimed_at ? timeAgo(service.claimed_at) : ''}
                  tint="#FF9F0A"
                  textColor={theme.text}
                  metaColor={theme.textSecondary}
                />
              </>
            )}
            {isCompleted && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />
                <TimelineRow
                  icon="check-circle"
                  label="Completed"
                  meta={service.completed_at ? timeAgo(service.completed_at) : ''}
                  tint="#0A84FF"
                  textColor={theme.text}
                  metaColor={theme.textSecondary}
                />
              </>
            )}
            {isCancelled && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />
                <TimelineRow
                  icon="x-circle"
                  label="Cancelled"
                  meta={service.cancelled_at ? timeAgo(service.cancelled_at) : ''}
                  tint="#8E8E93"
                  textColor={theme.text}
                  metaColor={theme.textSecondary}
                />
              </>
            )}
          </View>
        </View>

        {/* People */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>PEOPLE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.personRow}>
              <Avatar name={service.author_name} avatarUrl={service.author_avatar || undefined} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.personName, { color: theme.text }]}>
                  {service.author_id === userId ? 'You' : service.author_name}
                </Text>
                <Text style={[styles.personRole, { color: theme.textSecondary }]}>
                  {service.service_kind === 'offer' ? 'Provider' : 'Requester'}
                  {service.author_university ? `  ·  ${service.author_university.toUpperCase()}` : ''}
                </Text>
              </View>
            </View>
            {service.claimed_by && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border, marginLeft: 16 + 40 + 12 }]} />
                <View style={styles.personRow}>
                  <Avatar name={service.claimer_name} avatarUrl={service.claimer_avatar || undefined} size={40} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.personName, { color: theme.text }]}>
                      {service.claimed_by === userId ? 'You' : service.claimer_name}
                    </Text>
                    <Text style={[styles.personRole, { color: theme.textSecondary }]}>
                      {service.service_kind === 'offer' ? 'Receiver' : 'Provider'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Reviews */}
        {(reviews.length > 0 || canReview) && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>REVIEWS</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {reviews.map((r, i) => (
                <React.Fragment key={r.id}>
                  {i > 0 && <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />}
                  <View style={styles.reviewRow}>
                    <Avatar name={r.reviewer_name} avatarUrl={r.reviewer_avatar || undefined} size={32} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.reviewerName, { color: theme.text }]}>{r.reviewer_name}</Text>
                        <View style={{ flexDirection: 'row' }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Feather
                              key={n}
                              name="star"
                              size={11}
                              color={n <= r.rating ? '#FFB800' : theme.border}
                              style={{ marginRight: 1 }}
                            />
                          ))}
                        </View>
                      </View>
                      {r.comment ? (
                        <Text style={[styles.reviewText, { color: theme.textSecondary }]}>{r.comment}</Text>
                      ) : null}
                    </View>
                  </View>
                </React.Fragment>
              ))}
              {canReview && (
                <>
                  {reviews.length > 0 && <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />}
                  <Pressable
                    onPress={() => setReviewOpen(true)}
                    style={({ pressed }) => [styles.addReviewRow, pressed && { opacity: 0.7 }]}
                  >
                    <Feather name="star" size={16} color="#FFB800" />
                    <Text style={[styles.addReviewText, { color: theme.text }]}>Leave a review</Text>
                    <Feather name="chevron-right" size={16} color={theme.textSecondary} />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA / status banner */}
      {cta ? (
        <View style={[styles.ctaWrap, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <Pressable
            onPress={cta.onPress}
            disabled={acting}
            style={({ pressed }) => [
              styles.ctaBtn,
              cta.secondary
                ? { backgroundColor: 'transparent', borderColor: cta.color, borderWidth: 1.5 }
                : { backgroundColor: cta.color },
              pressed && { opacity: 0.85 },
              acting && { opacity: 0.5 },
            ]}
          >
            {acting ? (
              <ActivityIndicator size="small" color={cta.secondary ? cta.color : '#fff'} />
            ) : (
              <>
                <Feather name={cta.icon as any} size={17} color={cta.secondary ? cta.color : '#fff'} />
                <Text style={[styles.ctaText, { color: cta.secondary ? cta.color : '#fff' }]}>
                  {cta.label}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : statusBanner ? (
        <View style={[styles.ctaWrap, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={[styles.statusBanner, { backgroundColor: statusBanner.tint + '14', borderColor: statusBanner.tint + '33' }]}>
            <Feather name={statusBanner.icon as any} size={16} color={statusBanner.tint} />
            <Text style={[styles.statusBannerText, { color: statusBanner.tint }]}>
              {statusBanner.label}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Review modal */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReviewOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Leave a review</Text>
            <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
              Rate{role === 'requester' ? ' your taker' : ' the requester'}.
            </Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setReviewRating(n)} hitSlop={6}>
                  <Feather
                    name="star"
                    size={36}
                    color={n <= reviewRating ? '#FFB800' : theme.border}
                    style={{ marginHorizontal: 4 }}
                  />
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.reviewInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              placeholder="Optional comment"
              placeholderTextColor={theme.textSecondary}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              onPress={submitReview}
              disabled={reviewSubmitting}
              style={({ pressed }) => [
                styles.reviewSubmit,
                { backgroundColor: theme.text },
                pressed && { opacity: 0.85 },
                reviewSubmitting && { opacity: 0.5 },
              ]}
            >
              {reviewSubmitting ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text style={[styles.reviewSubmitText, { color: theme.background }]}>Submit</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TimelineRow(props: {
  icon: string;
  label: string;
  meta?: string;
  tint: string;
  textColor: string;
  metaColor: string;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineIcon, { backgroundColor: props.tint + '22' }]}>
        <Feather name={props.icon as any} size={14} color={props.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.timelineLabel, { color: props.textColor }]}>{props.label}</Text>
        {props.meta ? (
          <Text style={[styles.timelineMeta, { color: props.metaColor }]}>{props.meta}</Text>
        ) : null}
      </View>
    </View>
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
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },

  // Hero
  heroWrap: { width: '100%', height: 240, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroPlaceholder: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroChips: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroChipsAlt: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chipFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipPlain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: -0.1 },

  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 8,
    paddingLeft: 4,
  },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 30 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 10 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  metaChipText: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timelineIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timelineLabel: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  timelineMeta: { fontSize: 12, marginTop: 1 },
  timelineSep: { height: StyleSheet.hairlineWidth, marginLeft: 16 + 30 + 12 },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  personName: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  personRole: { fontSize: 12, fontWeight: '500', marginTop: 1 },

  reviewRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 },
  reviewerName: { fontSize: 14, fontWeight: '600' },
  reviewText: { fontSize: 13, lineHeight: 19, marginTop: 4 },

  addReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addReviewText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Sticky CTA
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  ctaText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusBannerText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },

  // Review modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(120,120,128,0.4)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sheetSub: { fontSize: 14, marginTop: 4 },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 22,
  },
  reviewInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  reviewSubmit: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewSubmitText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
});
