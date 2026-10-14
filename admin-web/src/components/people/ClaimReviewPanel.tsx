import { useState } from 'react';
import { socialShareDaysForLikes, SOCIAL_SHARE_TIERS, type SocialShareClaimRow } from '../../lib/api';
import { Label, Textarea, TextInput } from '../../ui/Input';
import { Chip, FactGrid, Notice, SidePanel } from '../../ui/page';
import { formatDateTime } from './format';
import { PLATFORM_LABEL, STATUS_LABEL, STATUS_TONE, formatExpiry, isYoungerThan48h } from './shareRewards';

export type ClaimReviewInput = {
  id: string;
  approve: boolean;
  approvedLikes?: number | null;
  awardedDays?: number | null;
  note?: string;
};

/** Side panel to review one share-reward claim: proof, live post link, and approve / reject. */
export function ClaimReviewPanel({
  row,
  onClose,
  onReview,
}: {
  row: SocialShareClaimRow;
  onClose: () => void;
  onReview: (input: ClaimReviewInput) => Promise<void>;
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
    <SidePanel
      width="max-w-3xl"
      title={row.user_email ?? row.user_id.slice(0, 8)}
      subtitle={`Submitted ${formatDateTime(row.created_at)}`}
      chips={
        <>
          <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
          <Chip>{PLATFORM_LABEL[row.platform] ?? row.platform}</Chip>
        </>
      }
      onClose={onClose}
      footer={
        isPending ? (
          <>
            {error ? (
              <div role="alert" className="mr-auto self-center text-sm font-semibold text-rose-700 dark:text-rose-300">
                {error}
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(false)}
              className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-900 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy || !Number.isFinite(daysNum) || daysNum < 1}
              onClick={() => void submit(true)}
              className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {busy ? 'Working…' : `Approve · +${Number.isFinite(daysNum) ? daysNum : 0} days Plus`}
            </button>
          </>
        ) : undefined
      }
    >
      {isPending && isYoungerThan48h(row.created_at) ? (
        <Notice tone="warning" title="Posted less than 48 hours ago">
          Likes may still be settling.
        </Notice>
      ) : null}

      {isPending && row.has_non_promo_access ? (
        <Notice
          tone="warning"
          title={`This user already has active ${row.current_plan.toUpperCase()} access${row.current_store ? ` via ${row.current_store}` : ''} until ${formatExpiry(row.current_expires_at)}.`}
        >
          Promo days start counting immediately — they are not banked for later. Approving now means the free days overlap
          access they already have, so the reward may be worth nothing to them. Consider asking them to claim again after
          their current plan ends.
        </Notice>
      ) : null}

      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Post URL</div>
        {/* Shown as text, never embedded: the URL is user-supplied content. */}
        <div className="mt-1 break-all font-mono text-sm text-slate-800 dark:text-slate-200">{row.post_url}</div>
        <a
          href={row.post_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          Open post in new tab ↗
        </a>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Screenshot proof</div>
          {row.screenshot_signed_url ? (
            <img
              src={row.screenshot_signed_url}
              alt="Share proof screenshot"
              className="mt-2 max-h-96 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain dark:border-slate-800 dark:bg-slate-950/40"
            />
          ) : (
            <div className="mt-2 rounded-2xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Screenshot unavailable (link expired — refresh the list).
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Claimed likes</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-white">{row.claimed_likes.toLocaleString()}</div>
          </div>

          {isPending ? (
            <>
              <div>
                <Label htmlFor="claim-verified-likes" className="mb-1">Likes you verified on the live post</Label>
                <TextInput
                  id="claim-verified-likes"
                  type="number"
                  min={0}
                  value={verifiedLikes}
                  onChange={(e) => applyVerifiedLikes(e.target.value)}
                />
                {gapPct >= 0.25 ? (
                  <div className="mt-2">
                    <Chip tone="danger">{`Claimed vs verified gap ${Math.round(gapPct * 100)}%`}</Chip>
                  </div>
                ) : null}
              </div>
              <div>
                <Label htmlFor="claim-days" className="mb-1">
                  Awarded days {suggested > 0 ? `(suggested: ${suggested})` : '(below lowest tier)'}
                </Label>
                <TextInput id="claim-days" type="number" min={1} max={180} value={days} onChange={(e) => setDays(e.target.value)} />
                <div className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Ladder: {SOCIAL_SHARE_TIERS.map((t) => `${t.likes}→${t.days}d`).join(' · ')}
                </div>
              </div>
              <div>
                <Label htmlFor="claim-note" className="mb-1">Note (required to reject — shown to the user)</Label>
                <Textarea id="claim-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="text-sm" />
              </div>
            </>
          ) : (
            <FactGrid
              items={[
                ['Verified likes', row.approved_likes?.toLocaleString() ?? '-'],
                ['Awarded', row.awarded_days ? `+${row.awarded_days} days` : '-'],
                ['Reviewed', formatDateTime(row.reviewed_at)],
                ...(row.review_note ? ([['Note', row.review_note]] as [string, string][]) : []),
              ]}
            />
          )}
        </section>
      </div>

    </SidePanel>
  );
}
