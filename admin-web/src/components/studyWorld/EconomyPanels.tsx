import { useCallback, useEffect, useState } from 'react';
import {
  BOARDS,
  getEconomyOverview,
  getLeaderboard,
  listWallets,
  type BoardId,
  type BoardRow,
  type EconomyOverview,
  type WalletRow,
} from '../../lib/studyWorldEconomy';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Stat } from './ui';
import { PlayerDrawer } from './PlayersPanel';

function Totals() {
  const [o, setO] = useState<EconomyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getEconomyOverview().then(setO).catch((e) => setError(e instanceof Error ? e.message : 'Could not load totals.'));
  }, []);
  if (error) return <ErrorBox message={error} />;
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Stat label="Players with a wallet" value={o ? o.players_with_wallet : '—'} />
      <Stat label="Coins in wallets" value={o ? Number(o.coins_in_wallets).toLocaleString() : '—'} />
      <Stat label="Fish in bags" value={o ? o.fish_in_bags : '—'} />
      <Stat label="Ultra rare in bags" value={o ? o.ultra_in_bags : '—'} />
      <Stat label="Coins from fishing, 7 days" value={o ? Number(o.coins_from_fishing_7d).toLocaleString() : '—'} />
      <Stat label="Coins from selling, 7 days" value={o ? Number(o.coins_from_sales_7d).toLocaleString() : '—'} />
    </div>
  );
}

const PAGE = 25;

/** Every wallet: coins, worms, bag and items, with search. Click a row for the full bag. */
export function WalletsPanel() {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [sort, setSort] = useState<'coins' | 'fish' | 'recent'>('coins');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWallets(applied, sort, PAGE, page * PAGE));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallets.');
    } finally {
      setLoading(false);
    }
  }, [applied, sort, page]);
  useEffect(() => { void load(); }, [load]);
  const total = rows[0]?.total_count ?? 0;

  return (
    <div className="space-y-4 p-4">
      {viewing ? <PlayerDrawer userId={viewing} onClose={() => setViewing(null)} onChanged={load} /> : null}
      <Totals />
      <ErrorBox message={error} />
      <form className={`${CARD} flex flex-wrap items-end gap-3 p-4`} onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(query.trim()); }}>
        <Field label="Search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nickname, name, email or user id" className={`${FIELD} w-72`} /></Field>
        <Field label="Sort by">
          <select value={sort} onChange={(e) => { setPage(0); setSort(e.target.value as typeof sort); }} className={`${FIELD} w-44`}>
            <option value="coins">Most coins</option>
            <option value="fish">Most fish in bag</option>
            <option value="recent">Recently active</option>
          </select>
        </Field>
        <button type="submit" className={BTN_DARK}>Search</button>
        <div className="ml-auto text-xs font-bold text-slate-400">{total} wallet(s)</div>
      </form>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
            <tr><th className="px-4 py-3">Player</th><th className="px-4 py-3 text-right">Coins</th><th className="px-4 py-3 text-right">Worms</th><th className="px-4 py-3 text-right">Fish</th><th className="px-4 py-3 text-right">Ultra</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3">Last active</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No wallets yet.</td></tr>
              : rows.map((r) => (
                <tr key={r.user_id} onClick={() => setViewing(r.user_id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3"><div className="font-black text-slate-900 dark:text-white">{r.nickname || '—'}</div><div className="text-xs text-slate-400">{r.name ? `${r.name} · ` : ''}{r.email || r.user_id}</div></td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-amber-600">{Number(r.coins).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.worms}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.fish_in_bag}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.ultra_in_bag ? <b className="text-amber-600">{r.ultra_in_bag}</b> : 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.items_owned}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{when(r.last_active)}</td>
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

/** The players' leaderboards (plus "Richest"), with the account behind each nickname. */
export function LeaderboardsPanel() {
  const [board, setBoard] = useState<BoardId>('biggest_fish');
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const info = BOARDS.find((b) => b.id === board)!;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getLeaderboard(board, 50));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [board]);
  useEffect(() => { void load(); }, [load]);

  const format = (v: number) => (board === 'biggest_fish' ? `${Number(v).toFixed(2)} kg` : `${Number(v).toLocaleString()} ${info.unit}`);

  return (
    <div className="space-y-4 p-4">
      {viewing ? <PlayerDrawer userId={viewing} onClose={() => setViewing(null)} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {BOARDS.map((b) => (
          <button key={b.id} type="button" onClick={() => setBoard(b.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${board === b.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
            {b.label}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs font-semibold text-slate-500">
        {board === 'coins' ? 'Richest wallets right now. Admins only: players never see this board.'
          : board === 'collection' ? 'All time: how many kinds of fish each player has caught without a worm.'
          : 'This week (Monday–Sunday, Malaysia time). Fish caught with a worm don’t count.'}
        {' '}Players see nicknames only; you also see the account.
      </p>
      <ErrorBox message={error} />
      <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
        {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading…</div>
          : rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No one on this board yet.</div>
          : rows.map((r) => (
            <button key={r.user_id} type="button" onClick={() => setViewing(r.user_id)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${r.rank === 1 ? 'bg-amber-400 text-amber-950' : r.rank === 2 ? 'bg-slate-300 text-slate-800' : r.rank === 3 ? 'bg-orange-300 text-orange-950' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{r.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-black text-slate-900 dark:text-white">{r.nickname || 'Player'}</span>
                <span className="block truncate text-xs text-slate-400">{r.email || r.user_id}</span>
              </span>
              <span className="shrink-0 font-black tabular-nums text-slate-900 dark:text-white">{format(r.value)}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
