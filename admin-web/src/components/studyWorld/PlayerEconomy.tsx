import { useCallback, useEffect, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import { FISH, adjustCoins, getPlayerEconomy, type PlayerEconomy } from '../../lib/studyWorldEconomy';
import { CATEGORY_LABEL, type ItemCategory } from '../../lib/studyWorld';
import { BTN_DANGER, BTN_DARK, FIELD, when } from './format';
import { FishArt } from './WorldArt';

const RARITY_STYLE = {
  common: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  rare: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  ultra: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
} as const;

/** Wallet, bag, owned items and coin history for one player (inside the player panel). */
export function PlayerEconomySection({ userId, label }: { userId: string; label: string }) {
  const [data, setData] = useState<PlayerEconomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    try {
      setData(await getPlayerEconomy(userId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallet.');
    }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const delta = Math.trunc(Number(amount));
  const validDelta = Number.isFinite(delta) && delta !== 0 && Math.abs(delta) <= 100000;

  function adjust(sign: 1 | -1) {
    const n = Math.abs(delta) * sign;
    requestSafeAction({
      title: `${n > 0 ? 'Give' : 'Take'} ${Math.abs(n).toLocaleString()} coins ${n > 0 ? 'to' : 'from'} ${label}`,
      operation: n > 0 ? 'Give coins' : 'Take coins',
      affectedCount: 1,
      subject: `${label} · now ${(data?.state?.coins ?? 0).toLocaleString()} coins`,
      requireReason: true,
      warning: 'The player sees the new balance straight away. This is saved in their coin history and the admin log.',
      onConfirm: async (reason) => {
        const balance = await adjustCoins(userId, n, reason);
        setAmount('');
        await load();
        return { affected: 1, message: `New balance: ${Number(balance).toLocaleString()} coins.` };
      },
    });
  }

  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">{error}</div>;
  if (!data) return <div className="text-sm text-slate-400">Loading wallet…</div>;

  const state = data.state;
  const fish = [...data.fish].sort((a, b) => b.weight_kg - a.weight_kg);
  return (
    <div className="space-y-4">
      {safeActionDialog}
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Coins', (state?.coins ?? 0).toLocaleString()],
          ['Worms', `${state?.worms ?? 0}`],
          ['Trash carried', `${state?.trash ?? 0}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{k}</div>
            <div className="mt-0.5 text-xl font-black text-slate-900 dark:text-white">{v}</div>
          </div>
        ))}
      </div>
      {!state ? <div className="text-xs font-semibold text-slate-400">No wallet yet: this player hasn't fished or bought anything.</div> : null}
      {state?.boost_until && new Date(state.boost_until) > new Date() ? (
        <div className="text-xs font-bold text-emerald-600">Speed boost until {when(state.boost_until)}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
        <input type="number" min={1} max={100000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Coins" className={`${FIELD} h-9 w-28`} aria-label="Coins to give or take" />
        <button type="button" className={BTN_DARK} disabled={!validDelta} onClick={() => adjust(1)}>Give</button>
        <button type="button" className={BTN_DANGER} disabled={!validDelta} onClick={() => adjust(-1)}>Take</button>
        <span className="text-[11px] font-semibold text-slate-400">Needs a reason. Can't go below 0.</span>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Fish in bag ({fish.length})</div>
        {fish.length === 0 ? <div className="text-sm text-slate-400">Empty.</div> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fish.map((f) => {
              const info = FISH[f.species] ?? { name: f.species, rarity: 'common' as const };
              return (
                <div key={f.id} className={`rounded-2xl border p-2 text-center dark:border-slate-800 ${state?.held_fish === f.id ? 'border-brand-500' : 'border-slate-200'}`}>
                  <div className="grid place-items-center"><FishArt species={f.species} scale={2} animate={info.rarity === 'ultra'} /></div>
                  <div className="truncate text-xs font-black text-slate-900 dark:text-white">{info.name}</div>
                  <div className="text-[11px] font-semibold text-slate-500">{Number(f.weight_kg).toFixed(2)} kg{f.worm ? ' · worm' : ''}</div>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${RARITY_STYLE[info.rarity]}`}>{info.rarity}</span>
                  {state?.held_fish === f.id ? <div className="mt-1 text-[10px] font-bold text-brand-600">Holding</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Items bought ({data.owned.length})</div>
        {data.owned.length === 0 ? <div className="text-sm text-slate-400">None.</div> : (
          <div className="flex flex-wrap gap-1.5">
            {data.owned.map((key) => {
              const [cat, item] = key.split(':');
              return <span key={key} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{CATEGORY_LABEL[cat as ItemCategory] ?? cat}: {item}</span>;
            })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Coin history (last 50)</div>
        {data.ledger.length === 0 ? <div className="text-sm text-slate-400">No coin changes yet.</div> : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {data.ledger.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`w-16 shrink-0 font-black tabular-nums ${l.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{l.delta > 0 ? '+' : ''}{l.delta.toLocaleString()}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{l.reason}{l.detail ? <span className="text-slate-400"> · {l.detail}</span> : null}</span>
                <span className="shrink-0 text-[11px] text-slate-400">= {l.balance.toLocaleString()} · {when(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
