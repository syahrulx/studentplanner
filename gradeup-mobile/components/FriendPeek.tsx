/**
 * The card that opens when you tap a student's name or picture.
 *
 * It is a peek, not a profile: who they are, where they study, and a way
 * through to the full screen. It exists so that tapping a name in a list does
 * not throw you out of the list — you look, you close, you carry on scrolling.
 *
 * ── The banner ──
 * The coloured strip at the top is deliberately its own piece. Today it is a
 * flat band of the theme's primary colour, which every student gets for free.
 * It is the part that will later be sold: a picture, a pattern, an animation.
 * Everything that decides what the banner looks like is in `renderBanner`
 * below and nowhere else, so adding a paid banner means changing one function
 * rather than hunting through the card.
 */
import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/hooks/useTheme';
import { useProfileCard } from '@/hooks/useProfileCard';
import { Avatar } from '@/components/Avatar';
import { ProfileBannerView } from '@/components/ProfileBannerView';
import {
  resolveProfileBanner,
  isFieldVisible,
  type ProfileCardField,
} from '@/src/lib/profileBanners';
import type { SubscriptionPlan } from '@/src/types';

export interface FriendPeekPerson {
  id: string;
  name: string;
  avatar_url?: string;
  university?: string;
  campus?: string;
  faculty?: string;
  course?: string;
  /** Shown under the name — "Online now", "Location off", a status, anything. */
  statusLine?: string;
  /**
   * What they are doing and what they are playing, exactly as the community
   * list has them — the caller passes what it already holds rather than this
   * card fetching presence of its own. Two screens reading the same live
   * values cannot disagree, and a card opened from Add Friends simply has
   * neither, which is right: you are not friends, so you do not see them.
   */
  activityText?: string;
  activityIcon?: React.ComponentProps<typeof Feather>['name'];
  songText?: string;
  /**
   * Their chosen banner and hidden rows, when the caller already has them —
   * the customise screen does, because it is showing you your own unsaved
   * choices. Everyone else leaves these out and the card fetches them.
   */
  profile_banner?: string | null;
  profile_hidden_fields?: string[] | null;
  /**
   * Their plan — set it only for your own card. Leaving it undefined draws
   * whatever banner they chose, which is what every other student's card
   * needs, since their subscription is not ours to read. See
   * resolveProfileBanner.
   */
  plan?: SubscriptionPlan | null;
}

interface Props {
  person: FriendPeekPerson | null;
  onClose: () => void;
  /** Omitted when there is no full profile to open — on the add-friend screen,
   *  for instance, where you are not friends yet. */
  onOpenProfile?: (id: string) => void;
}

// The banner carries the card. At 92 it read as a coloured strip above the
// content; at 108 it reads as the top of the card, which is what a paid one
// has to feel like to be worth paying for.
const BANNER_HEIGHT = 108;
const AVATAR_SIZE = 76;

export function FriendPeek({ person, onClose, onOpenProfile }: Props) {
  const theme = useTheme();
  const [photoOpen, setPhotoOpen] = useState(false);
  const fetched = useProfileCard(
    // The caller already knows on the customise screen, where it is showing
    // you your own unsaved edits.
    person?.profile_banner === undefined && person?.profile_hidden_fields === undefined ? person?.id : null,
  );

  const bannerId = person?.profile_banner !== undefined ? person.profile_banner : fetched?.banner;
  const hidden = person?.profile_hidden_fields !== undefined ? person.profile_hidden_fields : fetched?.hidden;
  const banner = resolveProfileBanner(bannerId, person?.plan);

  // A row is drawn only if there is something in it AND they have not hidden
  // it. An empty row would otherwise advertise that something was hidden,
  // which rather defeats hiding it.
  const all: { key: ProfileCardField; icon: React.ComponentProps<typeof Feather>['name']; label: string; value?: string }[] = [
    { key: 'university', icon: 'home', label: 'University', value: person?.university },
    { key: 'campus', icon: 'map-pin', label: 'Campus', value: person?.campus },
    { key: 'faculty', icon: 'layers', label: 'Faculty', value: person?.faculty },
    { key: 'course', icon: 'book-open', label: 'Course', value: person?.course },
  ];
  const rows = all.filter((r) => r.value && isFieldVisible(r.key, hidden));

  /**
   * What they are doing and playing sit under the name, not in the table below.
   *
   * In the table they were two more label-and-value rows, sandwiched between
   * Faculty and Course, reading as more paperwork. They are not paperwork —
   * they are the only two lines on the card that change during the day, and
   * they belong next to the person, the way a status sits under a name
   * everywhere else in the app.
   */
  const presence = [
    isFieldVisible('status', hidden) && person?.activityText
      ? { key: 'status', icon: person.activityIcon ?? 'activity', text: person.activityText }
      : null,
    isFieldVisible('song', hidden) && person?.songText
      ? { key: 'song', icon: 'music' as const, text: person.songText }
      : null,
  ].filter(Boolean) as { key: string; icon: React.ComponentProps<typeof Feather>['name']; text: string }[];

  return (
    <Modal
      visible={Boolean(person)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close">
        {/* Swallows the tap so pressing the card itself does not close it. */}
        <Pressable style={[s.card, { backgroundColor: theme.card }]} onPress={() => {}}>
          <ProfileBannerView banner={banner} themeColor={theme.primary} height={BANNER_HEIGHT} />

          <Pressable style={s.closeBtn} onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Feather name="x" size={18} color="#fff" />
          </Pressable>

          <View style={s.body}>
            <Pressable
              accessibilityRole={person?.avatar_url ? 'button' : undefined}
              accessibilityLabel={person?.avatar_url ? `See ${person.name}'s picture` : undefined}
              // Only a real photo is worth opening full size. Enlarging the
              // two-letter fallback would just be big letters.
              disabled={!person?.avatar_url}
              onPress={() => setPhotoOpen(true)}
              style={[s.avatarRing, { borderColor: theme.card, backgroundColor: theme.card }]}
            >
              <Avatar name={person?.name || ''} avatarUrl={person?.avatar_url} size={AVATAR_SIZE} />
            </Pressable>

            <Text style={[s.name, { color: theme.text }]} numberOfLines={2}>
              {person?.name || ''}
            </Text>
            {person?.statusLine ? (
              <Text style={[s.status, { color: theme.textSecondary }]} numberOfLines={1}>
                {person.statusLine}
              </Text>
            ) : null}

            {presence.length > 0 && (
              <View style={s.presence}>
                {presence.map((p) => (
                  <View key={p.key} style={s.presenceRow}>
                    {/* Fixed-width box, not a gap: a music note and a book are
                        different widths, so without it the two lines of text
                        start at different places and the pair looks crooked. */}
                    <View style={s.presenceIcon}>
                      <Feather name={p.icon} size={14} color={theme.primary} />
                    </View>
                    <Text style={[s.presenceText, { color: theme.text }]} numberOfLines={1}>
                      {p.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {rows.length > 0 && (
              <View style={[s.rows, { borderTopColor: theme.border }]}>
                {rows.map((r) => (
                  <View key={r.key} style={s.row}>
                    <Feather name={r.icon} size={14} color={theme.textSecondary} />
                    <Text style={[s.rowLabel, { color: theme.textSecondary }]}>{r.label}</Text>
                    <Text style={[s.rowValue, { color: theme.text }]} numberOfLines={2}>
                      {r.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {rows.length === 0 && (
              <Text style={[s.empty, { color: theme.textSecondary }]}>
                Nothing to show here yet.
              </Text>
            )}

            {onOpenProfile && person ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  s.openBtn,
                  { borderColor: theme.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => onOpenProfile(person.id)}
              >
                <Text style={[s.openBtnText, { color: theme.text }]}>Open full profile</Text>
                <Feather name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>

      {/* The picture, full size. Its own Modal, stacked on the card's, so
          closing it returns you to the card rather than to the list. */}
      <Modal
        visible={photoOpen && Boolean(person?.avatar_url)}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoOpen(false)}
      >
        <Pressable style={s.photoBackdrop} onPress={() => setPhotoOpen(false)}>
          <Image
            source={{ uri: person?.avatar_url }}
            style={s.photoFull}
            contentFit="contain"
            transition={140}
            accessibilityLabel={person ? `${person.name}'s picture` : undefined}
          />
          <View style={s.photoCloseBtn}>
            <Feather name="x" size={20} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 12,
  },
  banner: { height: BANNER_HEIGHT },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingBottom: 18 },
  // Lifts the picture so it straddles the banner's bottom edge. This is the
  // reference layout: your profile and a friend's profile both follow it.
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -(AVATAR_SIZE / 2 + 4),
    marginBottom: 10,
  },
  name: { fontSize: 19, fontWeight: '800' },
  status: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  presence: { marginTop: 10, gap: 5 },
  presenceRow: { flexDirection: 'row', alignItems: 'center' },
  presenceIcon: { width: 20, alignItems: 'center' },
  presenceText: { flex: 1, fontSize: 13, fontWeight: '700' },
  rows: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowLabel: { fontSize: 13, fontWeight: '600', width: 76 },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13, fontWeight: '600', marginTop: 14 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 16,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  openBtnText: { fontSize: 14, fontWeight: '700' },
  photoBackdrop: {
    flex: 1,
    // Solid, not translucent. At 92% the screen underneath still showed above
    // and below the picture, and a photo you opened to look at properly ended
    // up competing with a dimmed settings page.
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFull: { width: '100%', height: '82%' },
  photoCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 28,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
