/**
 * Banners for the profile card — the strip behind a student's picture.
 *
 * Three kinds, and the kind is the tier:
 *
 *   - `theme`  (free) the app theme's own colour, which is what a card has
 *              always had.
 *   - `color`  (Plus) a flat colour from a set list. Plus buys the palette,
 *              not one particular colour.
 *   - `design` (Pro)  a small animated scene, drawn in ProfileBannerView.
 *
 * Nothing here is a picture file. Every design is drawn with React Native's
 * own Animated API at whatever size the banner happens to be, so there is no
 * asset to license, nothing added to the bundle, and the picker's 54pt tiles
 * and the card's 108pt banner run the same code rather than being two sets of
 * art that can drift apart.
 *
 * Purely decoration either way. A banner never changes what the card says, so
 * a locked one costs a student nothing except the look.
 */
import type { SubscriptionPlan } from '../types';
import { isAtLeastPlus, isPro } from './flashcardGenerationLimits';

/** The animated scenes. Each is drawn by a branch of ProfileBannerView. */
export type ProfileBannerDesign = 'sakura' | 'lofi' | 'grid' | 'arcade' | 'nebula';

/**
 * The one account that may wear the owner banner.
 *
 * A user id, not an email address. An email can be changed, and whoever ended
 * up with the old one would inherit the banner; a Supabase user id cannot
 * change and is never reassigned.
 *
 * It is not a secret — anyone can read it out of the bundle — but there is
 * nothing to gain from it. The id only unlocks a decoration, and the banner a
 * student has saved is still their own row, which RLS already guards.
 */
export const OWNER_USER_ID = 'a44b03d4-3ab8-47f5-91cf-f88720fcb204';

export interface ProfileBanner {
  id: string;
  name: string;
  tier: 'free' | 'plus' | 'pro' | 'owner';
  kind: 'theme' | 'color' | 'design';
  /** kind 'color' only. */
  color?: string;
  /** kind 'design' only. */
  design?: ProfileBannerDesign;
}

/**
 * The Plus palette.
 *
 * Deliberately muted. The first set of paid banners were saturated gradients
 * and they fought with all ten of the app's themes — a card ended up looking
 * pasted in from somewhere else. A flat, slightly dusty colour sits behind a
 * photograph without competing with it, which is the whole job of a banner.
 */
const PLUS_COLORS: { id: string; name: string; color: string }[] = [
  { id: 'slate', name: 'Slate', color: '#5b6775' },
  { id: 'ocean', name: 'Ocean', color: '#356b86' },
  { id: 'forest', name: 'Forest', color: '#4a7257' },
  { id: 'olive', name: 'Olive', color: '#73804f' },
  { id: 'sand', name: 'Sand', color: '#bb9a6e' },
  { id: 'clay', name: 'Clay', color: '#a96a55' },
  { id: 'rose', name: 'Rose', color: '#b2788a' },
  { id: 'plum', name: 'Plum', color: '#6f5676' },
  { id: 'sky', name: 'Sky', color: '#6f9bba' },
  { id: 'ink', name: 'Ink', color: '#39404c' },
];

/** One of a kind, and not offered to anyone else. See OWNER_USER_ID. */
const OWNER_DESIGNS: { id: string; name: string; design: ProfileBannerDesign }[] = [
  { id: 'nebula', name: 'Nebula', design: 'nebula' },
];

const PRO_DESIGNS: { id: string; name: string; design: ProfileBannerDesign }[] = [
  { id: 'sakura', name: 'Sakura', design: 'sakura' },
  { id: 'lofi', name: 'Lofi', design: 'lofi' },
  { id: 'grid', name: 'Grid', design: 'grid' },
  { id: 'arcade', name: 'Arcade', design: 'arcade' },
];

export const PROFILE_BANNERS: Record<string, ProfileBanner> = {
  theme: { id: 'theme', name: 'Theme colour', tier: 'free', kind: 'theme' },
  ...Object.fromEntries(
    PLUS_COLORS.map((c) => [
      c.id,
      { id: c.id, name: c.name, tier: 'plus', kind: 'color', color: c.color } as ProfileBanner,
    ]),
  ),
  ...Object.fromEntries(
    PRO_DESIGNS.map((d) => [
      d.id,
      { id: d.id, name: d.name, tier: 'pro', kind: 'design', design: d.design } as ProfileBanner,
    ]),
  ),
  ...Object.fromEntries(
    OWNER_DESIGNS.map((d) => [
      d.id,
      { id: d.id, name: d.name, tier: 'owner', kind: 'design', design: d.design } as ProfileBanner,
    ]),
  ),
};

/** The free colour first, then the Plus palette. */
/**
 * The banner for someone else who has not chosen one.
 *
 * Not your theme colour. "Theme colour" is a real choice in the picker and it
 * means "follow the app theme" — but on another student's card we have no idea
 * which theme they use, so drawing yours put your colour on every friend you
 * tapped and made all of their cards look like your own. A neutral says what
 * is true: they have not picked anything. It is deliberately outside the Plus
 * palette, so an unchosen banner is never mistaken for a paid one.
 */
export const UNSET_BANNER_COLOR = '#4a5260';

export const PROFILE_BANNER_COLORS: string[] = ['theme', ...PLUS_COLORS.map((c) => c.id)];
/**
 * The designs to offer, which is not the same as the designs that exist.
 *
 * The owner banner is left out of everyone else's picker entirely rather than
 * shown with a padlock. A locked tile is an advert — it is there to be wanted —
 * and this one cannot be bought at any price, so showing it would only invite
 * a question with no good answer.
 */
export function profileBannerDesignsFor(userId?: string | null): string[] {
  const base = PRO_DESIGNS.map((d) => d.id);
  return userId === OWNER_USER_ID ? [...base, ...OWNER_DESIGNS.map((d) => d.id)] : base;
}

export function canUseProfileBanner(
  id: string,
  plan: SubscriptionPlan | null | undefined,
  userId?: string | null,
): boolean {
  const tier = PROFILE_BANNERS[id]?.tier ?? 'free';
  if (tier === 'free') return true;
  // Not for sale, so no plan reaches it.
  if (tier === 'owner') return userId === OWNER_USER_ID;
  if (tier === 'plus') return isAtLeastPlus(plan);
  return isPro(plan);
}

/**
 * The banner to actually draw.
 *
 * `plan` is deliberately three-valued, and the difference matters:
 *
 *   - a plan (including null, meaning free) — this is a card we can price, so
 *     their own. A banner they can no longer afford falls back to the theme
 *     colour, which is what tells a lapsed student what they have lost.
 *   - `undefined` — we do not know the plan, which is every card belonging to
 *     somebody else. Draw what they chose. We cannot read another student's
 *     subscription, and gating on what we cannot read would mean nobody ever
 *     saw anyone's paid banner, which is the entire point of selling one.
 *
 * Either way an unknown id falls back to the theme colour. That is also what
 * retires a banner safely: the saturated gradients this file used to sell are
 * gone, and anyone who had picked one gets their theme colour back rather
 * than a blank strip.
 */
export function resolveProfileBanner(
  id: string | null | undefined,
  plan: SubscriptionPlan | null | undefined,
  userId?: string | null,
): ProfileBanner {
  const known = id ? PROFILE_BANNERS[id] : undefined;
  if (!known) return PROFILE_BANNERS.theme;

  /**
   * The owner banner is checked on every card, including other people's.
   *
   * Everything else falls through to "draw what they chose" when we do not
   * know their plan, because we cannot read another student's subscription.
   * That reasoning does not extend to this one: profiles.profile_banner is a
   * plain text column and RLS lets a student write their own row, so anyone
   * who guessed the id could have set it through the API and had every other
   * phone draw it for them. Ownership is a user id, which we always have, so
   * there is no reason to take it on trust.
   */
  if (known.tier === 'owner') {
    return userId === OWNER_USER_ID ? known : PROFILE_BANNERS.theme;
  }

  if (plan === undefined) return known;
  return canUseProfileBanner(known.id, plan, userId) ? known : PROFILE_BANNERS.theme;
}

// ── What the card is allowed to say ────────────────────────────────────────

export type ProfileCardField = 'university' | 'campus' | 'faculty' | 'course' | 'status' | 'song';

export const PROFILE_CARD_FIELDS: { key: ProfileCardField; label: string }[] = [
  { key: 'university', label: 'University' },
  { key: 'campus', label: 'Campus' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'course', label: 'Course' },
  { key: 'status', label: 'What you are doing' },
  { key: 'song', label: 'What you are listening to' },
];

/**
 * Hidden rather than shown, deliberately.
 *
 * An empty list has to mean "show everything", because that is what every one
 * of the existing profiles will have the moment this ships. Storing the shown
 * fields instead would read every existing student as having hidden all six,
 * and 30,000 cards would go blank on release day.
 */
export function isFieldVisible(
  field: ProfileCardField,
  hidden: string[] | null | undefined,
): boolean {
  return !hidden?.includes(field);
}
