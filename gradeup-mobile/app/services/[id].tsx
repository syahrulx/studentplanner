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
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import {
  getCategory,
  formatPrice,
  formatAgreedPrice,
  statusMeta,
  getViewerRole,
  getDeadlineStatus,
} from '@/src/lib/servicesApi';
import type { ServicePost, ServiceReview, ServiceOffer } from '@/src/lib/servicesApi';

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
  const [offers, setOffers] = useState<ServiceOffer[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Offer state
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);

  // Delivery submission state
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliveryImages, setDeliveryImages] = useState<string[]>([]);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, r, o, u] = await Promise.all([
        servicesApi.fetchService(id),
        servicesApi.fetchReviewsForService(id),
        servicesApi.fetchOffersForService(id),
        userId ? servicesApi.fetchUnreadChatCount(id, userId) : Promise.resolve(0),
      ]);
      setService(s);
      setReviews(r);
      setOffers(o);
      setUnreadCount(u);
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
  const isSubmitted = service.service_status === 'submitted';
  const isCompleted = service.service_status === 'completed';
  const isCancelled = service.service_status === 'cancelled';

  let attachments: string[] = [];
  try {
    if (typeof service.delivery_attachments === 'string') {
      attachments = JSON.parse(service.delivery_attachments);
    } else if (Array.isArray(service.delivery_attachments)) {
      attachments = service.delivery_attachments;
    }
  } catch (e) {}

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

  /** For "free" services, claim directly (no negotiation needed). */
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

  /** Open the offer modal pre-filled with the asking price (if any). */
  const openOfferModal = () => {
    const myPending = offers.find((o) => o.offerer_id === userId && o.status === 'pending');
    if (myPending) {
      setOfferAmount(myPending.amount != null ? String(myPending.amount) : '');
      setOfferMessage(myPending.message || '');
    } else if (service.price_type === 'fixed' && service.price_amount != null) {
      setOfferAmount(String(service.price_amount));
      setOfferMessage('');
    } else {
      setOfferAmount('');
      setOfferMessage('');
    }
    setOfferOpen(true);
  };

  const submitOffer = async () => {
    if (!service) return;
    const trimmed = offerAmount.trim();
    const amount = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (Number.isNaN(amount) || (amount as number) < 0)) {
      Alert.alert('Invalid amount', 'Please enter a valid number.');
      return;
    }
    setOfferSubmitting(true);
    try {
      await servicesApi.makeOffer({
        service_id: service.id,
        amount,
        message: offerMessage.trim() || null,
      });
      setOfferOpen(false);
      setOfferAmount('');
      setOfferMessage('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not send offer', e.message || 'Something went wrong');
    } finally {
      setOfferSubmitting(false);
    }
  };

  const onAcceptOffer = (offer: ServiceOffer) =>
    Alert.alert(
      'Accept this offer?',
      `You're agreeing to ${offer.offerer_name} at ${
        offer.amount != null ? `${offer.currency || 'MYR'} ${Number(offer.amount).toLocaleString()}` : 'their proposed terms'
      }. Other pending offers will be auto-rejected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () =>
            wrap('Accept offer', async () => {
              await servicesApi.acceptOffer(offer.id);
            }, 'Offer accepted — you can now chat with each other.'),
        },
      ]
    );

  const onRejectOffer = (offer: ServiceOffer) =>
    Alert.alert(
      'Reject this offer?',
      `${offer.offerer_name}'s offer will be marked as rejected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => wrap('Reject offer', () => servicesApi.rejectOffer(offer.id)),
        },
      ]
    );

  const onWithdrawOffer = (offer: ServiceOffer) =>
    Alert.alert(
      'Withdraw your offer?',
      'You can submit a new one later if the service is still open.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => wrap('Withdraw offer', () => servicesApi.withdrawOffer(offer.id)),
        },
      ]
    );

  /** Opens the in-app chat room once a service is claimed. */
  const openChat = () => {
    router.push(`/services/chat/${service.id}`);
  };

  const onUnclaim = () =>
    Alert.alert(
      'Release this?',
      'It will become available for someone else to take.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', style: 'destructive', onPress: () => wrap('Release', () => servicesApi.unclaimService(service.id)) },
      ]
    );

  const clientLabel = service.service_kind === 'offer' ? 'client' : 'requester';

  const onSubmitWork = () => {
    setDeliveryNote('');
    setDeliveryImages([]);
    setDeliveryOpen(true);
  };

  const pickDeliveryImage = async () => {
    if (deliveryImages.length >= 3) {
      Alert.alert('Limit reached', 'You can attach up to 3 images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setDeliveryImages((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleDeliverySubmit = async () => {
    setDeliverySubmitting(true);
    try {
      await servicesApi.submitService(service.id, {
        note: deliveryNote.trim() || undefined,
        attachmentUris: deliveryImages.length > 0 ? deliveryImages : undefined,
      });
      setDeliveryOpen(false);
      Alert.alert('Done', 'Work submitted for review.');
      await load();
    } catch (e: any) {
      Alert.alert('Submit failed', e.message || 'Something went wrong');
    } finally {
      setDeliverySubmitting(false);
    }
  };

  const onApproveWork = () =>
    Alert.alert(
      'Approve Work?',
      'Confirm the service was delivered to your satisfaction. You can leave a rating afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => wrap('Approve Work', () => servicesApi.approveService(service.id), 'Service completed.') },
      ]
    );

  const onRejectWork = () => {
    Alert.prompt(
      'Reject Work?',
      `Tell the provider why their submission needs revision.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: (reason?: string) => wrap('Reject Work', () => servicesApi.rejectService(service.id, reason || 'Requires revision')) },
      ],
      'plain-text'
    );
  };

  const onQuit = () =>
    Alert.alert(
      'Drop this task?',
      'This will reopen the task for others and notify the requester.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Drop Task', style: 'destructive', onPress: () => wrap('Drop Task', () => servicesApi.quitService(service.id)) },
      ]
    );

  const onRequestCancel = () =>
    Alert.alert(
      'Request Cancellation?',
      'Since the task is in progress, the other party must agree to cancel it.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Request Cancel', style: 'destructive', onPress: () => wrap('Request Cancel', () => servicesApi.requestCancelService(service.id)) },
      ]
    );

  const onAcceptCancel = () =>
    Alert.alert(
      'Accept Cancellation?',
      'The service will be permanently cancelled.',
      [
        { text: 'Reject Request', style: 'cancel' },
        { text: 'Accept', style: 'destructive', onPress: () => wrap('Accept Cancel', () => servicesApi.acceptCancelService(service.id)) },
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

  const onReport = () => {
    Alert.prompt(
      'Report Service',
      'Please tell us why this service is inappropriate or violates our guidelines.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Report', 
          style: 'destructive', 
          onPress: (reason?: string) => {
            if (!reason?.trim()) return Alert.alert('Error', 'Reason is required.');
            wrap('Report Service', () => servicesApi.reportService(service.id, reason), 'Service reported.');
          } 
        },
      ],
      'plain-text'
    );
  };

  const showMenu = () => {
    if (!service) return;
    // Derive client/provider: for requests author=client, for offers claimer=client
    const menuIsClient = (service.service_kind === 'request' && role === 'requester') ||
                         (service.service_kind === 'offer' && role === 'taker');
    const menuIsProvider = (service.service_kind === 'request' && role === 'taker') ||
                           (service.service_kind === 'offer' && role === 'requester');

    const canEdit = isOpen && role === 'requester';
    const canCancelDirectly = isOpen && role === 'requester';
    const canRequestCancel = (isClaimed || isSubmitted) && !service.cancel_requested_by && (role === 'requester' || role === 'taker');
    const isCancelRequestedByOther = service.cancel_requested_by && service.cancel_requested_by !== userId;
    
    const canUnclaim = isClaimed && role === 'taker' && service.accepted_amount == null;
    const canQuit = (isClaimed || isSubmitted) && menuIsProvider;
    const canRejectWork = isSubmitted && menuIsClient;

    const options: string[] = ['Cancel'];
    const actions: (() => void)[] = [() => {}];
    if (canEdit) {
      options.push('Edit service');
      actions.push(onEdit);
    }
    if (canRejectWork) {
      options.push('Reject submitted work');
      actions.push(onRejectWork);
    }
    if (canQuit) {
      options.push('Drop task');
      actions.push(onQuit);
    } else if (canUnclaim) {
      options.push('Release claim');
      actions.push(onUnclaim);
    }
    
    if (isCancelRequestedByOther) {
      options.push('Accept mutual cancellation');
      actions.push(onAcceptCancel);
    } else if (canRequestCancel) {
      options.push('Request mutual cancellation');
      actions.push(onRequestCancel);
    } else if (canCancelDirectly) {
      options.push('Cancel service');
      actions.push(onCancel);
    }
    
    // Anyone can report unless they are the author
    if (role !== 'requester') {
      options.push('Report service');
      actions.push(onReport);
    }

    // Determine destructive indices based on options added
    const destructiveIndices: number[] = [];
    options.forEach((opt, idx) => {
      if (['Reject submitted work', 'Drop task', 'Release claim', 'Cancel service', 'Report service'].includes(opt)) {
        destructiveIndices.push(idx);
      }
    });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructiveIndices.length > 0 ? destructiveIndices : undefined,
        },
        (idx) => actions[idx]?.()
      );
    } else {
      Alert.alert(
        'Manage service',
        undefined,
        options.map((label, i) => ({
          text: label,
          style: i === 0 ? 'cancel' : destructiveIndices.includes(i) ? 'destructive' : 'default',
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
  const myPendingOffer = offers.find((o) => o.offerer_id === userId && o.status === 'pending');
  const isFreeService = service.price_type === 'free';
  const cta: { label: string; icon: string; onPress: () => void; color: string; secondary?: boolean } | null = (() => {
    if (role === 'observer' && isOpen) {
      // Free services: skip negotiation; one-tap claim.
      if (isFreeService) {
        return {
          label: service.service_kind === 'offer' ? 'Take this offer' : 'Take this request',
          icon: 'check',
          onPress: onClaim,
          color: theme.primary,
        };
      }
      // Already submitted an offer — let them edit or withdraw via the modal.
      if (myPendingOffer) {
        return {
          label: 'Update your offer',
          icon: 'edit-2',
          onPress: openOfferModal,
          color: theme.primary,
          secondary: true,
        };
      }
      // Fixed price: encourage acceptance at asking price; modal pre-fills it.
      // Negotiable: prompt user to propose an amount.
      return {
        label: service.price_type === 'fixed' ? 'Accept this price' : 'Make an offer',
        icon: 'tag',
        onPress: openOfferModal,
        color: theme.primary,
      };
    }
    const isClient = (service.service_kind === 'request' && role === 'requester') ||
                     (service.service_kind === 'offer' && role === 'taker');
    const isProvider = !isClient && role !== 'observer';

    if (isClient && isSubmitted) {
      return { label: 'Approve Work', icon: 'check-circle', onPress: onApproveWork, color: '#30D158' };
    }
    if (isProvider && isClaimed) {
      return { label: 'Submit Work', icon: 'upload', onPress: onSubmitWork, color: theme.primary };
    }
    // Accept Cancel CTA — show to the OTHER party when cancellation is requested
    const isCancelRequestedByOther = service.cancel_requested_by && service.cancel_requested_by !== userId;
    if (isCancelRequestedByOther && (role === 'requester' || role === 'taker')) {
      return { label: 'Accept Cancellation', icon: 'x-circle', onPress: onAcceptCancel, color: '#FF453A' };
    }
    // Review nudge — prompt to review after completion
    if (isCompleted && canReview) {
      return { label: 'Leave a Review', icon: 'star', onPress: () => setReviewOpen(true), color: '#FFB800' };
    }
    return null;
  })();

  const deadlineStatus = getDeadlineStatus(service);

  // Status banner — when there's no actionable CTA, give the user context.
  const statusBanner: { label: string; icon: string; tint: string } | null = (() => {
    if (cta) return null;
    if (role === 'requester' && isOpen) {
      return { label: 'Waiting for someone to take this', icon: 'clock', tint: '#FF9F0A' };
    }
    if (isCompleted) return { label: 'This service is completed', icon: 'check-circle', tint: '#0A84FF' };
    if (isCancelled) return { label: 'This service was cancelled', icon: 'x-circle', tint: '#8E8E93' };
    if (role === 'observer' && (isClaimed || isSubmitted)) {
      return { label: 'Already taken by someone else', icon: 'lock', tint: '#8E8E93' };
    }
    if (service.cancel_requested_by) {
      if (service.cancel_requested_by === userId) return { label: 'Waiting for cancellation approval', icon: 'clock', tint: '#FF9F0A' };
    }
    if (isSubmitted && role !== 'observer') {
      return { label: 'Work submitted — pending review', icon: 'search', tint: theme.primary };
    }
    return null;
  })();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: Math.max(insets.top, 12) + 4, backgroundColor: theme.background }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={[styles.navBack, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Feather name="chevron-left" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.navTitle, { color: theme.text }]} numberOfLines={1}>
          {cat.label}
        </Text>
        <View style={{ width: 36, alignItems: 'flex-end' }}>
          {(isOpen || isClaimed || isSubmitted) ? (
            <Pressable
              onPress={showMenu}
              hitSlop={10}
              style={[styles.navBack, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Feather name="more-horizontal" size={18} color={theme.text} />
            </Pressable>
          ) : <View style={{ width: 36 }} />}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {/* Title + meta block */}
        <View style={[styles.section, { marginTop: 24 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <View style={[styles.chipPlain, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Feather name={service.service_kind === 'offer' ? 'gift' : 'help-circle'} size={11} color={theme.text} />
              <Text style={[styles.chipText, { color: theme.text }]}>
                {service.service_kind === 'offer' ? 'Offering' : 'Requesting'}
              </Text>
            </View>
            <View style={[styles.chipFilled, { backgroundColor: sm.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: sm.tint }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sm.tint, marginRight: 2 }} />
              <Text style={[styles.chipText, { color: sm.tint }]}>{sm.label}</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{service.title}</Text>
          {service.body ? (
            <Text style={[styles.body, { color: theme.textSecondary }]}>{service.body}</Text>
          ) : null}
        </View>

        {/* Request Attachment */}
        {service.image_url ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ATTACHMENT</Text>
            <Pressable onPress={() => setFullscreenImage(service.image_url)}>
              <Image 
                source={{ uri: service.image_url }} 
                style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: theme.border }} 
                resizeMode="cover" 
              />
            </Pressable>
          </View>
        ) : null}

        {/* Quick info chips */}
        <View style={styles.section}>
          <View style={styles.metaRow}>
            <View style={[styles.metaChip, { backgroundColor: cat.tint + '14' }]}>
              <Feather name={cat.icon as any} size={13} color={cat.tint} />
              <Text style={[styles.metaChipText, { color: cat.tint }]}>{cat.label}</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: theme.primary + '14', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.primary + '33' }]}>
              <Text style={[styles.metaChipText, { color: theme.primary, fontWeight: '600' }]}>
                {(isClaimed || isCompleted || isSubmitted) ? formatAgreedPrice(service) : formatPrice(service)}
              </Text>
            </View>
            {service.deadline_at && (
              <View style={styles.priceDivider} />
            )}
            {service.deadline_at && (
              <View>
                <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>DEADLINE</Text>
                <Text style={[styles.priceDeadline, { color: theme.text }]}>{formatDateLong(service.deadline_at)}</Text>
              </View>
            )}
            {service.location && (
              <View style={styles.priceDivider} />
            )}
            {service.location && (
              <View>
                <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>LOCATION</Text>
                <Text style={[styles.priceDeadline, { color: theme.text }]} numberOfLines={1}>{service.location}</Text>
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
            {(service.claimed_at || isClaimed || isSubmitted || isCompleted) && (
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
            {(service.submitted_at || isSubmitted || isCompleted) && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border }]} />
                <TimelineRow
                  icon="upload"
                  label="Work Submitted"
                  meta={service.submitted_at ? timeAgo(service.submitted_at) : ''}
                  tint={theme.primary}
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

        {/* Deadline warning badge */}
        {deadlineStatus && isClaimed && (
          <View style={[styles.section, { marginTop: 12 }]}>
            <View style={[styles.card, { 
              backgroundColor: deadlineStatus.urgent ? '#FF453A15' : theme.card, 
              borderColor: deadlineStatus.urgent ? '#FF453A40' : theme.border,
              flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
            }]}>
              <Feather 
                name={deadlineStatus.urgent ? 'alert-triangle' : 'clock'} 
                size={16} 
                color={deadlineStatus.urgent ? '#FF453A' : '#FF9F0A'} 
              />
              <Text style={{ 
                color: deadlineStatus.urgent ? '#FF453A' : theme.text, 
                fontWeight: '600', fontSize: 14, marginLeft: 8 
              }}>
                {deadlineStatus.label}
              </Text>
              {service.revision_count > 0 && (
                <View style={{ marginLeft: 'auto', backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    Revision {service.revision_count}/{service.max_revisions}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Revision tracker (when no deadline) */}
        {!deadlineStatus && service.revision_count > 0 && isClaimed && (
          <View style={[styles.section, { marginTop: 12 }]}>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }]}>
              <Feather name="refresh-cw" size={14} color={theme.textSecondary} />
              <Text style={{ color: theme.text, fontWeight: '600', fontSize: 14, marginLeft: 8 }}>
                Revision {service.revision_count} of {service.max_revisions}
              </Text>
              {service.revision_count >= service.max_revisions && (
                <View style={{ marginLeft: 'auto', backgroundColor: '#FF453A20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ color: '#FF453A', fontSize: 11, fontWeight: '700' }}>LIMIT REACHED</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Delivery submission display */}
        {(isSubmitted || isCompleted) && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>DELIVERY</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {service.delivery_note ? (
                <Text style={{ color: theme.text, fontSize: 15, lineHeight: 22, marginBottom: attachments.length ? 12 : 0, padding: 16 }}>
                  {service.delivery_note}
                </Text>
              ) : null}
              {attachments.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4, padding: 16, paddingTop: service.delivery_note ? 0 : 16 }}>
                  {attachments.map((url: string, idx: number) => (
                    <Pressable 
                      key={idx} 
                      onPress={() => setFullscreenImage(url)}
                      style={{ marginHorizontal: 4 }}
                    >
                      <Image 
                        source={{ uri: url }} 
                        style={{ width: 120, height: 90, borderRadius: 10 }} 
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {!service.delivery_note && attachments.length === 0 && (
                <Text style={{ color: theme.textSecondary, fontSize: 14, padding: 16, fontStyle: 'italic', opacity: 0.7 }}>
                  No note or attachments provided.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* People */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>PEOPLE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.personRow}>
              <Avatar name={service.author_name} avatarUrl={service.author_avatar || undefined} size={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.personName, { color: theme.text }]}>
                    {service.author_id === userId ? 'You' : service.author_name}
                  </Text>
                  {service.author_id === userId && (
                    <View style={[styles.youBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Text style={[styles.youBadgeText, { color: theme.primary }]}>You</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.personRole, { color: theme.textSecondary }]}>
                  {service.service_kind === 'offer' ? 'Service Provider' : 'Client'}
                </Text>
                {(service.author_rating || service.author_university) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    {service.author_rating ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather name="star" size={11} color="#FFB800" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>{service.author_rating.toFixed(1)}</Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>({service.author_reviews})</Text>
                      </View>
                    ) : null}
                    {service.author_university ? (
                      <Text style={{ fontSize: 11, color: theme.textSecondary }}>{service.author_university.toUpperCase()}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {role === 'taker' && (isClaimed || isSubmitted || isCompleted) && service.author_id !== userId && (
                <Pressable
                  onPress={openChat}
                  style={({ pressed }) => [styles.chatChip, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                >
                  <Feather name="message-circle" size={14} color="#fff" />
                  <Text style={styles.chatChipText}>Chat</Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>
            {service.claimed_by && (
              <>
                <View style={[styles.timelineSep, { backgroundColor: theme.border, marginLeft: 16 + 44 + 12 }]} />
                <View style={styles.personRow}>
                  <Avatar name={service.claimer_name} avatarUrl={service.claimer_avatar || undefined} size={44} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.personName, { color: theme.text }]}>
                        {service.claimed_by === userId ? 'You' : service.claimer_name}
                      </Text>
                      {service.claimed_by === userId && (
                        <View style={[styles.youBadge, { backgroundColor: theme.primary + '20' }]}>
                          <Text style={[styles.youBadgeText, { color: theme.primary }]}>You</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.personRole, { color: theme.textSecondary }]}>
                      {service.service_kind === 'offer' ? 'Client' : 'Service Provider'}
                    </Text>
                    {service.claimer_rating ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                        <Feather name="star" size={11} color="#FFB800" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>{service.claimer_rating.toFixed(1)}</Text>
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>({service.claimer_reviews})</Text>
                      </View>
                    ) : null}
                  </View>
                  {role === 'requester' && (isClaimed || isSubmitted || isCompleted) && service.claimed_by !== userId && (
                    <Pressable
                      onPress={openChat}
                      style={({ pressed }) => [styles.chatChip, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                    >
                      <Feather name="message-circle" size={14} color="#fff" />
                      <Text style={styles.chatChipText}>Chat</Text>
                      {unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                        </View>
                      )}
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        {/* Offers (negotiation) */}
        {(() => {
          const pendingOffers = offers.filter((o) => o.status === 'pending');
          const myOffer = offers.find((o) => o.offerer_id === userId && o.status === 'pending');
          const showAsRequester = role === 'requester' && isOpen && pendingOffers.length > 0;
          const showAsObserver = role === 'observer' && !!myOffer;
          if (!showAsRequester && !showAsObserver) return null;

          // What the requester sees: every pending offer with accept/reject controls.
          // What an offerer sees: only their own pending offer with edit/withdraw.
          const visible = showAsRequester ? pendingOffers : myOffer ? [myOffer] : [];

          return (
            <View style={styles.section}>
              <View style={styles.offersHeaderRow}>
                <Text style={[styles.sectionHeader, { color: theme.textSecondary, marginBottom: 0 }]}>
                  {showAsRequester ? `OFFERS · ${pendingOffers.length}` : 'YOUR OFFER'}
                </Text>
              </View>

              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {visible.map((o, idx) => {
                  const amountLabel =
                    o.amount != null
                      ? `${o.currency || 'MYR'} ${Number(o.amount).toLocaleString()}`
                      : 'Open to your terms';
                  const isMine = o.offerer_id === userId;
                  return (
                    <React.Fragment key={o.id}>
                      {idx > 0 && (
                        <View style={[styles.timelineSep, { backgroundColor: theme.border, marginLeft: 16 + 36 + 10 }]} />
                      )}
                      <View style={styles.offerRow}>
                        <Avatar name={o.offerer_name} avatarUrl={o.offerer_avatar || undefined} size={36} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.offerName, { color: theme.text }]}>
                            {isMine ? 'You' : o.offerer_name || 'Someone'}
                            {o.offerer_rating ? <Text style={{fontWeight: 'normal', fontSize: 13, color: theme.textSecondary}}>  ·  ⭐ {o.offerer_rating} ({o.offerer_reviews})</Text> : null}
                          </Text>
                          <Text style={[styles.offerAmount, { color: theme.primary }]}>{amountLabel}</Text>
                          {o.message ? (
                            <Text style={[styles.offerMsg, { color: theme.textSecondary }]} numberOfLines={3}>
                              {o.message}
                            </Text>
                          ) : null}
                        </View>

                        {showAsRequester ? (
                          <View style={styles.offerActions}>
                            <Pressable
                              onPress={() => onRejectOffer(o)}
                              disabled={acting}
                              style={({ pressed }) => [
                                styles.offerBtnGhost,
                                { borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Feather name="x" size={14} color={theme.textSecondary} />
                            </Pressable>
                            <Pressable
                              onPress={() => onAcceptOffer(o)}
                              disabled={acting}
                              style={({ pressed }) => [
                                styles.offerBtnSolid,
                                { backgroundColor: theme.primary },
                                pressed && { opacity: 0.85 },
                              ]}
                            >
                              <Feather name="check" size={14} color={theme.textInverse} />
                              <Text style={[styles.offerBtnSolidText, { color: theme.textInverse }]}>Accept</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.offerActions}>
                            <Pressable
                              onPress={openOfferModal}
                              style={({ pressed }) => [
                                styles.offerBtnGhost,
                                { borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Feather name="edit-2" size={14} color={theme.text} />
                            </Pressable>
                            <Pressable
                              onPress={() => onWithdrawOffer(o)}
                              style={({ pressed }) => [
                                styles.offerBtnGhost,
                                { borderColor: theme.border },
                                pressed && { opacity: 0.7 },
                              ]}
                            >
                              <Feather name="trash-2" size={14} color={theme.danger} />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          );
        })()}

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

      {/* Sticky CTA */}
      {cta ? (
        <View style={[styles.ctaWrap, { borderTopColor: theme.border, backgroundColor: theme.background + 'F5', paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <Pressable
            onPress={cta.onPress}
            disabled={acting}
            style={({ pressed }) => [
              styles.ctaBtn,
              cta.secondary
                ? { backgroundColor: 'transparent', borderColor: cta.color, borderWidth: 2 }
                : { backgroundColor: cta.color },
              pressed && { opacity: 0.88 },
              acting && { opacity: 0.5 },
            ]}
          >
            {acting ? (
              <ActivityIndicator size="small" color={cta.secondary ? cta.color : '#fff'} />
            ) : (
              <>
                <Feather name={cta.icon as any} size={18} color={cta.secondary ? cta.color : '#fff'} />
                <Text style={[styles.ctaText, { color: cta.secondary ? cta.color : '#fff' }]}>
                  {cta.label}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : statusBanner ? (
        <View style={[styles.ctaWrap, { borderTopColor: theme.border, backgroundColor: theme.background + 'F5', paddingBottom: Math.max(insets.bottom, 16) + 4 }]}>
          <View style={[styles.statusBanner, { backgroundColor: statusBanner.tint + '12', borderColor: statusBanner.tint + '30' }]}>
            <Feather name={statusBanner.icon as any} size={15} color={statusBanner.tint} />
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
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
                reviewSubmitting && { opacity: 0.5 },
              ]}
            >
              {reviewSubmitting ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.reviewSubmitText, { color: theme.textInverse }]}>Submit</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Offer modal */}
      <Modal visible={offerOpen} transparent animationType="slide" onRequestClose={() => setOfferOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOfferOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {myPendingOffer ? 'Update your offer' : service.price_type === 'fixed' ? 'Accept this price' : 'Make an offer'}
            </Text>
            <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
              {service.price_type === 'fixed' && service.price_amount != null
                ? `Asking price is ${service.currency || 'MYR'} ${Number(service.price_amount).toLocaleString()}. Match it or counter.`
                : 'Propose what you\u2019re willing to do this for.'}
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>AMOUNT ({service.currency || 'MYR'})</Text>
            <View style={[styles.amountField, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Text style={[styles.amountPrefix, { color: theme.textSecondary }]}>{service.currency || 'MYR'}</Text>
              <TextInput
                style={[styles.amountFieldInput, { color: theme.text }]}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={offerAmount}
                onChangeText={setOfferAmount}
              />
              {offerAmount ? (
                <Pressable onPress={() => setOfferAmount('')} hitSlop={8}>
                  <Feather name="x-circle" size={16} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>MESSAGE (OPTIONAL)</Text>
            <TextInput
              style={[styles.reviewInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              placeholder="e.g. I can do it tonight after class"
              placeholderTextColor={theme.textSecondary}
              value={offerMessage}
              onChangeText={setOfferMessage}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              onPress={submitOffer}
              disabled={offerSubmitting}
              style={({ pressed }) => [
                styles.reviewSubmit,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
                offerSubmitting && { opacity: 0.5 },
              ]}
            >
              {offerSubmitting ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.reviewSubmitText, { color: theme.textInverse }]}>
                  {myPendingOffer ? 'Update offer' : 'Send offer'}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delivery submission modal */}
      <Modal visible={deliveryOpen} transparent animationType="slide" onRequestClose={() => setDeliveryOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDeliveryOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.grabber} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Submit Work</Text>
            <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
              Add a note and attach proof of your work (photos, screenshots).{'\n'}
              The {clientLabel} will review and approve.
            </Text>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>DELIVERY NOTE</Text>
            <TextInput
              style={[styles.reviewInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              placeholder="Describe what you've delivered..."
              placeholderTextColor={theme.textSecondary}
              value={deliveryNote}
              onChangeText={setDeliveryNote}
              multiline
              textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
              ATTACHMENTS ({deliveryImages.length}/3)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {deliveryImages.map((uri, idx) => (
                <View key={idx} style={{ marginRight: 8, position: 'relative' }}>
                  <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10 }} />
                  <Pressable
                    onPress={() => setDeliveryImages((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: '#FF453A', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {deliveryImages.length < 3 && (
                <Pressable
                  onPress={pickDeliveryImage}
                  style={{
                    width: 80, height: 80, borderRadius: 10,
                    borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Feather name="plus" size={24} color={theme.textSecondary} />
                  <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>Add</Text>
                </Pressable>
              )}
            </ScrollView>

            <Pressable
              onPress={handleDeliverySubmit}
              disabled={deliverySubmitting}
              style={({ pressed }) => [
                styles.reviewSubmit,
                { backgroundColor: theme.primary },
                pressed && { opacity: 0.85 },
                deliverySubmitting && { opacity: 0.5 },
              ]}
            >
              {deliverySubmitting ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.reviewSubmitText, { color: theme.textInverse }]}>Submit for Review</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fullscreen Image Modal */}
      <Modal visible={!!fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFullscreenImage(null)} />
          {fullscreenImage && (
            <Image source={{ uri: fullscreenImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          )}
          <Pressable onPress={() => setFullscreenImage(null)} style={{ position: 'absolute', top: Math.max(insets.top, 20) + 10, right: 20, zIndex: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
        </View>
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
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  navBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3, flex: 1, textAlign: 'center', marginHorizontal: 8 },

  // Hero
  heroWrap: { width: '100%', height: 260, position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroPlaceholder: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroEmojiWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
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

  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingLeft: 2,
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 10, opacity: 0.75 },

  // Price hero card
  priceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  priceDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: 'rgba(120,120,128,0.2)',
    marginHorizontal: 16,
  },
  priceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  priceValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  priceDeadline: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },

  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timelineLabel: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  timelineMeta: { fontSize: 12, marginTop: 2, opacity: 0.7 },
  timelineSep: { height: StyleSheet.hairlineWidth, marginLeft: 16 + 32 + 12 },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  personName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  personRole: { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.65 },

  // "You" badge
  youBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  // Chat chip
  chatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chatChipText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.1 },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

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
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  ctaText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
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

  // Offer modal field
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    paddingLeft: 4,
  },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  amountPrefix: { fontSize: 14, fontWeight: '600' },
  amountFieldInput: { flex: 1, fontSize: 17, fontWeight: '600', padding: 0 },

  // Offers section
  offersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingLeft: 4,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offerName: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  offerAmount: { fontSize: 13, fontWeight: '700', marginTop: 2, letterSpacing: -0.1 },
  offerMsg: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  offerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 },
  offerBtnGhost: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBtnSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
  },
  offerBtnSolidText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },

  // WhatsApp chip in PEOPLE rows
  waChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
  },
  waChipText: { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: -0.1 },
  
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  metaChipText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },
});
