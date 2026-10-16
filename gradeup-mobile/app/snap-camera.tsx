import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  Linking,
  BackHandler,
  } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useApp } from '@/src/context/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt';
import { maxSnapsPerDay, isAtLeastPlus } from '@/src/lib/flashcardGenerationLimits';
import { uploadSnapImage, postSnap, getMySnapsToday, getMyStreak } from '@/src/lib/snapApi';
import { captureError } from '@/src/lib/monitoring';
import type { SnapStreak, SnapAudience } from '@/src/types';
import { KeyboardAvoidingScreen } from '@/components/KeyboardAvoidingScreen';
import {
  ColorRow,
  DrawSurface,
  LayoutThumb,
  SNAP_LAYOUTS,
  StrokeView,
  TextSticker,
  cellFrame,
  layoutCells,
  type SnapLayoutId,
  type Stroke,
  type TextItem,
} from '@/components/snap/SnapComposerParts';

export default function SnapCamera() {
  const { user } = useApp();
  const theme = useTheme();
  const { upgradeLabel, ctaLabel, tagline, openPaywall } = useUpgradePrompt();

  const insets = useSafeAreaInsets();
  /** One slot per cell of the chosen layout; null until a photo is added. */
  const [photos, setPhotos] = useState<(string | null)[]>([null]);
  const [layoutId, setLayoutId] = useState<SnapLayoutId>('1');
  const [mode, setMode] = useState<'idle' | 'layout' | 'text' | 'draw'>('idle');
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [editingText, setEditingText] = useState<TextItem | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [inkColor, setInkColor] = useState('#ffffff');
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [dragY, setDragY] = useState<number | null>(null);
  const canvasRef = useRef<View>(null);
  const photoUri = photos.find(Boolean) ?? null;
  const [posting, setPosting] = useState(false);
  /** 200 is the database's own limit — snap_caption_length on study_snaps. */
  const [caption, setCaption] = useState('');
  const [snapsToday, setSnapsToday] = useState(0);
  const [streak, setStreak] = useState<SnapStreak | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLaunchedCamera = useRef(false);

  // Streak celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationStreak, setCelebrationStreak] = useState(0);

  /**
   * Who sees this snap. Chosen per snap, and friends-only every time the
   * screen opens — a student who shared one snap with their campus has not
   * agreed to share the next one, and a setting they set once in April is
   * exactly the kind of thing that gets forgotten.
   */
  const [audience, setAudience] = useState<SnapAudience>('friends');

  // Only offer what the profile can back. The database falls back to
  // friends-only for a student with no university, so offering it here would
  // promise something that silently would not happen.
  const audienceOptions = useMemo(() => {
    const opts: { value: SnapAudience; label: string; icon: 'users' | 'map-pin' | 'home' }[] = [
      { value: 'friends', label: 'Friends', icon: 'users' },
    ];
    if (user?.universityId) {
      if (user.campus) opts.push({ value: 'campus', label: 'My campus', icon: 'map-pin' });
      opts.push({ value: 'university', label: 'My uni', icon: 'home' });
    }
    return opts;
  }, [user?.universityId, user?.campus]);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.3)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const fireScale = useRef(new Animated.Value(0)).current;
  const fireTranslateY = useRef(new Animated.Value(-60)).current;
  const numberTranslateY = useRef(new Animated.Value(80)).current;
  const numberOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelTranslateY = useRef(new Animated.Value(30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const wholeScale = useRef(new Animated.Value(1)).current;

  const plan = user.subscriptionPlan;
  const maxSnaps = maxSnapsPerDay(plan);
  const atLimit = snapsToday >= maxSnaps;
  const snapsLeft = maxSnaps === Infinity ? null : maxSnaps - snapsToday;

  useEffect(() => {
    (async () => {
      const [count, myStreak] = await Promise.all([
        getMySnapsToday(user.id!),
        getMyStreak(user.id!),
      ]);
      setSnapsToday(count);
      setStreak(myStreak);
      setLoading(false);
    })();
  }, [user.id]);

  useEffect(() => {
    if (!loading && !atLimit && !photoUri && !hasLaunchedCamera.current) {
      // Straight to the camera on open, as before. Cancelling now leaves the
      // composer open with an empty box instead of closing the screen.
      hasLaunchedCamera.current = true;
      setTimeout(() => {
        handleOpenCamera();
      }, 300);
    }
  }, [loading, atLimit, photoUri]);

  const runCelebration = (streakCount: number) => {
    setCelebrationStreak(streakCount);
    setShowCelebration(true);

    // Reset
    flashOpacity.setValue(0);
    overlayOpacity.setValue(0);
    glowScale.setValue(0.3);
    glowOpacity.setValue(0);
    fireScale.setValue(0);
    fireTranslateY.setValue(-60);
    numberTranslateY.setValue(80);
    numberOpacity.setValue(0);
    labelOpacity.setValue(0);
    labelTranslateY.setValue(30);
    subtitleOpacity.setValue(0);
    wholeScale.setValue(1);

    // Step 1: Camera flash (0ms) — bright white flash like you just took a photo
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();

    // Step 2: Dark overlay fades in (150ms)
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 350,
      delay: 150,
      useNativeDriver: true,
    }).start();

    // Step 3: Golden glow ring pulses (300ms)
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(glowOpacity, { toValue: 0.6, duration: 400, useNativeDriver: true }),
        Animated.spring(glowScale, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      ]),
      // Pulse loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 0.95, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        { iterations: 2 }
      ),
    ]).start();

    // Step 4: Fire drops in with heavy spring (400ms)
    Animated.parallel([
      Animated.spring(fireScale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.spring(fireTranslateY, {
        toValue: 0,
        friction: 5,
        tension: 50,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 5: Number slides up (700ms)
    Animated.parallel([
      Animated.spring(numberTranslateY, {
        toValue: 0,
        friction: 6,
        tension: 80,
        delay: 700,
        useNativeDriver: true,
      }),
      Animated.timing(numberOpacity, {
        toValue: 1,
        duration: 300,
        delay: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 6: "STREAK" label (900ms)
    Animated.parallel([
      Animated.spring(labelTranslateY, {
        toValue: 0,
        friction: 7,
        tension: 90,
        delay: 900,
        useNativeDriver: true,
      }),
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 250,
        delay: 900,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 7: Subtitle (1200ms)
    Animated.timing(subtitleOpacity, {
      toValue: 1,
      duration: 400,
      delay: 1200,
      useNativeDriver: true,
    }).start();

    // Step 8: Screen pulse (1000ms) — subtle "thump"
    Animated.sequence([
      Animated.delay(700),
      Animated.timing(wholeScale, { toValue: 1.03, duration: 100, useNativeDriver: true }),
      Animated.spring(wholeScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss (2.8s)
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(wholeScale, { toValue: 0.85, duration: 350, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]).start(() => {
        setShowCelebration(false);
        router.back();
      });
    }, 2800);
  };

  const showLimitAlert = () => {
    // The upsell tier depends on where they already are: Free users are being
    // sold Plus, Plus users Pro. Pro users have nothing left to buy.
    const upsellPlan = plan === 'free' ? 'plus' : 'pro';
    const base =
      plan === 'free'
        ? 'Free users get 1 snap per day. Upgrade to Plus for 3, or Pro for unlimited.'
        : `You've posted all ${maxSnaps} snaps for today. ${plan === 'plus' ? 'Upgrade to Pro for unlimited!' : 'Come back tomorrow!'}`;
    Alert.alert(
      'Daily limit reached',
      plan !== 'pro' ? [base, tagline(upsellPlan)].filter(Boolean).join(' ') : base,
      plan !== 'pro'
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: ctaLabel(upsellPlan), onPress: openPaywall },
          ]
        : [{ text: 'OK' }],
    );
  };

  /** Opens the camera and returns the photo, or null if cancelled or refused. */
  const takePhoto = async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to post a snap.');
      return null;
    }
    // launchCameraAsync throws outright when there is no usable camera — no
    // camera at all, or one another app is already holding. Unhandled, the
    // promise rejects and the student is left on a spinner that never ends,
    // with nothing on screen telling them why.
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        allowsEditing: false,
      });
      return !result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null;
    } catch (e) {
      captureError(e, { where: 'snapCamera.launchCamera' });
      Alert.alert('Camera unavailable', 'Your camera could not be opened. Close any other app using it and try again.');
      return null;
    }
  };

  /**
   * Gallery, asked for first. Snaps used to be camera-only, so this is the
   * first time the screen wants the student's photos: say why before the
   * system prompt, and point to Settings if they said no before.
   */
  const pickFromGallery = async (): Promise<string | null> => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      const go = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Use photos from your gallery?',
          'Rencana will ask to see your photos so you can add them to your snap. Only the photos you pick are used.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Continue', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!go) return null;
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Photo access is off',
          'Turn on photo access for Rencana in Settings to add photos from your gallery.',
          perm.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => void Linking.openSettings() },
              ],
        );
        return null;
      }
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      return !result.canceled && result.assets?.[0]?.uri ? result.assets[0].uri : null;
    } catch (e) {
      captureError(e, { where: 'snapCamera.launchImageLibrary' });
      Alert.alert('Gallery unavailable', 'Your photos could not be opened. Try again.');
      return null;
    }
  };

  const setCellPhoto = (index: number, uri: string | null) =>
    setPhotos((prev) => prev.map((p, i) => (i === index ? uri : p)));

  /** First open: straight to the camera, as before. */
  const handleOpenCamera = async () => {
    if (atLimit) {
      showLimitAlert();
      return;
    }
    const uri = await takePhoto();
    if (uri) setCellPhoto(0, uri);
  };

  const fillCell = (index: number) => {
    const filled = !!photos[index];
    // iOS drops a picker or alert opened while this one is still closing,
    // so each choice waits for it to go first.
    const after = (fn: () => Promise<string | null>) => () =>
      setTimeout(async () => {
        const u = await fn();
        if (u) setCellPhoto(index, u);
      }, 450);
    Alert.alert(filled ? 'Change this photo' : 'Add a photo', undefined, [
      { text: 'Take photo', onPress: after(takePhoto) },
      { text: 'Choose from gallery', onPress: after(pickFromGallery) },
      ...(filled ? [{ text: 'Remove', style: 'destructive' as const, onPress: () => setCellPhoto(index, null) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /** Gallery from the rail: into the first empty box, else replace the first. */
  const galleryIntoNext = async () => {
    const uri = await pickFromGallery();
    if (!uri) return;
    const empty = photos.findIndex((p) => !p);
    setCellPhoto(empty >= 0 ? empty : 0, uri);
  };

  const chooseLayout = (id: SnapLayoutId) => {
    const n = layoutCells(id).length;
    setLayoutId(id);
    // Keep the photos already taken, in order; drop any that no longer fit.
    setPhotos((prev) => {
      const kept = prev.filter(Boolean) as string[];
      return Array.from({ length: n }, (_, i) => kept[i] ?? null);
    });
  };

  const handleClose = () => {
    if (!photoUri && texts.length === 0 && strokes.length === 0) {
      router.back();
      return;
    }
    Alert.alert('Discard this snap?', 'Your photos, text and drawing will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  // Android back would drop a half-made snap without asking: ask, like the X.
  const hasWork = !!photoUri || texts.length > 0 || strokes.length > 0;
  useEffect(() => {
    if (!hasWork) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode !== 'idle') {
        if (mode === 'text') finishText();
        else setMode('idle');
        return true;
      }
      handleClose();
      return true;
    });
    return () => sub.remove();
  });

  // ─── Text ────────────────────────────────────────────────────────────────
  const startText = (item?: TextItem) => {
    setEditingText(
      item ?? {
        id: String(Date.now()),
        text: '',
        color: inkColor,
        boxed: false,
        x: Math.max(16, canvasSize.w / 2 - 90),
        y: canvasSize.h * 0.4,
      },
    );
    setMode('text');
  };

  const finishText = () => {
    const item = editingText;
    setEditingText(null);
    setMode('idle');
    if (!item) return;
    const trimmed = item.text.trim();
    setTexts((prev) => {
      const others = prev.filter((t) => t.id !== item.id);
      return trimmed ? [...others, { ...item, text: trimmed }] : others;
    });
  };

  const binTop = canvasSize.h - 150;
  const moveText = (id: string, x: number, y: number, dropped: boolean) => {
    if (dropped && y > binTop) {
      setTexts((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
  };
  const onDragChange = (dragging: boolean, y: number) => setDragY(dragging ? y : null);
  const onStroke = useMemo(() => (st: Stroke) => setStrokes((prev) => [...prev, st]), []);

  // ─── Post ────────────────────────────────────────────────────────────────
  /**
   * The finished snap as one picture. A single photo with nothing on it goes
   * up as taken, at full quality; anything else is captured from the canvas.
   */
  const renderSnapImage = async (): Promise<string> => {
    if (layoutId === '1' && texts.length === 0 && strokes.length === 0 && photos[0]) return photos[0];
    setMode('idle');
    // Let the screen drop any selection UI before the capture.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return captureRef(canvasRef, { format: 'jpg', quality: 0.85, result: 'tmpfile' });
  };

  const handlePost = async () => {
    if (!photoUri || posting) return;
    if (photos.some((p) => !p)) {
      Alert.alert('Fill every box', 'Add a photo to each box, or pick a layout with fewer boxes.');
      return;
    }
    if (atLimit) {
      showLimitAlert();
      return;
    }
    setPosting(true);
    try {
      const prevStreak = streak?.currentStreak || 0;
      const imageUri = await renderSnapImage();
      const imageUrl = await uploadSnapImage(imageUri);
      await postSnap(user.id!, imageUrl, caption.trim() || undefined, audience);

      // postSnap() now awaits updateStreakOnPost() synchronously, so the
      // streak should be up-to-date on the first read. Retry once as a
      // safety net for rare DB replication lag.
      let updatedStreak = await getMyStreak(user.id!);
      if (updatedStreak.currentStreak <= prevStreak) {
        await new Promise(r => setTimeout(r, 500));
        updatedStreak = await getMyStreak(user.id!);
      }

      const streakGrew = updatedStreak.currentStreak > prevStreak;

      if (streakGrew && updatedStreak.currentStreak > 1) {
        // Show celebration animation instead of boring Alert
        runCelebration(updatedStreak.currentStreak);
      } else {
        // Simple success — no streak animation needed
        Alert.alert(
          '📸 Snap posted!',
          audience === 'friends'
            ? 'Your friends can see it for the next 24 hours.'
            : audience === 'campus'
              ? 'Your campus can see it for the next 24 hours.'
              : 'Your university can see it for the next 24 hours.',
        );
        router.back();
      }
    } catch (e: any) {
      console.error('[SnapCamera] post error:', e);
      Alert.alert('Upload failed', 'Something went wrong. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // ─── Composer ──────────────────────────────────────────────────────────────
  if (!atLimit || photoUri) {
    const cells = layoutCells(layoutId);
    const tools: { key: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }[] = [
      { key: 'text', icon: 'type', label: 'Text', onPress: () => startText() },
      { key: 'draw', icon: 'edit-3', label: 'Draw', onPress: () => setMode('draw') },
      { key: 'layout', icon: 'grid', label: 'Layout', onPress: () => setMode('layout') },
      { key: 'gallery', icon: 'image', label: 'Gallery', onPress: () => void galleryIntoNext() },
      {
        key: 'camera',
        icon: 'camera',
        label: layoutId === '1' && photos[0] ? 'Retake' : 'Camera',
        onPress: async () => {
          const u = await takePhoto();
          if (!u) return;
          const empty = photos.findIndex((p) => !p);
          setCellPhoto(empty >= 0 ? empty : 0, u);
        },
      },
    ];
    return (
      <View style={[s.container, { backgroundColor: '#000' }]}>
        {/* No swipe-back: a stroke drawn left to right was taken as "go back"
            and threw the whole snap away. The X asks first. */}
        <Stack.Screen options={{ gestureEnabled: false }} />
        {/* The canvas: exactly what gets posted. Tools and buttons sit outside it. */}
        <View
          ref={canvasRef}
          collapsable={false}
          style={s.canvas}
          onLayout={(e) => setCanvasSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {canvasSize.w > 0 &&
            cells.map((c, i) => {
              const f = cellFrame(c, canvasSize.w, canvasSize.h);
              const uri = photos[i];
              return (
                <Pressable
                  key={`${layoutId}-${i}`}
                  onPress={() => (mode === 'layout' || !uri ? fillCell(i) : undefined)}
                  disabled={mode === 'text' || mode === 'draw'}
                  style={[s.cell, f]}
                  accessibilityLabel={uri ? `Photo ${i + 1}` : `Add photo ${i + 1}`}
                >
                  {uri ? (
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <View style={s.cellEmpty}>
                      <View style={s.cellPlus}>
                        <Feather name="plus" size={26} color="#fff" />
                      </View>
                      {cells.length === 1 ? <Text style={s.cellHint}>Take a photo or pick one</Text> : null}
                    </View>
                  )}
                  {mode === 'layout' && uri ? (
                    <View style={s.cellEditBadge}>
                      <Feather name="refresh-cw" size={14} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {strokes.map((st, i) => <StrokeView key={i} stroke={st} />)}
          </View>
          {texts.map((t) =>
            editingText?.id === t.id ? null : (
              <TextSticker
                key={t.id}
                item={t}
                enabled={mode === 'idle'}
                onMove={moveText}
                onTap={(id) => startText(texts.find((x) => x.id === id))}
                onDragChange={onDragChange}
              />
            ),
          )}
          {mode === 'draw' ? <DrawSurface color={inkColor} size={6} onStroke={onStroke} /> : null}
        </View>

        {/* Bin while a text is being dragged */}
        {dragY !== null ? (
          <View pointerEvents="none" style={[s.bin, dragY > binTop && s.binHot, { bottom: insets.bottom + 40 }]}>
            <Feather name="trash-2" size={22} color="#fff" />
          </View>
        ) : null}

        {/* ─── Idle: close, tool rail, caption and share ─── */}
        {mode === 'idle' && dragY === null ? (
          <>
            <View style={[s.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
              <Pressable onPress={handleClose} style={s.roundBtn} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={22} color="#fff" />
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 52 }}>
                {!atLimit && snapsLeft !== null ? (
                  <View style={[s.topPill, { marginRight: 0 }]}>
                    <Text style={s.topPillText}>{snapsLeft} left today</Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => router.push('/snap-memories' as any)}
                  style={[s.topPill, { marginRight: 0, flexDirection: 'row', alignItems: 'center', gap: 5 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Memories"
                >
                  <Feather name="clock" size={13} color="#fff" />
                  <Text style={s.topPillText}>Memories</Text>
                </Pressable>
              </View>
            </View>

            <View style={[s.rail, { top: insets.top + 60 }]}>
              {tools.map((t) => (
                <Pressable key={t.key} onPress={t.onPress} style={s.railItem} accessibilityRole="button" accessibilityLabel={t.label}>
                  <View style={s.railIcon}>
                    <Feather name={t.icon} size={19} color="#fff" />
                  </View>
                  <Text style={s.railLabel}>{t.label}</Text>
                </Pressable>
              ))}
              {strokes.length > 0 ? (
                <Pressable onPress={() => setStrokes((p) => p.slice(0, -1))} style={s.railItem} accessibilityLabel="Undo drawing">
                  <View style={s.railIcon}>
                    <Feather name="corner-up-left" size={19} color="#fff" />
                  </View>
                  <Text style={s.railLabel}>Undo</Text>
                </Pressable>
              ) : null}
            </View>

            <LinearGradient
              pointerEvents="none"
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={s.scrim}
            />
            {/* The safe-area gap sits on an inner View: KeyboardAvoidingView in
                'padding' mode overwrites its own paddingBottom (0 with the
                keyboard closed), which put the buttons on the bottom edge. */}
            <KeyboardAvoidingScreen
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={s.bottom}
            >
              <View style={{ gap: 10, paddingBottom: insets.bottom + 12 }}>
              {/* The caption stays as well as text on the photo: it travels with
                  the snap as words, so it reads even where the photo is small. */}
              <View style={s.captionWrap}>
                <TextInput
                  style={s.captionInput}
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Add a caption"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  maxLength={200}
                  multiline
                  returnKeyType="done"
                  blurOnSubmit
                  accessibilityLabel="Snap caption"
                />
                {caption.length >= 160 && <Text style={s.captionCount}>{200 - caption.length}</Text>}
              </View>
              <View style={s.shareRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.audienceRow} style={{ flex: 1 }}>
                  {audienceOptions.map((opt) => {
                    const active = audience === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setAudience(opt.value)}
                        style={({ pressed }) => [s.audiencePill, active && s.audiencePillActive, pressed && { opacity: 0.8 }]}
                      >
                        <Feather name={opt.icon} size={13} color={active ? '#000' : '#fff'} />
                        <Text style={[s.audiencePillText, active && { color: '#000' }]} numberOfLines={1}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  onPress={handlePost}
                  disabled={posting}
                  style={({ pressed }) => [s.sendBtn, (posting || !photoUri) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.94 }] }]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    audience === 'friends' ? 'Share with friends' : audience === 'campus' ? 'Share with my campus' : 'Share with my uni'
                  }
                >
                  {posting ? <ActivityIndicator size="small" color="#000" /> : <Feather name="send" size={22} color="#000" />}
                </Pressable>
              </View>
              </View>
            </KeyboardAvoidingScreen>
          </>
        ) : null}

        {/* ─── Layout tray ─── */}
        {mode === 'layout' ? (
          <View style={[s.tray, { paddingBottom: insets.bottom + 14 }]}>
            <Text style={s.trayHint}>Tap a box to add or change its photo</Text>
            <View style={s.layoutRow}>
              {SNAP_LAYOUTS.map((l) => (
                <LayoutThumb key={l.id} id={l.id} active={layoutId === l.id} onPress={() => chooseLayout(l.id)} />
              ))}
            </View>
            <Pressable onPress={() => setMode('idle')} style={s.doneBtn}>
              <Text style={s.doneText}>Done</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ─── Draw toolbar ─── */}
        {mode === 'draw' ? (
          <View style={[s.drawBar, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => setStrokes((p) => p.slice(0, -1))} style={s.roundBtn} accessibilityLabel="Undo" disabled={!strokes.length}>
              <Feather name="corner-up-left" size={20} color={strokes.length ? '#fff' : 'rgba(255,255,255,0.35)'} />
            </Pressable>
            <ColorRow value={inkColor} onChange={setInkColor} />
            <Pressable onPress={() => setMode('idle')} style={s.doneSmall}>
              <Text style={s.doneText}>Done</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ─── Text editor ─── */}
        {mode === 'text' && editingText ? (
          <KeyboardAvoidingScreen behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.textEditor}>
            <View style={[s.textTop, { paddingTop: insets.top + 8 }]}>
              <Pressable
                onPress={() => setEditingText({ ...editingText, boxed: !editingText.boxed })}
                style={[s.roundBtn, editingText.boxed && { backgroundColor: '#fff' }]}
                accessibilityLabel="Text background"
              >
                <Text style={{ color: editingText.boxed ? '#000' : '#fff', fontWeight: '900', fontSize: 15 }}>A</Text>
              </Pressable>
              <Pressable onPress={finishText} style={s.doneSmall}>
                <Text style={s.doneText}>Done</Text>
              </Pressable>
            </View>
            <View style={s.textCenter}>
              <TextInput
                autoFocus
                multiline
                value={editingText.text}
                onChangeText={(t) => setEditingText({ ...editingText, text: t })}
                placeholder="Type something"
                placeholderTextColor="rgba(255,255,255,0.5)"
                maxLength={80}
                style={[
                  s.textInput,
                  { color: editingText.color },
                  editingText.boxed && {
                    backgroundColor: editingText.color === '#000000' ? '#fff' : 'rgba(0,0,0,0.6)',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                  },
                ]}
              />
            </View>
            <View style={{ paddingBottom: 14 }}>
              <ColorRow
                value={editingText.color}
                onChange={(c) => {
                  setInkColor(c);
                  setEditingText({ ...editingText, color: c });
                }}
              />
            </View>
          </KeyboardAvoidingScreen>
        ) : null}

        {/* ─── STREAK CELEBRATION ─── */}
        {showCelebration && (
          <>
            {/* Camera flash */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: '#fff', opacity: flashOpacity, zIndex: 101 },
              ]}
            />

            {/* Main overlay */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: overlayOpacity,
                  transform: [{ scale: wholeScale }],
                  zIndex: 100,
                },
              ]}
            >
              {/* Glow ring behind fire */}
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: 'transparent',
                  borderWidth: 3,
                  borderColor: '#FF6B00',
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                  shadowColor: '#FF6B00',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 40,
                }}
              />

              {/* Fire emoji — drops in */}
              <Animated.Text
                style={{
                  fontSize: 72,
                  transform: [
                    { scale: fireScale },
                    { translateY: fireTranslateY },
                  ],
                }}
              >
                🔥
              </Animated.Text>

              {/* Streak number — slides up */}
              <Animated.Text
                style={{
                  fontSize: 56,
                  fontWeight: '900',
                  color: '#FF6B00',
                  letterSpacing: -2,
                  marginTop: 8,
                  opacity: numberOpacity,
                  transform: [{ translateY: numberTranslateY }],
                }}
              >
                {celebrationStreak}
              </Animated.Text>

              {/* "DAY STREAK" label — slides up after */}
              <Animated.Text
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: 6,
                  marginTop: 2,
                  opacity: labelOpacity,
                  transform: [{ translateY: labelTranslateY }],
                }}
              >
                DAY STREAK
              </Animated.Text>

              {/* Subtitle */}
              <Animated.Text
                style={{
                  opacity: subtitleOpacity,
                  marginTop: 24,
                  fontSize: 15,
                  fontWeight: '500',
                  color: 'rgba(255,255,255,0.55)',
                  textAlign: 'center',
                  paddingHorizontal: 40,
                }}
              >
                Your snap is live on the map
              </Animated.Text>
            </Animated.View>
          </>
        )}
      </View>
    );
  }

  // ─── Prompt state ──────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Snap Streak</Text>
        </View>
        {/* Snaps remaining pill */}
        {!atLimit && snapsLeft !== null && (
          <View style={[s.snapsPill, { backgroundColor: theme.primary + '14' }]}>
            <Text style={[s.snapsPillText, { color: theme.primary }]}>
              {snapsLeft} left today
            </Text>
          </View>
        )}
        {streak && streak.currentStreak > 0 && (
          <View style={[s.streakPill, { backgroundColor: '#FF6B0015' }]}>
            <Text style={s.streakPillIcon}>🔥</Text>
            <Text style={[s.streakPillCount, { color: '#FF6B00' }]}>{streak.currentStreak}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero CTA */}
        <View style={s.hero}>
          {atLimit ? (
            // Limit reached state
            <View style={[s.heroLimitCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={s.heroLimitEmoji}>😴</Text>
              <Text style={[s.heroLimitTitle, { color: theme.text }]}>
                All snaps used for today
              </Text>
              <Text style={[s.heroLimitSub, { color: theme.textSecondary }]}>
                {plan === 'free'
                  ? 'Free plan includes 1 snap/day. Upgrade to Plus for 3 or Pro for unlimited.'
                  : `Plus plan includes ${maxSnaps} snaps/day. Upgrade to Pro for unlimited.`}
              </Text>
              {plan !== 'pro' && (
                <Pressable
                  style={[s.upgradeBtn, { backgroundColor: theme.primary }]}
                  onPress={openPaywall}
                >
                  <Feather name="zap" size={15} color="#fff" />
                  <Text style={s.upgradeBtnText}>{upgradeLabel(plan === 'free' ? 'plus' : 'pro')}</Text>
                </Pressable>
              )}
            </View>
          ) : (
            // While camera is opening, show a subtle loading state
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 62 : 40,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  backBtn: { marginLeft: -4 },
  headerTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  snapsPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  snapsPillText: { fontSize: 12, fontWeight: '700' },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  streakPillIcon: { fontSize: 13 },
  streakPillCount: { fontSize: 13, fontWeight: '800' },

  // Scroll
  scrollContent: { padding: 20, gap: 14, paddingBottom: 48 },

  // Hero section
  hero: { gap: 16 },

  // Limit reached card
  heroLimitCard: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
  },
  heroLimitEmoji: { fontSize: 40 },
  heroLimitTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroLimitSub: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '500' },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  upgradeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ─── Preview ───────────────────────────────────────────────────────────────
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewTopBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: { flex: 1, alignItems: 'center' },
  previewTitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    gap: 12,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    paddingVertical: 17,
  },
  postBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  captionWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  captionInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    // A caption can run to three lines before it starts to cover the photo.
    maxHeight: 76,
    padding: 0,
  },
  captionCount: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', paddingBottom: 2 },
  audienceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },

  // ─── Composer ──────────────────────────────────────────────────────────────
  canvas: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  cell: { position: 'absolute', overflow: 'hidden', backgroundColor: '#1c1c1e' },
  cellEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  cellPlus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellHint: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600' },
  cellEditBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPill: { backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 52 },
  topPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rail: { position: 'absolute', right: 10, alignItems: 'center', gap: 12 },
  railItem: { alignItems: 'center', gap: 3 },
  railIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, gap: 10 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bin: {
    position: 'absolute',
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  binHot: { backgroundColor: '#ff3b30', borderColor: '#ff3b30', transform: [{ scale: 1.15 }] },
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.78)',
    gap: 12,
    alignItems: 'center',
  },
  trayHint: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  layoutRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  doneBtn: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 34, paddingVertical: 10 },
  doneSmall: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  doneText: { color: '#000', fontSize: 15, fontWeight: '800' },
  drawBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textEditor: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  textTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14 },
  textCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  textInput: { fontSize: 30, fontWeight: '800', textAlign: 'center', width: '100%' },
  audiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  audiencePillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  audiencePillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
