import { useCallback, useEffect, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  deleteCoinPack,
  getWorldSettings,
  listCoinPacks,
  saveCoinPack,
  saveWorldSettings,
  type CoinPack,
  type ItemStatus,
} from '../../lib/studyWorld';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { DemoNote, ErrorBox, Field, Modal } from './ui';

type PackInput = Omit<CoinPack, 'id' | 'updated_at'>;
const EMPTY: PackInput = { name: '', coins: 100, bonus_coins: 0, price_myr: 1.9, status: 'coming_soon', best_value: false, sort_order: 100 };
const rm = (n: number | null | undefined) => (n == null ? '—' : `RM ${Number(n).toFixed(2)}`);

/**
 * Coin packs and premium pass prices. DEMO ONLY: nothing here takes money.
 * Syahrul owns real pricing and the payment flow (Curlec); see the note below.
 */
export function PaymentsPanel() {
  const [packs, setPacks] = useState<CoinPack[]>([]);
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
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <DemoNote>
        No real payment happens yet. These prices are placeholders so the shop can be designed and tested.
        <b> Syahrul</b> will set the final prices and connect the payment provider. Until then the website never charges anyone and coins stay pretend coins in the player’s browser.
      </DemoNote>
      <ErrorBox message={error} />
      {saved ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">{saved}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">Coin packs</div>
              <div className="text-xs font-semibold text-slate-500">What players could buy coins with. Start as “coming soon”.</div>
            </div>
            <button type="button" className={BTN_DARK} onClick={() => setEditing({ id: null, input: EMPTY })}>+ New pack</button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              <tr><th className="px-5 py-2">Pack</th><th className="px-5 py-2">Coins</th><th className="px-5 py-2">Price (demo)</th><th className="px-5 py-2">Status</th><th className="px-5 py-2" /></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">Loading…</td></tr>
                : packs.length === 0 ? <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">No packs.</td></tr>
                : packs.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800/70">
                    <td className="px-5 py-3 font-black text-slate-900 dark:text-white">{p.name}{p.best_value ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">Best value</span> : null}</td>
                    <td className="px-5 py-3 font-semibold">{p.coins.toLocaleString()}{p.bonus_coins ? <span className="text-emerald-600"> +{p.bonus_coins}</span> : null}</td>
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
                ))}
            </tbody>
          </table>
        </section>

        <section className={`${CARD} space-y-3 p-5`}>
          <div className="text-sm font-black text-slate-900 dark:text-white">Premium pass (demo)</div>
          <p className="text-xs font-semibold text-slate-500">Not used right now: Plus items come free with Rencana Plus, and Pro items with Rencana Pro (Pro also gets every Plus item). Kept only in case a separate RenCity pass is sold later.</p>
          <Field label="Monthly (RM)"><input type="number" min={0} step="0.10" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={FIELD} /></Field>
          <Field label="Yearly (RM)"><input type="number" min={0} step="0.10" value={yearly} onChange={(e) => setYearly(e.target.value)} className={FIELD} /></Field>
          <button type="button" className={BTN_DARK} onClick={() => void savePremium()}>Save demo prices</button>
        </section>
      </div>

      <section className={`${CARD} p-5`}>
        <div className="text-sm font-black text-slate-900 dark:text-white">Payment records</div>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Empty until real payments are switched on. When Syahrul connects payments, purchases should be recorded by the server (like the existing Curlec billing tables) and coins granted by the server — never by the browser.
        </p>
        <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-3">
          <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">1. Player picks a pack on the website</div>
          <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">2. Payment provider confirms payment to our server</div>
          <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">3. Server adds coins / items to the account and logs it here</div>
        </div>
      </section>

      {editing ? <PackEditor id={editing.id} initial={editing.input} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setSaved('Coin pack saved.'); await load(); }} /> : null}
    </div>
  );
}

function PackEditor({ id, initial, onClose, onSaved }: { id: string | null; initial: PackInput; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<PackInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = v.name.trim() && v.coins >= 1 && v.price_myr >= 0;

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
        <Field label="Coins"><input type="number" min={1} value={v.coins} onChange={(e) => setV({ ...v, coins: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className={FIELD} /></Field>
        <Field label="Bonus coins"><input type="number" min={0} value={v.bonus_coins} onChange={(e) => setV({ ...v, bonus_coins: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={FIELD} /></Field>
        <Field label="Price RM (demo)"><input type="number" min={0} step="0.10" value={v.price_myr} onChange={(e) => setV({ ...v, price_myr: Number(e.target.value) || 0 })} className={FIELD} /></Field>
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
      <p className="text-xs font-semibold text-slate-500">“Available” only shows the pack in the shop. The website still cannot take payment until Syahrul connects it, so the buy button stays disabled.</p>
      <ErrorBox message={error} />
      {id ? <div className="text-[11px] text-slate-400">Last saved {when((initial as CoinPack).updated_at)}</div> : null}
    </Modal>
  );
}

