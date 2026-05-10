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
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';
import { useApp } from '@/src/context/AppContext';
import { Avatar } from '@/components/Avatar';
import * as servicesApi from '@/src/lib/servicesApi';
import * as eventsApi from '@/src/lib/eventsApi';
import * as communityApi from '@/src/lib/communityApi';
import {
  getCategory,
  formatPrice,
  formatAgreedPrice,
  statusMeta,
  getViewerRole,
  getDeadlineStatus,
} from '@/src/lib/servicesApi';
import type { ServicePost, ServiceReview, ServiceOffer, OpenListingFeedbackSummary } from '@/src/lib/servicesApi';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDateLong(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const REPORT_SERVICE_HELP_COPY =
  'Use reports for serious issues: scams, harassment, illegal requests, hate speech, impersonation, or spam. ' +
  'Include enough detail for moderators to understand the problem.\n\n' +
  'Reports are visible to administrators, who can remove this service from the marketplace if it violates our rules. ' +
  'False or abusive reports may be penalized.';

/** Shown in the form; first line of submitted `reason` text for admins. */
const SERVICE_REPORT_TYPES = [
  { id: 'harassment', label: 'Harassment or abuse' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'illegal', label: 'Illegal content or requests' },
  { id: 'spam', label: 'Spam or misleading listing' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'other', label: 'Something else' },
] as const;

function formatServiceReportReason(typeLabel: string, details: string): string {
  return `Report type: ${typeLabel}\n\nWhat happened:\n${details}`;
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
  const [openListingFeedbackSummary, setOpenListingFeedbackSummary] =
    useState<OpenListingFeedbackSummary | null>(null);
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
  const [deliveryOfferId, setDeliveryOfferId] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportTypeId, setReportTypeId] = useState<(typeof SERVICE_REPORT_TYPES)[number]['id'] | null>(null);
  const [reportBody, setReportBody] = useState('');
  const [universityLabel, setUniversityLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, r, oRes, u] = await Promise.all([
        servicesApi.fetchService(id),
        servicesApi.fetchReviewsForService(id),
        servicesApi.fetchOffersForService(id),
        userId ? servicesApi.fetchUnreadChatCount(id, userId) : Promise.resolve(0),
      ]);
      setService(s);
      setReviews(r);
      setOffers(oRes.offers);
      setOpenListingFeedbackSummary(oRes.openListingFeedbackSummary);
      setUnreadCount(u);
    } catch (e) {
      console.error('[ServiceDetail] load error:', e);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, [load])
  );

  useEffect(() => {
    if (!service?.university_id) {
      setUniversityLabel(null);
      return;
    }
    let cancelled = false;
    eventsApi.fetchUniversities().then((list) => {
      if (cancelled) return;
      const u = list.find((x) => x.id === service.university_id);
      setUniversityLabel(u?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [service?.university_id]);

  const openListingThumbTotals = React.useMemo(() => {
    let up = 0;
    let down = 0;
    for (const o of offers) {
      if (o.status === 'pending' && (o.offer_kind ?? 'exclusive') === 'open_listing') {
        up += o.feedback_up_count ?? 0;
        down += o.feedback_down_count ?? 0;
      }
    }
    return { up, down };
  }, [offers]);

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

  /** Show aggregate listing feedback on the Posted chip (next to Tutoring / price). */
  const showMarketplaceMetaFeedback =
    isOpen && service.service_negotiation_mode === 'open_service';

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
      `Scope: ${service.title}\n\nDisclaimer: Rencana does not handle payments. All transactions are at your own responsibility. Proceed?`,
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
    Keyboard.dismiss();
    if (!service) return;
    const trimmed = offerAmount.trim();
    const amount = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (Number.isNaN(amount) || (amount as number) < 0)) {
      Alert.alert('Invalid amount', 'Please enter a valid number.');
      return;
    }

    const processSubmit = async () => {
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

    Alert.alert(
      'Platform Disclaimer',
      'Rencana does not handle payments. All monetary transactions and service fulfillments are at your own responsibility.\n\nDo you agree to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'I Agree', onPress: processSubmit },
      ]
    );
  };

  const onAcceptOffer = (offer: ServiceOffer) => {
    const priceDisplay = offer.amount != null ? `${offer.currency || 'MYR'} ${Number(offer.amount).toLocaleString()}` : 'their proposed terms';
    Alert.alert(
      'Accept this offer?',
      `Scope: ${service.title}\nPrice: ${priceDisplay}\nDate: ${service.deadline_at ? new Date(service.deadline_at).toLocaleDateString() : 'Flexible'}\n\nDisclaimer: Rencana does not handle payments. Please handle all transactions safely on your own responsibility. Proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Proceed',
          onPress: () =>
            wrap('Accept offer', async () => {
              await servicesApi.acceptOffer(offer.id);
            }, 'Offer accepted — you can now chat with each other.'),
        },
      ]
    );
  };

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

  const presentListingFeedbackMenu = (offer: ServiceOffer) => {
    if (!userId) return;
    const submit = (worked: boolean) =>
      wrap('Feedback', async () => {
        await servicesApi.recordOfferUse(offer.id, worked);
      });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Worked for me', "Didn't work for me"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: 'Feedback',
          message:
            offer.my_feedback === 'up'
              ? 'You voted thumbs up. You can change your vote.'
              : offer.my_feedback === 'down'
                ? 'You voted thumbs down. You can change your vote.'
                : 'After using this listing, how did it go?',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void submit(true);
          if (buttonIndex === 2) void submit(false);
        }
      );
    } else {
      Alert.alert(
        'Feedback',
        offer.my_feedback
          ? 'You can change your vote.'
          : 'After using this listing, how did it go?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Worked for me', onPress: () => void submit(true) },
          {
            text: "Didn't work for me",
            style: 'destructive',
            onPress: () => void submit(false),
          },
        ]
      );
    }
  };

  /** Post author viewing someone else’s open-listing row: block the offerer or remove their listing. */
  const presentListingOwnerMenu = (offer: ServiceOffer) => {
    if (!userId) return;
    const offererLabel = offer.offerer_name?.trim() || 'This user';

    const confirmBlockOfferer = () => {
      Alert.alert(
        `Block ${offererLabel}?`,
        'They won’t be able to interact with you through friends or community features tied to your account.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () =>
              wrap('Block user', async () => {
                await communityApi.blockUserByUserId(userId, offer.offerer_id);
              }, `${offererLabel} has been blocked.`),
          },
        ]
      );
    };

    const confirmRemoveListing = () => {
      Alert.alert(
        'Remove this listing?',
        'This rate will no longer appear on your post.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => wrap('Remove listing', () => servicesApi.rejectOffer(offer.id)),
          },
        ]
      );
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: offererLabel,
          message: 'This listing is on your post',
          options: ['Cancel', 'Block user', 'Remove listing'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) confirmBlockOfferer();
          if (buttonIndex === 2) confirmRemoveListing();
        }
      );
    } else {
      Alert.alert('Listing on your post', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block user', onPress: confirmBlockOfferer },
        { text: 'Remove listing', style: 'destructive', onPress: confirmRemoveListing },
      ]);
    }
  };

  const presentListingRowMenu = (offer: ServiceOffer) => {
    if (!userId) return;
    const amOfferCreator = offer.offerer_id === userId;
    const amPostAuthor = service.author_id === userId;
    if (amPostAuthor && !amOfferCreator) {
      presentListingOwnerMenu(offer);
      return;
    }
    presentListingFeedbackMenu(offer);
  };

  /** Opens the in-app chat room once a service is claimed. */
  const openChat = () => {
    router.push(`/services/chat/${service.id}`);
  };

  /** 1:1 chat for an open-listing offer row (post author ↔ that offer’s participant). */
  const openOfferDm = (offerId: string) => {
    router.push(`/services/offer-dm/${offerId}`);
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

    const processImage = async (uri: string) => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 5 * 1024 * 1024) {
          Alert.alert('File too large', 'Image must be under 5MB.');
          return;
        }
      } catch (e) {
        console.error('File size check failed', e);
      }
      setDeliveryImages((prev) => [...prev, uri]);
    };

    Alert.alert('Attach Proof', 'Choose an image source', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take Photo',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Permission Denied', 'Camera access is required.');
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.5,
            });
            if (!result.canceled && result.assets[0]) {
              await processImage(result.assets[0].uri);
            }
          } catch (e) {
            Alert.alert('Camera Unavailable', 'The camera is not available on this device or simulator.');
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
          });
          if (!result.canceled && result.assets[0]) {
            await processImage(result.assets[0].uri);
          }
        },
      },
    ]);
  };

  const handleDeliverySubmit = async () => {
    setDeliverySubmitting(true);
    try {
      if (deliveryOfferId) {
        await servicesApi.submitOfferDelivery(deliveryOfferId, {
          note: deliveryNote.trim() || undefined,
          attachmentUris: deliveryImages.length > 0 ? deliveryImages : undefined,
        });
      } else {
        await servicesApi.submitService(service.id, {
          note: deliveryNote.trim() || undefined,
          attachmentUris: deliveryImages.length > 0 ? deliveryImages : undefined,
        });
      }
      setDeliveryOpen(false);
      setDeliveryOfferId(null);
      Alert.alert('Done', 'Work submitted for review.');
      await load();
    } catch (e: any) {
      Alert.alert('Submit failed', e.message || 'Something went wrong');
    } finally {
      setDeliverySubmitting(false);
    }
  };

  const handleApproveOfferDelivery = async (offerId: string) => {
    Alert.alert(
      'Approve Delivery?',
      'Confirm the service was delivered to your satisfaction. This will mark this order as completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => wrap('Approve Delivery', () => servicesApi.approveOfferDelivery(offerId), 'Order completed.') },
      ]
    );
  };



  const handleCancelOffer = async (offerId: string) => {
    Alert.alert(
      'Cancel Order?',
      'Are you sure you want to cancel this order? This action cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => wrap('Cancel Order', () => servicesApi.cancelServiceOffer(offerId), 'Order cancelled.') },
      ]
    );
  };

  const onApproveWork = () =>
    Alert.alert(
      'Approve Delivery?',
      'Confirm the service was delivered to your satisfaction. This will mark the service as completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => wrap('Approve Delivery', () => servicesApi.approveService(service.id), 'Service completed.') },
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
    setReportTypeId(null);
    setReportBody('');
    setReportOpen(true);
  };

  const submitReport = async () => {
    if (!reportTypeId) {
      Alert.alert('Report type', 'Choose what kind of issue this is so we can route it correctly.');
      return;
    }
    const details = reportBody.trim();
    if (!details) {
      Alert.alert('Details required', 'Please describe what happened so moderators can review your report.');
      return;
    }
    const typeLabel = SERVICE_REPORT_TYPES.find((t) => t.id === reportTypeId)?.label ?? reportTypeId;
    const reason = formatServiceReportReason(typeLabel, details);
    setActing(true);
    try {
      await servicesApi.reportService(service.id, reason);
      setReportOpen(false);
      setReportTypeId(null);
      setReportBody('');
      Alert.alert(
        'Thank you',
        'We’ve received your report — thank you for helping keep the community safe. Our team will review it. You may not get a personal reply, but we take every report seriously.'
      );
      await load();
    } catch (e: any) {
      Alert.alert('Report failed', e.message || 'Something went wrong');
    } finally {
      setActing(false);
    }
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

    const menuExplainer =
      'Need to flag this listing? Choose “Report service” — you’ll pick a report type and describe what happened. ' +
      'Reports go to our team; we may remove services that break community rules (scams, harassment, illegal content, spam). ' +
      'False reports can affect your account.';

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructiveIndices.length > 0 ? destructiveIndices : undefined,
          title: 'Manage service',
          message: menuExplainer,
        },
        (idx) => actions[idx]?.()
      );
    } else {
      Alert.alert('Manage service', menuExplainer, options.map((label, i) => ({
        text: label,
        style: i === 0 ? 'cancel' : destructiveIndices.includes(i) ? 'destructive' : 'default',
        onPress: actions[i],
      })) as any);
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
      return { label: 'Approve Delivery', icon: 'check-circle', onPress: onApproveWork, color: '#30D158' };
    }
    if (isProvider && isClaimed) {
      return { label: 'Deliver Order', icon: 'upload', onPress: onSubmitWork, color: theme.primary };
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
  const primaryOnColor = theme.textInverse;

  // Status banner — when there's no actionable CTA, give the user context.
  const statusBanner: { label: string; icon: string; tint: string } | null = (() => {
    if (cta) return null;
    if (role === 'requester' && isOpen) {
      if (service.service_negotiation_mode === 'open_service') {
        return {
          label: 'Open marketplace — listings stay up until the post ends',
          icon: 'users',
          tint: '#FF9F0A',
        };
      }
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
          <View style={styles.metaRowTop}>
            <View style={styles.metaRowLeft}>
              <View style={[styles.metaChip, { backgroundColor: cat.tint + '14' }]}>
                <Feather name={cat.icon as any} size={13} color={cat.tint} />
                <Text style={[styles.metaChipText, { color: cat.tint }]}>{cat.label}</Text>
              </View>
              <View
                style={[
                  styles.metaChip,
                  {
                    backgroundColor: theme.primary + '14',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.primary + '33',
                  },
                ]}
              >
                <Text style={[styles.metaChipText, { color: theme.primary, fontWeight: '600' }]}>
                  {(isClaimed || isCompleted || isSubmitted) ? formatAgreedPrice(service) : formatPrice(service)}
                </Text>
              </View>
            </View>

            <View style={styles.metaRowRightCluster}>
              <View
                style={[
                  styles.metaChip,
                  styles.metaPostedChip,
                  {
                    backgroundColor: theme.card,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.metaPostedInner}>
                  <Feather name="clock" size={12} color={theme.textSecondary} />
                  <Text
                    style={[styles.metaChipText, { color: theme.textSecondary, fontWeight: '600' }]}
                    numberOfLines={1}
                  >
                    Posted · {timeAgo(service.created_at)}
                  </Text>
                  {showMarketplaceMetaFeedback ? (
                    <>
                      <Text style={[styles.metaChipText, { color: theme.textSecondary }]}> · </Text>
                      <Feather name="thumbs-up" size={12} color={theme.textSecondary} />
                      <Text style={[styles.metaChipText, { color: theme.textSecondary, fontWeight: '600' }]}>
                        {openListingThumbTotals.up}
                      </Text>
                      <Feather name="thumbs-down" size={12} color={theme.textSecondary} style={{ marginLeft: 6 }} />
                      <Text style={[styles.metaChipText, { color: theme.textSecondary, fontWeight: '600' }]}>
                        {openListingThumbTotals.down}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
          </View>

          {service.deadline_at ? (
            <View style={styles.metaDeadlineRow}>
              <View style={styles.priceDivider} />
              <View>
                <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>DEADLINE</Text>
                <Text style={[styles.priceDeadline, { color: theme.text }]}>{formatDateLong(service.deadline_at)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {isOpen && service.service_negotiation_mode === 'open_service' && service.open_service_expires_at ? (
          <View style={styles.section}>
            <View
              style={[
                styles.openServiceBanner,
                { backgroundColor: theme.primary + '16', borderColor: theme.primary + '40' },
              ]}
            >
              <Feather name="users" size={18} color={theme.primary} style={{ marginTop: 1 }} />
              <Text style={[styles.openServiceBannerText, { color: theme.text }]}>
                Open marketplace · ends {formatDateLong(service.open_service_expires_at)} · create a new post after it
                closes to keep going
              </Text>
            </View>
          </View>
        ) : null}

        {(service.university_id || service.campus || service.location) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>WHERE</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.whereBlock, { borderBottomColor: theme.border }]}>
                <Text style={[styles.whereKey, { color: theme.textSecondary }]}>University</Text>
                <Text style={[styles.whereVal, { color: theme.text }]} numberOfLines={3}>
                  {universityLabel || service.university_id || '—'}
                </Text>
              </View>
              <View style={[styles.whereBlock, { borderBottomColor: theme.border }]}>
                <Text style={[styles.whereKey, { color: theme.textSecondary }]}>Campus</Text>
                <Text style={[styles.whereVal, { color: theme.text }]} numberOfLines={3}>
                  {service.campus || '—'}
                </Text>
              </View>
              <View style={styles.whereBlockLast}>
                <Text style={[styles.whereKey, { color: theme.textSecondary }]}>Specific place</Text>
                <Text style={[styles.whereVal, { color: theme.text }]} numberOfLines={4}>
                  {service.location || '—'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

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
        {(isSubmitted || isCompleted) && (service.author_id === userId || service.claimed_by === userId) && (
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
                  <Feather name="message-circle" size={14} color={primaryOnColor} />
                  <Text style={[styles.chatChipText, { color: primaryOnColor }]}>Chat</Text>
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
                      <Feather name="message-circle" size={14} color={primaryOnColor} />
                      <Text style={[styles.chatChipText, { color: primaryOnColor }]}>Chat</Text>
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

        {/* Offers: exclusive (one winner) + open listings (reusable, usage count) */}
        {(() => {
          const okind = (o: ServiceOffer) => o.offer_kind ?? 'exclusive';
          const pendingOffers = offers.filter((o) => o.status === 'pending');
          const exclusivePending = pendingOffers.filter((o) => okind(o) === 'exclusive');
          const visibleListings = offers.filter((o) => okind(o) === 'open_listing' && ['pending', 'accepted', 'submitted', 'completed'].includes(o.status));

          const myExclusiveOffer = exclusivePending.find((o) => o.offerer_id === userId);
          const showExclusiveRequester = role === 'requester' && isOpen && exclusivePending.length > 0;
          const showExclusiveObserverMine = role === 'observer' && !!myExclusiveOffer;
          const showExclusiveSection = showExclusiveRequester || showExclusiveObserverMine;
          const visibleExclusive = showExclusiveRequester
            ? exclusivePending
            : myExclusiveOffer
              ? [myExclusiveOffer]
              : [];

          const showListingSection = !!userId && isOpen && visibleListings.length > 0;

          if (!showExclusiveSection && !showListingSection) return null;

          return (
            <>
              {showExclusiveSection && (
                <View style={styles.section}>
                  <View style={styles.offersHeaderRow}>
                    <Text style={[styles.sectionHeader, { color: theme.textSecondary, marginBottom: 0 }]}>
                      {showExclusiveRequester ? `OFFERS · ${exclusivePending.length}` : 'YOUR OFFER'}
                    </Text>
                  </View>

                  <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {visibleExclusive.map((o, idx) => {
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
                                {o.offerer_rating ? (
                                  <Text style={{ fontWeight: 'normal', fontSize: 13, color: theme.textSecondary }}>
                                    {' '}
                                    · ⭐ {o.offerer_rating} ({o.offerer_reviews})
                                  </Text>
                                ) : null}
                              </Text>
                              <Text style={[styles.offerAmount, { color: theme.primary }]}>{amountLabel}</Text>
                              {o.message ? (
                                <Text style={[styles.offerMsg, { color: theme.textSecondary }]} numberOfLines={3}>
                                  {o.message}
                                </Text>
                              ) : null}
                            </View>

                            {showExclusiveRequester ? (
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
              )}

              {showListingSection && (
                <View style={styles.section}>
                  <View style={styles.offersHeaderRow}>
                    <Text style={[styles.sectionHeader, { color: theme.textSecondary, marginBottom: 0 }]}>
                      OPEN LISTINGS · {visibleListings.length}
                    </Text>
                  </View>

                  {openListingFeedbackSummary != null &&
                    !(
                      !!userId &&
                      visibleListings.length > 0 &&
                      visibleListings.every((row) => row.offerer_id === userId)
                    ) && (
                    <View
                      style={[
                        styles.card,
                        styles.feedbackSummaryCard,
                        { backgroundColor: theme.card, borderColor: theme.border },
                      ]}
                    >
                      <View style={[styles.feedbackSummaryIconWrap, { backgroundColor: theme.primary + '18' }]}>
                        <Feather name="thumbs-up" size={20} color={theme.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.feedbackSummaryLabel, { color: theme.textSecondary }]}>FEEDBACK</Text>
                        <Text style={[styles.feedbackSummaryMain, { color: theme.text }]}>
                          {openListingFeedbackSummary.thumbsUp} thumbs up ·{' '}
                          {openListingFeedbackSummary.thumbsDown} thumbs down
                        </Text>
                        {openListingFeedbackSummary.preview.length > 0 ? (
                          <View style={[styles.feedbackFaceRow, { marginTop: 10 }]}>
                            {openListingFeedbackSummary.preview.map((f) => (
                              <Avatar
                                key={f.user_id}
                                name={f.name}
                                avatarUrl={f.avatar_url || undefined}
                                size={28}
                              />
                            ))}
                            {openListingFeedbackSummary.positiveContributors >
                            openListingFeedbackSummary.preview.length ? (
                              <Text style={[styles.feedbackMoreHint, { color: theme.textSecondary }]}>
                                +
                                {openListingFeedbackSummary.positiveContributors -
                                  openListingFeedbackSummary.preview.length}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  )}

                  <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {visibleListings.map((o, idx) => {
                      const amountLabel =
                        o.amount != null
                          ? `${o.currency || 'MYR'} ${Number(o.amount).toLocaleString()}`
                          : 'Open to your terms';
                      /** User who created this open-listing row (their rate on this post). */
                      const isOfferCreator = !!userId && o.offerer_id === userId;
                      const canListingFeedback = !!userId;

                      const isServiceOffer = service.service_kind === 'offer';
                      const isServiceRequest = service.service_kind === 'request';
                      const amIAuthor = service.author_id === userId;
                      const amIOfferer = o.offerer_id === userId;
                      
                      const canAcceptOffer = o.status === 'pending' && amIAuthor;
                      const canSubmitWork = o.status === 'accepted' && ((isServiceOffer && amIAuthor) || (isServiceRequest && amIOfferer));
                      const canApproveWork = o.status === 'submitted' && ((isServiceOffer && amIOfferer) || (isServiceRequest && amIAuthor));
                      const canCancelOffer = (o.status === 'accepted' || o.status === 'submitted') && (amIAuthor || amIOfferer);

                      return (
                        <React.Fragment key={o.id}>
                          {idx > 0 && (
                            <View style={[styles.timelineSep, { backgroundColor: theme.border, marginLeft: 16 + 36 + 10 }]} />
                          )}
                          <View style={styles.listingOfferOuter}>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                              <Avatar name={o.offerer_name} avatarUrl={o.offerer_avatar || undefined} size={36} />
                              <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 8,
                                  }}
                                >
                                  <Text style={[styles.offerName, { color: theme.text, flex: 1, paddingRight: 4 }]}>
                                    {isOfferCreator ? 'You' : o.offerer_name || 'Someone'}
                                    {o.offerer_rating ? (
                                      <Text style={{ fontWeight: 'normal', fontSize: 13, color: theme.textSecondary }}>
                                        {' '}
                                        · ⭐ {o.offerer_rating} ({o.offerer_reviews})
                                      </Text>
                                    ) : null}
                                  </Text>
                                  {canListingFeedback ? (
                                    <Pressable
                                      onPress={() => presentListingRowMenu(o)}
                                      disabled={acting}
                                      hitSlop={10}
                                      accessibilityLabel={
                                        service.author_id === userId && o.offerer_id !== userId
                                          ? 'Listing options'
                                          : 'Feedback'
                                      }
                                      style={({ pressed }) => [pressed && { opacity: 0.65 }]}
                                    >
                                      <Feather name="more-vertical" size={22} color={theme.textSecondary} />
                                    </Pressable>
                                  ) : null}
                                </View>
                                <Text style={[styles.listingPostedMeta, { color: theme.textSecondary, marginTop: 6 }]}>
                                  Posted {timeAgo(o.created_at)}
                                </Text>
                                <Text style={[styles.offerAmount, { color: theme.primary, marginTop: 6 }]}>
                                  {amountLabel}
                                </Text>
                                {o.message ? (
                                  <Text style={[styles.offerMsg, { color: theme.textSecondary }]} numberOfLines={4}>
                                    {o.message}
                                  </Text>
                                ) : null}

                                {o.status === 'accepted' && (
                                  <View style={{ marginTop: 8, backgroundColor: theme.primary + '15', padding: 6, borderRadius: 6, alignSelf: 'flex-start' }}>
                                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>IN PROGRESS</Text>
                                  </View>
                                )}

                                {o.status === 'completed' && (
                                  <View style={{ marginTop: 8, backgroundColor: '#30D15815', padding: 6, borderRadius: 6, alignSelf: 'flex-start' }}>
                                    <Text style={{ color: '#30D158', fontSize: 11, fontWeight: '700' }}>COMPLETED</Text>
                                  </View>
                                )}

                                {(o.status === 'submitted' || o.status === 'completed') && (amIAuthor || amIOfferer) && (
                                  <View style={{ marginTop: 8, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, padding: 10, borderRadius: 8 }}>
                                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>
                                      {o.status === 'completed' ? 'DELIVERED WORK' : 'DELIVERY SUBMITTED'}
                                    </Text>
                                    {o.delivery_note ? (
                                      <Text style={{ color: theme.text, fontSize: 13 }}>{o.delivery_note}</Text>
                                    ) : null}
                                    {o.delivery_attachments && o.delivery_attachments.length > 0 && (
                                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                        {o.delivery_attachments.map((url, i) => (
                                          <Pressable key={i} onPress={() => setFullscreenImage(url)} style={{ marginRight: 8 }}>
                                            <Image source={{ uri: url }} style={{ width: 60, height: 60, borderRadius: 6 }} />
                                          </Pressable>
                                        ))}
                                      </ScrollView>
                                    )}
                                  </View>
                                )}
                              </View>
                            </View>

                            <View style={[styles.offerActions, styles.listingOfferActionsRow, { flexWrap: 'wrap', gap: 8 }]}>
                              {(service.author_id === userId || o.offerer_id === userId) && (
                                <View style={styles.listingMsgBtnWrap}>
                                  <Pressable
                                    onPress={() => openOfferDm(o.id)}
                                    style={({ pressed }) => [
                                      styles.listingMsgBtn,
                                      { borderColor: theme.primary },
                                      pressed && { opacity: 0.85 },
                                    ]}
                                  >
                                    <Feather name="message-circle" size={14} color={theme.primary} />
                                    <Text style={[styles.listingMsgBtnText, { color: theme.primary }]}>Message</Text>
                                  </Pressable>
                                  {(o.offer_dm_unread ?? 0) > 0 ? (
                                    <View style={[styles.offerDmUnreadBadge, { backgroundColor: theme.danger }]}>
                                      <Text style={styles.offerDmUnreadBadgeText}>
                                        {(o.offer_dm_unread ?? 0) > 99
                                          ? '99+'
                                          : String(o.offer_dm_unread)}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              )}

                              {isOfferCreator && o.status === 'pending' && (
                                <>
                                  <Pressable
                                    onPress={openOfferModal}
                                    style={({ pressed }) => [styles.offerBtnGhost, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                  >
                                    <Feather name="edit-2" size={14} color={theme.text} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => onWithdrawOffer(o)}
                                    style={({ pressed }) => [styles.offerBtnGhost, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                  >
                                    <Feather name="trash-2" size={14} color={theme.danger} />
                                  </Pressable>
                                </>
                              )}

                              {canAcceptOffer && (
                                <>
                                  <Pressable
                                    onPress={() => onRejectOffer(o)}
                                    disabled={acting}
                                    style={({ pressed }) => [styles.offerBtnGhost, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                  >
                                    <Feather name="x" size={14} color={theme.textSecondary} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => onAcceptOffer(o)}
                                    disabled={acting}
                                    style={({ pressed }) => [styles.offerBtnSolid, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                                  >
                                    <Feather name="check" size={14} color={theme.textInverse} />
                                    <Text style={[styles.offerBtnSolidText, { color: theme.textInverse }]}>Accept</Text>
                                  </Pressable>
                                </>
                              )}

                              {canSubmitWork && (
                                <Pressable
                                  onPress={() => { setDeliveryOfferId(o.id); setDeliveryOpen(true); }}
                                  style={({ pressed }) => [styles.offerBtnSolid, { backgroundColor: theme.primary }, pressed && { opacity: 0.85 }]}
                                >
                                  <Feather name="upload-cloud" size={14} color={theme.textInverse} />
                                  <Text style={[styles.offerBtnSolidText, { color: theme.textInverse }]}>Deliver</Text>
                                </Pressable>
                              )}

                              {canApproveWork && (
                                <Pressable
                                  onPress={() => handleApproveOfferDelivery(o.id)}
                                  disabled={acting}
                                  style={({ pressed }) => [styles.offerBtnSolid, { backgroundColor: '#30D158' }, pressed && { opacity: 0.85 }]}
                                >
                                  <Feather name="check-circle" size={14} color="#fff" />
                                  <Text style={[styles.offerBtnSolidText, { color: '#fff' }]}>Approve</Text>
                                </Pressable>
                              )}



                              {canCancelOffer && (
                                <Pressable
                                  onPress={() => handleCancelOffer(o.id)}
                                  disabled={acting}
                                  style={({ pressed }) => [styles.offerBtnGhost, { borderColor: theme.border }, pressed && { opacity: 0.7 }]}
                                >
                                  <Feather name="x-circle" size={14} color={theme.danger} />
                                  <Text style={[styles.offerBtnGhostText, { color: theme.danger }]}>Cancel</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
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
              <ActivityIndicator size="small" color={cta.secondary ? cta.color : primaryOnColor} />
            ) : (
              <>
                <Feather name={cta.icon as any} size={18} color={cta.secondary ? cta.color : primaryOnColor} />
                <Text style={[styles.ctaText, { color: cta.secondary ? cta.color : primaryOnColor }]}>
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

      {/* Report service modal (all platforms — includes guidance text; Android has no Alert.prompt) */}
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => !acting && setReportOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !acting && setReportOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.grabber} />
              <Text style={[styles.sheetTitle, { color: theme.text }]}>Report this service</Text>
              <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
                Reports help keep the marketplace safe. Moderators review each submission and can remove listings that violate our guidelines.
              </Text>
              <ScrollView
                style={styles.reportScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                <Text style={[styles.reportLabel, { color: theme.text, marginTop: 4 }]}>What are you reporting?</Text>
                <View style={styles.reportTypeWrap}>
                  {SERVICE_REPORT_TYPES.map((t) => {
                    const selected = reportTypeId === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => !acting && setReportTypeId(t.id)}
                        style={({ pressed }) => [
                          styles.reportTypeChip,
                          {
                            borderColor: selected ? theme.primary : theme.border,
                            backgroundColor: selected ? theme.primary : theme.backgroundSecondary,
                          },
                          pressed && !acting && { opacity: 0.85 },
                          acting && { opacity: 0.6 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.reportTypeChipText,
                            { color: selected ? theme.textInverse : theme.text },
                          ]}
                          numberOfLines={2}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.reportLabel, { color: theme.text, marginTop: 4 }]}>Describe what happened</Text>
                <Text style={[styles.reportFieldHint, { color: theme.textSecondary }]}>
                  Required — type details here so moderators can review.
                </Text>
                <TextInput
                  style={[styles.reviewInput, styles.reportDetailsInput, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                  placeholder="e.g. asks for payment outside the app, abusive language, misleading description…"
                  placeholderTextColor={theme.textSecondary}
                  value={reportBody}
                  onChangeText={setReportBody}
                  multiline
                  textAlignVertical="top"
                  editable={!acting}
                />
                <Text style={[styles.reportExplain, { color: theme.textSecondary, marginTop: 12 }]}>{REPORT_SERVICE_HELP_COPY}</Text>
              </ScrollView>
              <View style={styles.reportActions}>
                <Pressable
                  onPress={() => !acting && setReportOpen(false)}
                  style={({ pressed }) => [
                    styles.reportBtnGhost,
                    { borderColor: theme.border, backgroundColor: theme.backgroundSecondary },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.reportBtnGhostText, { color: theme.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitReport}
                  disabled={acting}
                  style={({ pressed }) => [
                    styles.reportBtnPrimary,
                    { backgroundColor: theme.primary },
                    pressed && { opacity: 0.85 },
                    acting && { opacity: 0.55 },
                  ]}
                >
                  {acting ? (
                    <ActivityIndicator size="small" color={theme.textInverse} />
                  ) : (
                    <Text style={[styles.reportBtnPrimaryText, { color: theme.textInverse }]}>Submit report</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Review modal */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setReviewOpen(false); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { Keyboard.dismiss(); setReviewOpen(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 8 : 0}
          >
            <Pressable
              style={[styles.sheet, { backgroundColor: theme.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView
                style={styles.sheetFormScroll}
                contentContainerStyle={styles.sheetFormScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
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

                <Pressable onPress={Keyboard.dismiss} style={({ pressed }) => [styles.keyboardDismissLink, pressed && { opacity: 0.65 }]} hitSlop={10}>
                  <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '700' }}>Hide keyboard</Text>
                </Pressable>

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
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Offer modal */}
      <Modal visible={offerOpen} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setOfferOpen(false); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { Keyboard.dismiss(); setOfferOpen(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 8 : 0}
          >
            <Pressable
              style={[styles.sheet, { backgroundColor: theme.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView
                style={styles.sheetFormScroll}
                contentContainerStyle={styles.sheetFormScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.grabber} />
                <Text style={[styles.sheetTitle, { color: theme.text }]}>
                  {myPendingOffer ? 'Update your offer' : service.price_type === 'fixed' ? 'Accept this price' : 'Make an offer'}
                </Text>
                <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
                  {service.price_type === 'fixed' && service.price_amount != null
                    ? `Asking price is ${service.currency || 'MYR'} ${Number(service.price_amount).toLocaleString()}. Match it or counter.`
                    : service.service_kind === 'offer'
                    ? 'Propose what you\u2019re willing to pay.'
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
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
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
                  placeholder={service.service_kind === 'offer' ? "e.g. I need this done by tonight please" : "e.g. I can do it tonight after class"}
                  placeholderTextColor={theme.textSecondary}
                  value={offerMessage}
                  onChangeText={setOfferMessage}
                  multiline
                  textAlignVertical="top"
                />

                <Pressable onPress={Keyboard.dismiss} style={({ pressed }) => [styles.keyboardDismissLink, pressed && { opacity: 0.65 }]} hitSlop={10}>
                  <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '700' }}>Hide keyboard</Text>
                </Pressable>

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
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Delivery submission modal */}
      <Modal visible={deliveryOpen} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setDeliveryOpen(false); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { Keyboard.dismiss(); setDeliveryOpen(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 8 : 0}
          >
            <Pressable
              style={[styles.sheet, { backgroundColor: theme.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <ScrollView
                style={styles.sheetFormScroll}
                contentContainerStyle={styles.sheetFormScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <View style={styles.grabber} />
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Deliver Order</Text>
                <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
                  Add a note and attach proof of your delivery (photos, screenshots).{'\n'}
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

                <Pressable onPress={Keyboard.dismiss} style={({ pressed }) => [styles.keyboardDismissLink, pressed && { opacity: 0.65 }]} hitSlop={10}>
                  <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '700' }}>Hide keyboard</Text>
                </Pressable>

                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  ATTACHMENTS ({deliveryImages.length}/3)
                </Text>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
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
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
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
  whereBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  whereBlockLast: { paddingHorizontal: 16, paddingVertical: 12 },
  whereKey: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  whereVal: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, lineHeight: 21 },

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
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  /** Bottom sheets with text fields: cap height so content can scroll above the keyboard */
  sheetFormScroll: {
    maxHeight: 460,
  },
  sheetFormScrollContent: {
    flexGrow: 0,
    paddingBottom: 12,
  },
  keyboardDismissLink: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    marginTop: 2,
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

  reportScroll: { maxHeight: 400, marginTop: 8 },
  reportFieldHint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  reportDetailsInput: { minHeight: 110 },
  reportTypeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 12,
    marginHorizontal: -4,
  },
  reportTypeChip: {
    margin: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  reportTypeChipText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  reportExplain: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  reportLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  reportActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  reportBtnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtnGhostText: { fontSize: 15, fontWeight: '700' },
  reportBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtnPrimaryText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

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
  openServiceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  openServiceBannerText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  listingMsgBtnWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  listingMsgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  offerDmUnreadBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  offerDmUnreadBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  listingMsgBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },
  listingOfferOuter: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listingPostedMeta: { fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },
  listingOfferActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  feedbackSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  feedbackSummaryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  feedbackSummaryMain: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  feedbackFaceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  feedbackMoreHint: { fontSize: 12, fontWeight: '700', marginLeft: 2 },
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
  
  metaRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  metaRowRightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
  },
  metaPostedChip: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  metaPostedInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 4,
  },
  metaDeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  metaChipText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },
});
