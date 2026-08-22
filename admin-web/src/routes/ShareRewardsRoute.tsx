import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  listSocialShareClaims,
  reviewSocialShareClaim,
  socialShareDaysForLikes,
  SOCIAL_SHARE_TIERS,
  type SocialShareClaimRow,
  type SocialSharePlatform,
} from '../lib/api';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const PLATFORM_LABEL: Record<SocialSharePlatform, string> = {
  threads: 'Threads',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

type ClaimStatus = SocialShareClaimRow['status'];

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_TONE: Record<ClaimStatus, ChipTone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'rose',
};

type ChipTone = 'amber' | 'green' | 'rose' | 'slate';

function Chip({ children, tone }: { children: string; tone: ChipTone }) {
  const cls: Record<ChipTone, string> = {
    green:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100',
    amber:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100',
    rose:
      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100',
    slate:
      'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${cls[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isYoungerThan48h(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 48 * 60 * 60 * 1000;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'no expiry';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function ShareRewardsRoute() {
  const { searchQuery: globalSearch } = useAdminSearch();

  const [items, setItems] = useState<SocialShareClaimRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | 'all'>('pending');
  const [selected, setSelected] = useState<SocialShareClaimRow | null>(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await listSocialShareClaims(statusFilter === 'all' ? undefined : statusFilter);
      setItems(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredItems = useMemo(() => {
    const q = (globalSearch || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.user_email, r.post_url, r.platform, r.user_id]
        .filter((x): x is string => !!x)
        .some((h) => h.toLowerCase().includes(q)),
    );
  }, [items, globalSearch]);

  const counts = useMemo(
    () => ({
      pending: items.filter((r) => r.status === 'pending').length,
      total: items.length,
    }),
    [items],
  );

  async function review(input: {
    id: string;
    approve: boolean;
    approvedLikes?: number | null;
    awardedDays?: number | null;
    note?: string;
  }): Promise<void> {
    await reviewSocialShareClaim(input);
    setSelected(null);
    await refresh();
  }

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          Share Rewards
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Social-post claims for free Plus days. Open the live post, verify the like count yourself,
          then award days — the entitlement and profile sync happen automatically on approval.
        </div>
      </MotionSection>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ['Pending in view', counts.pending],
          ['Claims in view', counts.total],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-xs font-black uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{value}</div>
          </div>
        ))}
      </div>

      <MotionSection delay={0.05} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`h-9 rounded-xl border px-3 text-xs font-black uppercase tracking-wide ${
                    statusFilter === s
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {s === 'all' ? 'All' : STATUS_LABEL[s]}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => void refresh()}
                className="ml-auto h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950"
              >
                {busy ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {err ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {err}
              </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-black uppercase tracking-wide text-slate-500 dark:border-slate-800">
                    <th className="py-2 pr-3">Submitted</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Platform</th>
                    <th className="py-2 pr-3">Claimed likes</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Awarded</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                    >
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                        <div className="flex items-center gap-2">
                          {formatDateTime(row.created_at)}
                          {row.status === 'pending' && isYoungerThan48h(row.created_at) ? (
                            <Chip tone="rose">&lt;48h</Chip>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.user_email ?? row.user_id.slice(0, 8)}
                          {row.status === 'pending' && row.has_non_promo_access ? (
                            <Chip tone="amber">Already paid</Chip>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                        {PLATFORM_LABEL[row.platform] ?? row.platform}
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                        {row.claimed_likes.toLocaleString()}
                      </td>
                      <td className="py-3 pr-3">
                        <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-700 dark:text-slate-200">
                        {row.status === 'approved' && row.awarded_days ? `+${row.awarded_days}d` : '-'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black dark:border-slate-700 dark:bg-slate-950"
                        >
                          {row.status === 'pending' ? 'Review' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm font-semibold text-slate-500">
                        No claims here.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>

      {selected
        ? createPortal(
            <ClaimReviewModal row={selected} onClose={() => setSelected(null)} onReview={review} />,
            document.body,
          )
        : null}
    </div>
  );
}

function ClaimReviewModal({
  row,
  onClose,
  onReview,
}: {
  row: SocialShareClaimRow;
  onClose: () => void;
  onReview: (input: {
    id: string;
    approve: boolean;
    approvedLikes?: number | null;
    awardedDays?: number | null;
    note?: string;
  }) => Promise<void>;
}) {
  const [verifiedLikes, setVerifiedLikes] = useState<string>(String(row.claimed_likes));
  const [days, setDays] = useState<string>(String(socialShareDaysForLikes(row.claimed_likes) || ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const likesNum = Number.parseInt(verifiedLikes, 10);
  const daysNum = Number.parseInt(days, 10);
  const suggested = Number.isFinite(likesNum) ? socialShareDaysForLikes(likesNum) : 0;
  const gapPct =
    row.claimed_likes > 0 && Number.isFinite(likesNum)
      ? Math.abs(row.claimed_likes - likesNum) / row.claimed_likes
      : 0;
  const isPending = row.status === 'pending';

  function applyVerifiedLikes(next: string) {
    setVerifiedLikes(next);
    const n = Number.parseInt(next, 10);
    const d = Number.isFinite(n) ? socialShareDaysForLikes(n) : 0;
    if (d > 0) setDays(String(d));
  }

  async function submit(approve: boolean) {
    setError('');
    if (approve && (!Number.isFinite(daysNum) || daysNum < 1 || daysNum > 180)) {
      setError('Awarded days must be between 1 and 180.');
      return;
    }
    if (!approve && note.trim().length < 3) {
      setError('A rejection note (shown to the user) is required.');
      return;
    }
    setBusy(true);
    try {
      await onReview({
        id: row.id,
        approve,
        approvedLikes: Number.isFinite(likesNum) && likesNum >= 0 ? likesNum : null,
        awardedDays: approve ? daysNum : null,
        note: note.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
              <Chip tone="slate">{PLATFORM_LABEL[row.platform] ?? row.platform}</Chip>
              {isPending && isYoungerThan48h(row.created_at) ? (
                <Chip tone="rose">Posted &lt;48h ago — likes may still be settling</Chip>
              ) : null}
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatDateTime(row.created_at)}
              </div>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              {row.user_email ?? row.user_id.slice(0, 8)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black dark:border-slate-700 dark:bg-slate-950"
          >
            Close
          </button>
        </div>

        {isPending && row.has_non_promo_access ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/40">
            <div className="text-sm font-black text-amber-900 dark:text-amber-100">
              This user already has active {row.current_plan.toUpperCase()} access
              {row.current_store ? ` via ${row.current_store}` : ''} until {formatDate(row.current_expires_at)}.
            </div>
            <div className="mt-1 text-sm font-semibold text-amber-900/80 dark:text-amber-100/80">
              Promo days start counting immediately — they are not banked for later. Approving now
              means the free days overlap access they already have, so the reward may be worth
              nothing to them. Consider asking them to claim again after their current plan ends.
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="text-xs font-black uppercase text-slate-500">Post URL</div>
          {/* Shown as text, never embedded: the URL is user-supplied content. */}
          <div className="mt-1 break-all font-mono text-sm text-slate-800 dark:text-slate-200">
            {row.post_url}
          </div>
          <a
            href={row.post_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black dark:border-slate-700 dark:bg-slate-900"
          >
            Open post in new tab ↗
          </a>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-black uppercase text-slate-500">Screenshot proof</div>
            {row.screenshot_signed_url ? (
              <img
                src={row.screenshot_signed_url}
                alt="Share proof screenshot"
                className="mt-2 max-h-96 w-full rounded-2xl border border-slate-200 object-contain dark:border-slate-800"
              />
            ) : (
              <div className="mt-2 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-500 dark:border-slate-800">
                Screenshot unavailable (link expired — refresh the list).
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-black uppercase text-slate-500">Claimed likes</div>
              <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                {row.claimed_likes.toLocaleString()}
              </div>
            </div>

            {isPending ? (
              <>
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">
                    Likes you verified on the live post
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={verifiedLikes}
                    onChange={(e) => applyVerifiedLikes(e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
                {gapPct >= 0.25 ? (
                  <Chip tone="rose">{`Claimed vs verified gap ${Math.round(gapPct * 100)}%`}</Chip>
                ) : null}
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">
                    Awarded days {suggested > 0 ? `(suggested: ${suggested})` : '(below lowest tier)'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
                <div className="text-xs font-semibold text-slate-500">
                  Ladder: {SOCIAL_SHARE_TIERS.map((t) => `${t.likes}→${t.days}d`).join(' · ')}
                </div>
                <label className="block">
                  <span className="text-xs font-black uppercase text-slate-500">
                    Note (required to reject — shown to the user)
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-950"
                  />
                </label>
              </>
            ) : (
              <div className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <div>Verified likes: {row.approved_likes?.toLocaleString() ?? '-'}</div>
                <div>Awarded: {row.awarded_days ? `+${row.awarded_days} days` : '-'}</div>
                <div>Reviewed: {formatDateTime(row.reviewed_at)}</div>
                {row.review_note ? <div>Note: {row.review_note}</div> : null}
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(false)}
              className="h-11 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-900 disabled:opacity-40 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy || !Number.isFinite(daysNum) || daysNum < 1}
              onClick={() => void submit(true)}
              className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-40"
            >
              {busy ? 'Working…' : `Approve · +${Number.isFinite(daysNum) ? daysNum : 0} days Plus`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
