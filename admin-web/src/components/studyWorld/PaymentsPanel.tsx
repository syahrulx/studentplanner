import { useCallback, useEffect, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  deleteCoinPack,
  getCoinConfig,
  getWorldSettings,
  listCoinOrders,
  listCoinPacks,
  packCoins,
  saveCoinConfig,
  saveCoinPack,
  saveWorldSettings,
  type CoinOrder,
  type CoinOrderStatus,
  type CoinPack,
  type ItemStatus,
} from '../../lib/studyWorld';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';

type PackInput = Omit<CoinPack, 'id' | 'updated_at'>;
const EMPTY: PackInput = { name: '', coins: 100, bonus_coins: 0, price_myr: 1.9, status: 'coming_soon', best_value: false, sort_order: 100 };
const rm = (n: number | null | undefined) => (n == null ? '—' : `RM ${Number(n).toFixed(2)}`);

const ORDER_STATUS: Record<CoinOrderStatus, { label: string; tone: string }> = {
  created: { label: 'Not paid', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  paid: { label: 'Paid', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  partially_refunded: { label: 'Part refunded', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  refunded: { label: 'Refunded', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
};

/**
 * RenCity coin packs, the coin conversion rate and coin payments. Players pay
 * with Curlec on the website; the website's server works out the coins from
 * the rate below when an order is made and credits them once paid.
 */
export function PaymentsPanel() {
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [orders, setOrders] = useState<CoinOrder[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [rateSavedAt, setRateSavedAt] = useState<string | null>(null);
  const [coinError, setCoinError] = useState<string | null>(null);
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; input: PackInput } | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([listCoinPacks(), getWorldSettings()]);
      setPacks(p);
      setMonthly(s?.premium_monthly_myr != null ? String(s.premium_monthly_myr) : '');
      setYearly(s?.premium_yearly_myr != null ? String(s.premium_yearly_myr) : '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments.');
    }
    // Coin purchases come from a later migration: load them on their own.
    try {
      const [c, o] = await Promise.all([getCoinConfig(), listCoinOrders()]);
      setRate(c?.coins_per_myr ?? null);
      setRateInput(c?.coins_per_myr != null ? String(c.coins_per_myr) : '');
      setLimitInput(c?.monthly_limit_myr != null ? String(c.monthly_limit_myr) : '');
      setEnabled(c?.purchases_enabled ?? false);
      setRateSavedAt(c?.updated_at ?? null);
      setOrders(o);
      setCoinError(null);
    } catch (e) {
      setCoinError(e instanceof Error ? e.message : 'Could not load coin purchases.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rateValue = rateInput.trim() === '' ? null : Number(rateInput);
  const limitValue = limitInput.trim() === '' ? null : Number(limitInput);
  const rateOk = rateValue == null || (Number.isFinite(rateValue) && rateValue > 0);
  const limitOk = limitValue == null || (Number.isFinite(limitValue) && limitValue > 0);

  async function saveRate() {
    if (!rateOk || !limitOk) return;
    try {
      await saveCoinConfig({
        coins_per_myr: rateValue == null ? null : Math.round(rateValue * 100) / 100,
        purchases_enabled: enabled,
        monthly_limit_myr: limitValue == null ? null : Math.round(limitValue * 100) / 100,
      });
      setSaved('Coin rate saved. The shop uses it for new orders straight away.');
      await load();
    } catch (e) {
      setCoinError(e instanceof Error ? e.message : 'Could not save the coin rate.');
    }
  }

  async function savePremium() {
    try {
      await saveWorldSettings({
        premium_monthly_myr: monthly === '' ? null : Number(monthly),
        premium_yearly_myr: yearly === '' ? null : Number(yearly),
      });
      setSaved('Premium demo prices saved.');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  async function quickStatus(pack: CoinPack, status: ItemStatus) {
    try {
      await saveCoinPack(pack.id, { ...pack, status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status.');
    }
  }

  const paid = orders.filter((o) => o.status !== 'created');
  const revenue = paid.reduce((sum, o) => sum + Number(o.price_myr) - o.refunded_sen / 100, 0);
  const unrecovered = orders.reduce((sum, o) => sum + o.coins_unrecovered, 0);

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100">
        Coin packs are paid with Curlec on the website. A pack marked <b>Available</b> can be bought for real money.
        Coins are worked out on the server from the rate below when the player checks out, and added once Curlec confirms the payment.
      </div>
      <ErrorBox message={error} />
      {saved ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">{saved}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">Coin packs</div>
              <div className="text-xs font-semibold text-slate-500">
                {rate == null ? 'No rate set: each pack gives its own coins.' : `Rate ${rate} coins per RM1, plus each pack's bonus.`}
              </div>
            </div>
            <button type="button" className={BTN_DARK} onClick={() => setEditing({ id: null, input: EMPTY })}>+ New pack</button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              <tr><th className="px-5 py-2">Pack</th><th className="px-5 py-2">Player gets</th><th className="px-5 py-2">Price</th><th className="px-5 py-2">Status</th><th className="px-5 py-2" /></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
                : packs.length === 0 ? <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No packs.</td></tr>
                : packs.map((p) => {
                  const gets = packCoins(p, rate);
                  return (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800/70">
                      <td className="px-5 py-3 font-black text-slate-900 dark:text-white">{p.name}{p.best_value ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">Best value</span> : null}</td>
                      <td className="px-5 py-3 font-semibold">
                        {gets.total.toLocaleString()} coins
                        {p.bonus_coins ? <span className="text-emerald-600"> (incl. +{p.bonus_coins})</span> : null}
                        {rate != null && p.price_myr < 1 ? <div className="text-[11px] text-rose-600">Price must be at least RM 1.00 to sell.</div> : null}
                      </td>
                      <td className="px-5 py-3 font-semibold">{rm(p.price_myr)}</td>
                      <td className="px-5 py-3">
                        <select value={p.status} onChange={(e) => void quickStatus(p, e.target.value as ItemStatus)} className={`${FIELD} h-8 w-auto text-xs`}>
                          <option value="available">Available</option><option value="coming_soon">Coming soon</option><option value="hidden">Hidden</option>
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" className={BTN_LIGHT} onClick={() => setEditing({ id: p.id, input: { ...p } })}>Edit</button>
                          <button type="button" className={BTN_LIGHT} onClick={() => requestSafeAction({
                            title: `Delete coin pack "${p.name}"`, operation: 'Delete pack', affectedCount: 1, irreversible: true,
                            onConfirm: async () => { await deleteCoinPack(p.id); await load(); },
                          })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          <section className={`${CARD} space-y-3 p-5`}>
            <div className="text-sm font-black text-slate-900 dark:text-white">Coin rate</div>
            <ErrorBox message={coinError} />
            <Field label="Coins per RM1" hint="Leave empty to use each pack's own coins.">
              <input type="number" min={0} step="1" value={rateInput} placeholder="Use pack coins" onChange={(e) => setRateInput(e.target.value)} className={FIELD} />
            </Field>
            <Field label="Monthly limit per player (RM)" hint="Net of refunds. Leave empty for no limit.">
              <input type="number" min={0} step="1" value={limitInput} placeholder="No limit" onChange={(e) => setLimitInput(e.target.value)} className={FIELD} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-slate-900" /> Coin purchases on
            </label>
            {!rateOk || !limitOk ? <p className="text-xs font-semibold text-rose-600">Use a number above 0, or leave it empty.</p> : null}
            <button type="button" className={BTN_DARK} disabled={!rateOk || !limitOk || Boolean(coinError && !rateSavedAt)} onClick={() => void saveRate()}>Save coin rate</button>
            <p className="text-[11px] font-semibold text-slate-400">
              Orders already started keep the coins they were quoted.{rateSavedAt ? ` Last saved ${when(rateSavedAt)}.` : ''}
            </p>
          </section>

          <section className={`${CARD} space-y-3 p-5`}>
            <div className="text-sm font-black text-slate-900 dark:text-white">Premium pass (demo)</div>
            <p className="text-xs font-semibold text-slate-500">Not used right now: Plus items come free with Rencana Plus, and Pro items with Rencana Pro (Pro also gets every Plus item). Kept only in case a separate RenCity pass is sold later.</p>
            <Field label="Monthly (RM)"><input type="number" min={0} step="0.10" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={FIELD} /></Field>
            <Field label="Yearly (RM)"><input type="number" min={0} step="0.10" value={yearly} onChange={(e) => setYearly(e.target.value)} className={FIELD} /></Field>
            <button type="button" className={BTN_DARK} onClick={() => void savePremium()}>Save demo prices</button>
          </section>
        </div>
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="text-sm font-black text-slate-900 dark:text-white">Payment records</div>
            <div className="text-xs font-semibold text-slate-500">
              Latest 50 coin orders. Refund from the Curlec dashboard; the coins are taken back automatically.
            </div>
          </div>
          <div className="flex gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>{paid.length} paid</span>
            <span>{rm(revenue)} net</span>
            {unrecovered ? <span className="text-rose-600">{unrecovered.toLocaleString()} refunded coins already spent</span> : null}
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            <tr><th className="px-5 py-2">When</th><th className="px-5 py-2">Player</th><th className="px-5 py-2">Pack</th><th className="px-5 py-2">Coins</th><th className="px-5 py-2">Status</th><th className="px-5 py-2">Curlec payment</th></tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
              : coinError ? <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">{coinError}</td></tr>
              : orders.length === 0 ? <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">No coin purchases yet.</td></tr>
              : orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800/70">
                  <td className="px-5 py-3 text-xs font-semibold text-slate-500">{when(o.paid_at ?? o.created_at)}</td>
                  <td className="px-5 py-3 font-mono text-xs" title={o.user_id}>{o.user_id.slice(0, 8)}</td>
                  <td className="px-5 py-3 font-semibold">{o.pack_name} <span className="text-slate-400">· {rm(o.price_myr)}</span></td>
                  <td className="px-5 py-3 font-semibold">
                    {o.coins.toLocaleString()}
                    {o.coins_per_myr != null ? <span className="text-[11px] text-slate-400"> @ {Number(o.coins_per_myr)}/RM</span> : null}
                    {o.coins_reclaimed || o.coins_unrecovered ? (
                      <div className="text-[11px] text-rose-600">
                        −{o.coins_reclaimed.toLocaleString()} taken back{o.coins_unrecovered ? `, ${o.coins_unrecovered.toLocaleString()} already spent` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${ORDER_STATUS[o.status].tone}`}>{ORDER_STATUS[o.status].label}</span>
                    {o.refunded_sen ? <div className="mt-1 text-[11px] text-slate-500">{rm(o.refunded_sen / 100)} refunded</div> : null}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{o.razorpay_payment_id ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {editing ? <PackEditor id={editing.id} initial={editing.input} rate={rate} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setSaved('Coin pack saved.'); await load(); }} /> : null}
    </div>
  );
}

function PackEditor({ id, initial, rate, onClose, onSaved }: { id: string | null; initial: PackInput; rate: number | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<PackInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sellable = v.price_myr >= 1;
  const ok = v.name.trim() && v.coins >= 1 && v.price_myr >= 0 && (v.status !== 'available' || sellable);
  const gets = packCoins(v, rate);

  async function save() {
    if (!ok) return;
    setBusy(true);
    try {
      await saveCoinPack(id, { ...v, name: v.name.trim() });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={id ? `Edit ${initial.name}` : 'New coin pack'} onClose={onClose} footer={<>
      <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BTN_DARK} onClick={() => void save()} disabled={busy || !ok}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <Field label="Name"><input value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} className={FIELD} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Price RM"><input type="number" min={1} step="0.10" value={v.price_myr} onChange={(e) => setV({ ...v, price_myr: Number(e.target.value) || 0 })} className={FIELD} /></Field>
        <Field label="Bonus coins"><input type="number" min={0} value={v.bonus_coins} onChange={(e) => setV({ ...v, bonus_coins: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={FIELD} /></Field>
        <Field label={rate == null ? 'Coins' : 'Coins (no rate)'}><input type="number" min={1} value={v.coins} onChange={(e) => setV({ ...v, coins: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className={FIELD} /></Field>
      </div>
      <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        Player gets <b>{gets.total.toLocaleString()} coins</b>
        {rate == null
          ? ' (this pack’s coins + bonus).'
          : ` (RM ${Number(v.price_myr).toFixed(2)} × ${rate} = ${gets.base.toLocaleString()}, + ${v.bonus_coins} bonus). “Coins” is only used if the rate is cleared.`}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ItemStatus })} className={FIELD}>
            <option value="available">Available</option><option value="coming_soon">Coming soon</option><option value="hidden">Hidden</option>
          </select>
        </Field>
        <Field label="Order"><input type="number" value={v.sort_order} onChange={(e) => setV({ ...v, sort_order: Math.floor(Number(e.target.value) || 0) })} className={FIELD} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={v.best_value} onChange={(e) => setV({ ...v, best_value: e.target.checked })} className="h-4 w-4 accent-slate-900" /> Mark as best value</label>
      <p className="text-xs font-semibold text-slate-500">
        “Available” puts the pack on sale for real money in the RenCity shop. {!sellable ? <span className="text-rose-600">Price must be at least RM 1.00 to sell.</span> : null}
      </p>
      <ErrorBox message={error} />
      {id ? <div className="text-[11px] text-slate-400">Last saved {when((initial as CoinPack).updated_at)}</div> : null}
    </Modal>
  );
}
