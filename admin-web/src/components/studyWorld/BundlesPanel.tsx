import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  BUNDLE_ID_RE,
  BUNDLE_MAX_PIECES,
  CATEGORY_LABEL,
  bundlePricing,
  deleteWorldBundle,
  hasDrawing,
  isPreset,
  listWorldBundles,
  listWorldItems,
  saveWorldBundle,
  setWorldBundleStatus,
  type BundlePiece,
  type BundleStatus,
  type ItemCategory,
  type WorldBundle,
  type WorldBundleInput,
  type WorldItem,
} from '../../lib/studyWorld';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';
import { AvatarArt, ItemPicture } from './WorldArt';
import { lookWearing } from './look';

type Kind = 'all' | 'bundles' | 'presets';

const EMPTY: WorldBundleInput = {
  id: '',
  name: '',
  emoji: '🎁',
  bundle_price: 0,
  items: [],
  status: 'hidden',
  sort_order: 100,
};

const label = (category: string) => CATEGORY_LABEL[category as ItemCategory] ?? category;
const pieceKey = (p: BundlePiece) => `${p.category}:${p.item_key}`;

/** Bundles and outfit presets: a few coin items sold together for less. */
export function BundlesPanel() {
  const [bundles, setBundles] = useState<WorldBundle[]>([]);
  const [items, setItems] = useState<WorldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [status, setStatus] = useState<BundleStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ isNew: boolean; input: WorldBundleInput } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, i] = await Promise.all([listWorldBundles(), listWorldItems()]);
      setBundles(b);
      setItems(i);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bundles.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const itemByKey = useMemo(() => new Map(items.map((i) => [`${i.category}:${i.item_key}`, i])), [items]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bundles.filter((b) =>
      (kind === 'all' || (kind === 'presets') === isPreset(b)) &&
      (status === 'all' || b.status === status) &&
      (!q || b.name.toLowerCase().includes(q) || b.id.includes(q)),
    );
  }, [bundles, kind, status, search]);

  const presetCount = bundles.filter(isPreset).length;
  const hiddenCount = bundles.filter((b) => b.status === 'hidden').length;
  const brokenCount = bundles.filter((b) => b.status === 'available' && !bundlePricing(b, items).forSale).length;

  async function quickStatus(bundle: WorldBundle, next: BundleStatus) {
    setSavingId(bundle.id);
    try {
      await setWorldBundleStatus(bundle.id, next);
      setBundles((all) => all.map((b) => (b.id === bundle.id ? { ...b, status: next } : b)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status.');
    } finally {
      setSavingId(null);
    }
  }

  function remove(bundle: WorldBundle) {
    requestSafeAction({
      title: `Delete "${bundle.name}"`,
      operation: isPreset(bundle) ? 'Delete outfit preset' : 'Delete bundle',
      affectedCount: 1,
      subject: `${bundle.id} · ${bundle.items.length} pieces`,
      irreversible: true,
      requireReason: true,
      warning: 'Players who already bought it keep every item and their coin history. It only leaves the shop. To take it off sale but keep it, set it to Hidden instead.',
      onConfirm: async () => {
        await deleteWorldBundle(bundle.id);
        await load();
      },
    });
  }

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-bold ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`;

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <ErrorBox message={error} />
      {brokenCount ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          {brokenCount} on-sale bundle{brokenCount === 1 ? '' : 's'} can’t be bought right now, because a piece is hidden, coming soon or not a coin item. Players see them but the Buy button fails. Look for the amber note below.
        </div>
      ) : null}

      <div className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={pill(kind === 'all')} onClick={() => setKind('all')}>All ({bundles.length})</button>
          <button type="button" className={pill(kind === 'bundles')} onClick={() => setKind('bundles')}>Bundles ({bundles.length - presetCount})</button>
          <button type="button" className={pill(kind === 'presets')} onClick={() => setKind('presets')}>Outfit presets ({presetCount})</button>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button type="button" className={pill(status === 'all')} onClick={() => setStatus('all')}>Any status</button>
          <button type="button" className={pill(status === 'available')} onClick={() => setStatus('available')}>On sale ({bundles.length - hiddenCount})</button>
          <button type="button" className={pill(status === 'hidden')} onClick={() => setStatus('hidden')}>Hidden ({hiddenCount})</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className={`${FIELD} ml-auto h-9 w-48`} />
          <button type="button" className={BTN_DARK} onClick={() => setEditing({ isNew: true, input: { ...EMPTY, id: kind === 'presets' ? 'p_' : '' } })}>+ New</button>
        </div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Players who already own some pieces pay less, worked out on the website, and never more than the missing pieces cost one by one. Ids starting with <code>p_</code> show on the website under “Outfit presets”.
        </p>
      </div>

      {loading ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>Loading…</div>
        : shown.length === 0 ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>No bundles match.</div>
        : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((bundle) => {
              const price = bundlePricing(bundle, items);
              return (
                <div key={bundle.id} className={`${CARD} flex flex-col overflow-hidden ${bundle.status === 'hidden' ? 'opacity-60' : ''}`}>
                  <button type="button" onClick={() => setEditing({ isNew: false, input: { ...bundle } })}
                    className="relative grid place-items-center bg-gradient-to-b from-sky-50 to-emerald-50 py-3 dark:from-slate-800 dark:to-slate-900" title="Edit">
                    <AvatarArt look={lookWearing(bundle.items)} scale={4} />
                    <span className="absolute left-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                      {isPreset(bundle) ? 'Preset' : 'Bundle'}
                    </span>
                    <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">
                      {bundle.bundle_price} coins
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div>
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{bundle.emoji} {bundle.name}</div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        {bundle.id} · {price.full ? `${price.full} coins one by one` : 'no price yet'}
                        {price.savePct != null ? ` · ${price.savePct > 0 ? `${price.savePct}% off` : 'no saving'}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {bundle.items.map((p) => {
                        const item = itemByKey.get(pieceKey(p));
                        return (
                          <span key={pieceKey(p)} title={`${label(p.category)}: ${item?.name ?? p.item_key}`}
                            className="grid place-items-center rounded-lg bg-slate-50 dark:bg-slate-800">
                            <ItemPicture category={p.category} itemKey={p.item_key} emoji={item?.emoji} drawn={hasDrawing(p.category as ItemCategory, p.item_key)} size={40} />
                          </span>
                        );
                      })}
                    </div>
                    {price.problems.length ? (
                      <div className="rounded-xl bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        Can’t be bought: {price.problems.join('; ')}.
                      </div>
                    ) : price.savePct != null && price.savePct <= 0 ? (
                      <div className="rounded-xl bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        Costs the same or more than the pieces one by one, so it saves players nothing.
                      </div>
                    ) : null}
                    <div className="mt-auto grid grid-cols-2 gap-1" role="group" aria-label={`${bundle.name} status`}>
                      {(['available', 'hidden'] as const).map((s) => (
                        <button key={s} type="button" disabled={savingId === bundle.id}
                          onClick={() => bundle.status !== s && void quickStatus(bundle, s)}
                          className={`rounded-lg py-1 text-[10px] font-black transition disabled:opacity-30 ${bundle.status === s ? (s === 'available' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white') : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {s === 'available' ? 'On sale' : 'Hidden'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className={`${BTN_LIGHT} h-7 flex-1`} onClick={() => setEditing({ isNew: false, input: { ...bundle } })}>Edit</button>
                      <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => remove(bundle)} aria-label={`Delete ${bundle.name}`}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {editing ? (
        <BundleEditor
          isNew={editing.isNew}
          initial={editing.input}
          items={items}
          takenIds={bundles.map((b) => b.id)}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function BundleEditor({
  isNew,
  initial,
  items,
  takenIds,
  onClose,
  onSaved,
}: {
  isNew: boolean;
  initial: WorldBundleInput;
  items: WorldItem[];
  takenIds: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState<WorldBundleInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coinItems = useMemo(() => items.filter((i) => i.tier === 'coins'), [items]);
  const categories = useMemo(() => [...new Set(coinItems.map((i) => i.category))], [coinItems]);
  const [addCategory, setAddCategory] = useState<string>(categories[0] ?? 'top');
  const [addKey, setAddKey] = useState('');
  const itemByKey = useMemo(() => new Map(items.map((i) => [`${i.category}:${i.item_key}`, i])), [items]);
  const price = bundlePricing(v, items);
  const set = <K extends keyof WorldBundleInput>(key: K, value: WorldBundleInput[K]) => setV((cur) => ({ ...cur, [key]: value }));

  const idProblem = !isNew
    ? null
    : !BUNDLE_ID_RE.test(v.id)
      ? 'Use 1–40 small letters, numbers, - or _ (no spaces).'
      : takenIds.includes(v.id)
        ? 'That id is already used.'
        : null;
  const canSave = !busy && !idProblem && v.name.trim().length > 0 && v.name.trim().length <= 60 &&
    v.items.length > 0 && v.items.length <= BUNDLE_MAX_PIECES && Number.isInteger(v.bundle_price) && v.bundle_price >= 0;

  const choices = coinItems.filter((i) => i.category === addCategory && !v.items.some((p) => p.category === i.category && p.item_key === i.item_key));

  function addPiece() {
    if (!addKey || v.items.length >= BUNDLE_MAX_PIECES) return;
    set('items', [...v.items, { category: addCategory, item_key: addKey }]);
    setAddKey('');
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveWorldBundle(isNew, { ...v, bundle_price: Math.round(v.bundle_price) });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'New bundle' : `Edit ${initial.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_LIGHT} onClick={onClose}>Cancel</button>
          <button type="button" className={BTN_DARK} disabled={!canSave} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <ErrorBox message={error} />
      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-b from-sky-50 to-emerald-50 p-3 dark:from-slate-800 dark:to-slate-900">
        <AvatarArt look={lookWearing(v.items)} scale={4} />
        <div className="min-w-0 space-y-1">
          <div className="text-lg font-black text-slate-950 dark:text-white">{v.emoji} {v.name || 'New bundle'}</div>
          <div className="text-xs font-semibold text-slate-500">
            {v.bundle_price} coins · {price.full} one by one{price.savePct != null ? ` · ${price.savePct}% off` : ''}
          </div>
          <div className="text-[11px] font-semibold text-slate-400">The default avatar wearing every piece, drawn by the website’s own code.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Id" hint={isNew ? (idProblem ?? (v.id.startsWith('p_') ? 'Shows under “Outfit presets”.' : 'Shows under “Bundles”. Start with p_ for a preset.')) : 'The id can’t be changed.'}>
          <input value={v.id} disabled={!isNew} onChange={(e) => set('id', e.target.value.toLowerCase().trim())} placeholder="e.g. p_beach" className={FIELD} />
        </Field>
        <Field label="Emoji">
          <input value={v.emoji} maxLength={16} onChange={(e) => set('emoji', e.target.value)} className={FIELD} />
        </Field>
        <Field label="Name">
          <input value={v.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Beach Day" className={FIELD} />
        </Field>
        <Field label="Status" hint="Hidden bundles never show to players.">
          <select value={v.status} onChange={(e) => set('status', e.target.value as BundleStatus)} className={FIELD}>
            <option value="available">On sale</option>
            <option value="hidden">Hidden</option>
          </select>
        </Field>
        <Field
          label="Bundle price (coins)"
          hint={price.full ? `One by one: ${price.full}. Suggested (about 20% off): ${price.suggested}.` : 'Add pieces to see the full price.'}
        >
          <div className="flex gap-2">
            <input type="number" min={0} step={10} value={v.bundle_price} onChange={(e) => set('bundle_price', Math.max(0, Math.round(Number(e.target.value) || 0)))} className={FIELD} />
            {price.full ? (
              <button type="button" className={BTN_LIGHT} onClick={() => set('bundle_price', price.suggested)}>Use</button>
            ) : null}
          </div>
        </Field>
        <Field label="Order" hint="Smaller numbers show first.">
          <input type="number" step={10} value={v.sort_order} onChange={(e) => set('sort_order', Math.round(Number(e.target.value) || 0))} className={FIELD} />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Pieces ({v.items.length}/{BUNDLE_MAX_PIECES})
        </div>
        {v.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">Add at least one piece.</div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {v.items.map((p) => {
              const item = itemByKey.get(pieceKey(p));
              const ok = item && item.tier === 'coins' && item.price_coins != null && item.status === 'available';
              return (
                <li key={pieceKey(p)} className="flex items-center gap-3 px-3 py-2">
                  <ItemPicture category={p.category} itemKey={p.item_key} emoji={item?.emoji} drawn={hasDrawing(p.category as ItemCategory, p.item_key)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900 dark:text-white">{item?.name ?? p.item_key}</div>
                    <div className={`text-[11px] font-semibold ${ok ? 'text-slate-400' : 'text-amber-700 dark:text-amber-300'}`}>
                      {label(p.category)} · {item ? (item.tier === 'coins' ? `${item.price_coins ?? 0} coins` : 'not a coin item') : 'not in the shop'}
                      {item && item.status !== 'available' ? ` · ${item.status === 'hidden' ? 'hidden' : 'coming soon'}` : ''}
                    </div>
                  </div>
                  <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => set('items', v.items.filter((x) => pieceKey(x) !== pieceKey(p)))} aria-label={`Remove ${item?.name ?? p.item_key}`}>Remove</button>
                </li>
              );
            })}
          </ul>
        )}
        {v.items.length < BUNDLE_MAX_PIECES ? (
          <div className="flex gap-2">
            <select value={addCategory} onChange={(e) => { setAddCategory(e.target.value); setAddKey(''); }} className={`${FIELD} w-40`} aria-label="Piece type">
              {categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
            <select value={addKey} onChange={(e) => setAddKey(e.target.value)} className={FIELD} aria-label="Piece">
              <option value="">Choose a coin item…</option>
              {choices.map((i) => (
                <option key={i.id} value={i.item_key}>
                  {i.name} · {i.price_coins ?? 0} coins{i.status !== 'available' ? ` (${i.status === 'hidden' ? 'hidden' : 'coming soon'})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className={BTN_DARK} disabled={!addKey} onClick={addPiece}>Add</button>
          </div>
        ) : null}
        {price.problems.length ? (
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
            Players can’t buy this yet: {price.problems.join('; ')}. Put those items on sale in the Items tab, or remove them.
          </p>
        ) : null}
      </div>

      {!isNew && 'updated_at' in initial ? (
        <p className="text-[11px] font-semibold text-slate-400">Last changed {when((initial as WorldBundle).updated_at)}.</p>
      ) : null}
    </Modal>
  );
}
