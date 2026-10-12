import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  banWorldPlayer,
  fixWorldAvatar,
  getPlayerDetail,
  REPORT_REASON_LABEL,
  toLook,
  listWorldBans,
  listWorldPlayers,
  unbanWorldPlayer,
  type PlayerDetail,
  type WorldBan,
  type WorldPlayer,
} from '../../lib/studyWorld';
import { BTN_DANGER, BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';
import { AvatarArt } from './WorldArt';
import { PlayerEconomySection } from './PlayerEconomy';

const PAGE = 25;
const LOOK_PARTS = ['hair', 'eyes', 'top', 'bottom', 'shoes', 'head', 'face', 'back', 'pet', 'effect', 'frame', 'bubble', 'entrance'] as const;
const LOOK_COLOURS = ['skin', 'hairColor', 'eyeColor', 'topColor', 'bottomColor', 'shoesColor'] as const;

/** A compact text-and-swatch view of a saved look (the pixel drawing lives in the website). */
export function LookSummary({ look }: { look: Record<string, unknown> }) {
  const parts = LOOK_PARTS.map((k) => [k, look[k]] as const).filter(([, v]) => typeof v === 'string' && v !== 'none');
  const colours = LOOK_COLOURS.map((k) => look[k]).filter((v): v is string => typeof v === 'string');
  if (!parts.length && !colours.length) return <span className="text-xs font-semibold text-slate-400">Default look</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {colours.map((c, i) => (
        <span key={`${c}-${i}`} title={c} className="h-4 w-4 rounded border border-slate-300 dark:border-slate-600"
          style={{ background: c.startsWith('#') ? c : c === 'galaxy' ? '#3730a3' : c === 'rainbow' ? 'linear-gradient(90deg,#f87171,#facc15,#4ade80,#60a5fa,#a78bfa)' : '#ccc' }} />
      ))}
      {parts.map(([k, v]) => (
        <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{k}: {String(v)}</span>
      ))}
    </div>
  );
}

function useBanFlow(onDone: () => Promise<void>) {
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();
  const [banTarget, setBanTarget] = useState<{ userId: string; label: string } | null>(null);

  const unban = (userId: string, label: string) =>
    requestSafeAction({
      title: `Lift RenCity ban: ${label}`,
      operation: 'Lift ban',
      affectedCount: 1,
      subject: `${label} (${userId})`,
      requireReason: true,
      warning: 'They can enter RenCity again straight away.',
      onConfirm: async (reason) => {
        const n = await unbanWorldPlayer(userId, reason);
        await onDone();
        return { affected: n, message: n ? '' : 'No open ban was found.' };
      },
    });

  const dialogs = (
    <>
      {safeActionDialog}
      {banTarget ? (
        <BanDialog target={banTarget} onClose={() => setBanTarget(null)} onBanned={async () => { setBanTarget(null); await onDone(); }} />
      ) : null}
    </>
  );
  return { ban: (userId: string, label: string) => setBanTarget({ userId, label }), unban, dialogs };
}

function BanDialog({ target, onClose, onBanned }: { target: { userId: string; label: string }; onClose: () => void; onBanned: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<string>('7');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = reason.trim().length >= 3 && typed.trim() === 'BAN';

  async function run() {
    if (!ok) return;
    setBusy(true);
    try {
      await banWorldPlayer(target.userId, reason.trim(), days === 'forever' ? null : Number(days));
      await onBanned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ban.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Ban from RenCity: ${target.label}`}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BTN_DANGER} onClick={() => void run()} disabled={!ok || busy}>{busy ? 'Banning…' : 'Ban'}</button>
      </>}
    >
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        This only blocks RenCity. Their Rencana account, planner and data are not touched. They see the reason when they try to enter.
      </p>
      <Field label="How long">
        <select value={days} onChange={(e) => setDays(e.target.value)} className={FIELD}>
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="forever">Until lifted</option>
        </select>
      </Field>
      <Field label="Reason (shown to the player)">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={`${FIELD} h-auto py-2`} placeholder="e.g. Harassing other players in chat" />
      </Field>
      <Field label="Type BAN to confirm">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={`${FIELD} font-mono`} />
      </Field>
      <ErrorBox message={error} />
    </Modal>
  );
}

type FixTarget = Pick<WorldPlayer, 'user_id' | 'nickname' | 'look'>;

function FixAvatarDialog({ player, onClose, onDone }: { player: FixTarget; onClose: () => void; onDone: () => Promise<void> }) {
  const [resetLook, setResetLook] = useState(false);
  const [nickname, setNickname] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nickBad = nickname.trim() !== '' && (nickname.trim().length < 3 || nickname.trim().length > 16 || /\s/.test(nickname.trim()));
  const ok = (resetLook || nickname.trim() !== '') && !nickBad && reason.trim().length >= 3;

  async function run() {
    if (!ok) return;
    setBusy(true);
    try {
      await fixWorldAvatar(player.user_id, resetLook, nickname.trim(), reason.trim());
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update avatar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Fix avatar: ${player.nickname}`}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BTN_DARK} onClick={() => void run()} disabled={!ok || busy}>{busy ? 'Saving…' : 'Apply'}</button>
      </>}
    >
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800"><AvatarArt look={toLook(player.look)} scale={2} animate={false} /><LookSummary look={player.look} /></div>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={resetLook} onChange={(e) => setResetLook(e.target.checked)} className="h-4 w-4 accent-slate-900" />
        Reset look to the default avatar
      </label>
      <Field label="New nickname (optional)" hint="3–16 characters, no spaces. Leave empty to keep it.">
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={16} className={FIELD} />
      </Field>
      {nickBad ? <div className="text-xs font-bold text-rose-600">Nickname must be 3–16 characters with no spaces.</div> : null}
      <Field label="Reason (saved in the log)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={FIELD} />
      </Field>
      <p className="text-xs font-semibold text-slate-500">
        The old look and nickname are saved in the activity log. The player’s browser picks up the change next time they open RenCity. Items they unlocked are not affected.
      </p>
      <ErrorBox message={error} />
    </Modal>
  );
}

/** Everyone who has made a Study World avatar. */
export function PlayersPanel() {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [filter, setFilter] = useState<'all' | 'banned' | 'reported'>('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<WorldPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [fixing, setFixing] = useState<WorldPlayer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWorldPlayers(applied, filter, PAGE, page * PAGE));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load players.');
    } finally {
      setLoading(false);
    }
  }, [applied, filter, page]);
  useEffect(() => { void load(); }, [load]);

  const { ban, unban, dialogs } = useBanFlow(load);
  const total = rows[0]?.total_count ?? 0;

  return (
    <div className="space-y-4 p-4">
      {dialogs}
      {fixing ? <FixAvatarDialog player={fixing} onClose={() => setFixing(null)} onDone={async () => { setFixing(null); await load(); }} /> : null}
      {viewing ? <PlayerDrawer userId={viewing} onClose={() => setViewing(null)} onChanged={load} /> : null}
      <ErrorBox message={error} />
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Privacy: players choose a world nickname so others cannot tell who they are. This list links nicknames to real accounts — use it only for moderation and do not share it.
      </div>
      <form
        className={`${CARD} flex flex-wrap items-end gap-3 p-4`}
        onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(query.trim()); }}
      >
        <Field label="Search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nickname, name, email or user id" className={`${FIELD} w-72`} /></Field>
        <Field label="Show">
          <select value={filter} onChange={(e) => { setPage(0); setFilter(e.target.value as typeof filter); }} className={`${FIELD} w-40`}>
            <option value="all">Everyone</option>
            <option value="banned">Banned now</option>
            <option value="reported">Reported</option>
          </select>
        </Field>
        <button type="submit" className={BTN_DARK}>Search</button>
        <div className="ml-auto text-xs font-bold text-slate-400">{total} player(s)</div>
      </form>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <tr><th className="px-4 py-3">Player</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Look</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-semibold text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-semibold text-slate-400">No players found.</td></tr>
            ) : rows.map((p) => (
              <tr key={p.user_id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800/70">
                <td className="px-4 py-3">
                  <div className="font-black text-slate-900 dark:text-white">{p.nickname}</div>
                  <div className="text-[11px] font-semibold text-slate-400">Saved {when(p.updated_at)} · {p.show_real_name ? 'friends see real name' : 'nickname only'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{p.name || '—'}</div>
                  <div className="text-xs text-slate-400">{p.email || p.user_id}</div>
                </td>
                <td className="px-4 py-3"><button type="button" title="View player" onClick={() => setViewing(p.user_id)}><AvatarArt look={toLook(p.look)} scale={2} animate={false} /></button></td>
                <td className="px-4 py-3">
                  {p.banned ? (
                    <div>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Banned</span>
                      <div className="mt-1 text-[11px] font-semibold text-slate-500">{p.ban_expires_at ? `until ${when(p.ban_expires_at)}` : 'until lifted'}</div>
                      <div className="text-[11px] text-slate-400">{p.ban_reason}</div>
                    </div>
                  ) : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Active</span>}
                  {p.report_count > 0 ? <div className="mt-1 text-[11px] font-bold text-amber-600">{p.report_count} report(s)</div> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className={BTN_DARK} onClick={() => setViewing(p.user_id)}>View</button>
                    <button type="button" className={BTN_LIGHT} onClick={() => setFixing(p)}>Fix avatar</button>
                    {p.banned
                      ? <button type="button" className={BTN_LIGHT} onClick={() => unban(p.user_id, p.nickname)}>Lift ban</button>
                      : <button type="button" className={BTN_DANGER} onClick={() => ban(p.user_id, p.nickname)}>Ban</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_LIGHT} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <button type="button" className={BTN_LIGHT} disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

/** Current (and optionally past) Study World bans. */
export function BansPanel() {
  const [includePast, setIncludePast] = useState(false);
  const [rows, setRows] = useState<WorldBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [manualId, setManualId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWorldBans(includePast));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bans.');
    } finally {
      setLoading(false);
    }
  }, [includePast]);
  useEffect(() => { void load(); }, [load]);
  const { ban, unban, dialogs } = useBanFlow(load);
  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(manualId.trim());

  return (
    <div className="space-y-4 p-4">
      {dialogs}
      {viewing ? <PlayerDrawer userId={viewing} onClose={() => setViewing(null)} onChanged={load} /> : null}
      <ErrorBox message={error} />
      <div className={`${CARD} flex flex-wrap items-end gap-3 p-4`}>
        <Field label="Ban by user id" hint="For someone with no avatar yet (copy the id from the Users page).">
          <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="00000000-0000-…" className={`${FIELD} w-80 font-mono`} />
        </Field>
        <button type="button" className={BTN_DANGER} disabled={!uuidOk} onClick={() => ban(manualId.trim(), manualId.trim())}>Ban</button>
        <label className="ml-auto flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} className="h-4 w-4 accent-slate-900" /> Show past bans
        </label>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <tr><th className="px-4 py-3">Player</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Until</th><th className="px-4 py-3">By</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-semibold text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center font-semibold text-slate-400">No bans.</td></tr>
            ) : rows.map((b) => (
              <tr key={b.id} className={`border-b border-slate-100 align-top last:border-0 dark:border-slate-800/70 ${b.active ? '' : 'opacity-60'}`}>
                <td className="px-4 py-3">
                  <div className="font-black text-slate-900 dark:text-white">{b.nickname || b.name || '—'}</div>
                  <div className="text-xs text-slate-400">{b.email || b.user_id}</div>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{b.reason}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                  {b.lifted_at ? <>Lifted {when(b.lifted_at)}{b.lift_reason ? <div className="text-slate-400">{b.lift_reason}</div> : null}</>
                    : b.expires_at ? (b.active ? when(b.expires_at) : `Ended ${when(b.expires_at)}`) : 'Until lifted'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{b.banned_by_email || '—'}<div>{when(b.created_at)}</div></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" className={BTN_LIGHT} onClick={() => setViewing(b.user_id)}>View</button>
                    {b.active ? <button type="button" className={BTN_LIGHT} onClick={() => unban(b.user_id, b.nickname || b.email || b.user_id)}>Lift ban</button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{value || '—'}</dd>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
        {title}{count !== undefined ? <span className="ml-1 text-slate-400">({count})</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Everything about one player, with the same ban / fix actions as the list. */
export function PlayerDrawer({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged?: () => Promise<void> | void }) {
  const [data, setData] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getPlayerDetail(userId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load player.');
    }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    await load();
    await onChanged?.();
  };
  const { ban, unban, dialogs } = useBanFlow(refresh);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // A ban / fix window on top handles its own Escape first.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[data-sw-modal], [role="dialog"][aria-modal="true"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const world = data?.world ?? null;
  const account = data?.account ?? null;
  const activeBan = data?.bans.find((b) => b.active) ?? null;
  const label = world?.nickname || account?.name || account?.email || userId;

  return (
    <>
      {dialogs}
      {fixing && world ? (
        <FixAvatarDialog
          player={{ user_id: userId, nickname: world.nickname, look: world.look }}
          onClose={() => setFixing(false)}
          onDone={async () => { setFixing(false); await refresh(); }}
        />
      ) : null}
      {createPortal(
        <div
          className="fixed inset-0 z-[140] flex justify-end bg-slate-950/50"
          onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
          <aside
            className="h-full w-full max-w-xl space-y-6 overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            role="dialog"
            aria-label={`Player ${label}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">RenCity player</div>
              <button type="button" onClick={onClose} className="text-sm font-black text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
            </div>
            <ErrorBox message={error} />
            {!data && !error ? <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading…</div> : null}

            {data ? (
              <>
                <div className="flex items-center gap-5">
                  <div className="grid min-h-[176px] min-w-[120px] place-items-center rounded-3xl bg-gradient-to-b from-sky-100 to-emerald-100 p-3 dark:from-slate-800 dark:to-slate-800">
                    {world ? <AvatarArt look={toLook(world.look)} scale={4} /> : <span className="text-xs font-bold text-slate-400">No avatar yet</span>}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-2xl font-black text-slate-950 dark:text-white">{world?.nickname ?? 'No avatar'}</div>
                    <div className="truncate text-sm font-semibold text-slate-600 dark:text-slate-300">{account?.name || '—'}</div>
                    <div className="truncate text-xs text-slate-400">{account?.email || userId}</div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeBan
                        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Banned {activeBan.expires_at ? `until ${when(activeBan.expires_at)}` : 'until lifted'}</span>
                        : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Can play</span>}
                      {world ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{world.show_real_name ? 'Friends see real name' : 'Nickname only'}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {world ? <button type="button" className={BTN_LIGHT} onClick={() => setFixing(true)}>Fix avatar</button> : null}
                  {activeBan
                    ? <button type="button" className={BTN_LIGHT} onClick={() => unban(userId, label)}>Lift ban</button>
                    : <button type="button" className={BTN_DANGER} onClick={() => ban(userId, label)}>Ban from RenCity</button>}
                </div>

                {world ? (
                  <Section title="Avatar">
                    <LookSummary look={world.look} />
                    <div className="text-xs font-semibold text-slate-400">Design last saved {when(world.updated_at)}</div>
                  </Section>
                ) : null}

                <Section title="Wallet & bag">
                  <PlayerEconomySection userId={userId} label={label} />
                </Section>

                <Section title="Rencana account">
                  <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <Row label="University" value={account?.university_name || account?.university_id} />
                    <Row label="Student id" value={account?.student_id} />
                    <Row label="Plan" value={[account?.subscription_plan, account?.subscription_status].filter(Boolean).join(' · ')} />
                    <Row label="Plan ends" value={account?.subscription_expires_at ? when(account.subscription_expires_at) : null} />
                    <Row label="Joined" value={account?.created_at ? when(account.created_at) : null} />
                    <Row label="Last sign-in" value={account?.last_sign_in_at ? when(account.last_sign_in_at) : null} />
                    <Row label="Device" value={account?.device_platform} />
                    <Row label="Country" value={account?.country} />
                    <Row label="Account status" value={account?.status} />
                    <Row label="User id" value={userId} />
                  </dl>
                </Section>

                <Section title="Reports about them" count={data.reports_against.length}>
                  {data.reports_against.length === 0 ? <div className="text-sm text-slate-400">None.</div> : data.reports_against.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{REPORT_REASON_LABEL[r.reason] ?? r.reason}</b>
                        <span className="text-xs uppercase text-slate-400">{r.status}</span>
                        <span className="ml-auto text-xs text-slate-400">{when(r.created_at)}</span>
                      </div>
                      {r.details ? <div className="mt-1 text-slate-600 dark:text-slate-300">{r.details}</div> : null}
                      <div className="mt-1 text-[11px] text-slate-400">
                        {r.by_account ? 'Linked to this account' : `Matched by nickname “${r.reported_nickname}” — check it was really them`}
                        {r.map_key ? ` · ${r.map_key}` : ''}{r.room ? ` · ${r.room}` : ''}
                      </div>
                    </div>
                  ))}
                </Section>

                <Section title="Bans" count={data.bans.length}>
                  {data.bans.length === 0 ? <div className="text-sm text-slate-400">Never banned.</div> : data.bans.map((b) => (
                    <div key={b.id} className={`rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-800 ${b.active ? '' : 'opacity-60'}`}>
                      <div className="font-semibold">{b.reason}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {when(b.created_at)} by {b.banned_by_email || '—'} · {b.lifted_at ? `lifted ${when(b.lifted_at)}${b.lift_reason ? ` (${b.lift_reason})` : ''}` : b.expires_at ? `until ${when(b.expires_at)}` : 'until lifted'}
                      </div>
                    </div>
                  ))}
                </Section>

                <Section title="Reports they sent" count={data.reports_sent.length}>
                  {data.reports_sent.length === 0 ? <div className="text-sm text-slate-400">None.</div> : data.reports_sent.slice(0, 20).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span>{REPORT_REASON_LABEL[r.reason] ?? r.reason}</span>
                      <span className="text-slate-400">about {r.reported_nickname || 'unknown'}</span>
                      <span className="ml-auto text-xs text-slate-400">{r.status} · {when(r.created_at)}</span>
                    </div>
                  ))}
                </Section>

                <Section title="Admin actions" count={data.admin_actions.length}>
                  {data.admin_actions.length === 0 ? <div className="text-sm text-slate-400">None.</div> : data.admin_actions.map((a) => (
                    <div key={a.id} className="text-sm">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] dark:bg-slate-800">{a.action}</span>
                      <span className="ml-2 text-slate-600 dark:text-slate-300">{a.reason || ''}</span>
                      <div className="text-[11px] text-slate-400">{a.admin_email || 'system'} · {when(a.created_at)}</div>
                    </div>
                  ))}
                </Section>

                <p className="text-xs font-semibold text-slate-400">
                  Private: this links a world nickname to a real person. Use it only for moderation.
                </p>
              </>
            ) : null}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
