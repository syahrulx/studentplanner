import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeActionDialog } from '../SafeActionDialog';
import {
  CATEGORY_LABEL,
  ITEM_CATEGORIES,
  deleteWorldItem,
  hasDrawing,
  listWorldItems,
  saveWorldItem,
  setWorldItemsStatus,
  type ItemCategory,
  type ItemStatus,
  type WorldItem,
  type WorldItemInput,
} from '../../lib/studyWorld';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Modal } from './ui';
import { ItemPicture } from './WorldArt';

const EMPTY: WorldItemInput = {
  category: 'hair',
  item_key: '',
  name: '',
  description: null,
  emoji: null,
  tier: 'free',
  price_coins: null,
  price_myr: null,
  status: 'coming_soon',
  release_at: null,
  featured: false,
  sort_order: 100,
};

function priceLabel(item: WorldItem): string {
  if (item.tier === 'free') return 'Free';
  if (item.tier === 'premium') return item.price_myr != null ? `Premium · RM ${Number(item.price_myr).toFixed(2)}` : 'Premium';
  return `${item.price_coins ?? 0} coins`;
}

/** Every purchasable thing in Study World, grouped by category. */
export function ItemsPanel() {
  const [items, setItems] = useState<WorldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [status, setStatus] = useState<ItemStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; input: WorldItemInput } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listWorldItems());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load items.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (category === 'all' || i.category === category) &&
      (status === 'all' || i.status === status) &&
      (!q || i.name.toLowerCase().includes(q) || i.item_key.includes(q)),
    );
  }, [items, category, status, search]);

  const counts = useMemo(() => {
    const c = { available: 0, coming_soon: 0, hidden: 0 };
    items.forEach((i) => { c[i.status] += 1; });
    return c;
  }, [items]);

  async function quickStatus(item: WorldItem, next: ItemStatus) {
    if (next === 'available' && !hasDrawing(item.category, item.item_key)) {
      setError(`"${item.name}" has no drawing in the website yet, so it cannot be made available. Keep it as coming soon until the art is added to the website code.`);
      return;
    }
    setSavingId(item.id);
    try {
      await setWorldItemsStatus([item.id], next);
      setItems((all) => all.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change status.');
    } finally {
      setSavingId(null);
    }
  }

  function bulk(next: ItemStatus) {
    const targets = shown.filter((i) => i.status !== next && (next !== 'available' || hasDrawing(i.category, i.item_key)));
    if (!targets.length) return;
    requestSafeAction({
      title: `Set ${targets.length} item(s) to "${next.replace('_', ' ')}"`,
      operation: 'Change status',
      affectedCount: targets.length,
      subject: targets.slice(0, 8).map((t) => t.name).join(', ') + (targets.length > 8 ? '…' : ''),
      warning: 'Players see this on the website straight away. Items people already own are not taken away, but hidden items leave the shop.',
      onConfirm: async () => {
        const n = await setWorldItemsStatus(targets.map((t) => t.id), next);
        await load();
        return { affected: n, failed: targets.length - n };
      },
    });
  }

  function remove(item: WorldItem) {
    requestSafeAction({
      title: `Delete "${item.name}"`,
      operation: 'Delete item',
      affectedCount: 1,
      subject: `${CATEGORY_LABEL[item.category]} · ${item.item_key}`,
      irreversible: true,
      requireReason: true,
      warning: hasDrawing(item.category, item.item_key)
        ? 'This item is drawn by the website. Deleting the row puts it back to the website’s built-in name and price. To take it out of the shop, set it to Hidden instead.'
        : 'This removes the item row. It cannot be undone.',
      onConfirm: async () => {
        await deleteWorldItem(item.id);
        await load();
      },
    });
  }

  const STATUS_BTN: { id: ItemStatus; label: string; on: string }[] = [
    { id: 'available', label: 'On sale', on: 'bg-emerald-600 text-white' },
    { id: 'coming_soon', label: 'Soon', on: 'bg-sky-600 text-white' },
    { id: 'hidden', label: 'Hidden', on: 'bg-slate-700 text-white' },
  ];
  const perCategory = (c: ItemCategory) => items.filter((i) => i.category === c).length;

  return (
    <div className="space-y-4 p-4">
      {safeActionDialog}
      <ErrorBox message={error} />

      <div className={`${CARD} space-y-3 p-4`}>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...ITEM_CATEGORIES] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${category === c ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
              {c === 'all' ? `All (${items.length})` : `${CATEGORY_LABEL[c]} (${perCategory(c)})`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['all', `Everything`],
            ['available', `On sale (${counts.available})`],
            ['coming_soon', `Coming soon (${counts.coming_soon})`],
            ['hidden', `Hidden (${counts.hidden})`],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatus(id)}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${status === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
              {label}
            </button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className={`${FIELD} ml-auto h-9 w-48`} />
          <button type="button" className={BTN_DARK} onClick={() => setEditing({ id: null, input: { ...EMPTY, category: category === 'all' ? 'hair' : category } })}>+ New item</button>
        </div>
      </div>

      {loading ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>Loading…</div>
        : shown.length === 0 ? <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>No items match.</div>
        : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {shown.map((item) => {
              const drawn = hasDrawing(item.category, item.item_key);
              return (
                <div key={item.id} className={`${CARD} flex flex-col overflow-hidden ${item.status === 'hidden' ? 'opacity-60' : ''}`}>
                  <button type="button" onClick={() => setEditing({ id: item.id, input: { ...item } })}
                    className="relative grid place-items-center bg-gradient-to-b from-sky-50 to-emerald-50 py-3 dark:from-slate-800 dark:to-slate-900" title="Edit">
                    <ItemPicture category={item.category} itemKey={item.item_key} emoji={item.emoji} drawn={drawn} size={120} />
                    {item.featured ? <span className="absolute left-2 top-2 rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">Featured</span> : null}
                    <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black ${item.tier === 'premium' ? 'bg-violet-500 text-white' : item.tier === 'coins' ? 'bg-amber-400 text-amber-950' : 'bg-white/80 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>
                      {priceLabel(item)}
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div>
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{item.emoji ? `${item.emoji} ` : ''}{item.name}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{CATEGORY_LABEL[item.category]}{item.status === 'coming_soon' && item.release_at ? ` · ${when(item.release_at).split(',')[0]}` : ''}</div>
                    </div>
                    <div className="mt-auto grid grid-cols-3 gap-1" role="group" aria-label={`${item.name} status`}>
                      {STATUS_BTN.map((b) => (
                        <button key={b.id} type="button" disabled={savingId === item.id || (b.id === 'available' && !drawn)}
                          onClick={() => item.status !== b.id && void quickStatus(item, b.id)}
                          title={b.id === 'available' && !drawn ? 'Needs a drawing in the website first' : undefined}
                          className={`rounded-lg py-1 text-[10px] font-black transition disabled:opacity-30 ${item.status === b.id ? b.on : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className={`${BTN_LIGHT} h-7 flex-1`} onClick={() => setEditing({ id: item.id, input: { ...item } })}>Edit</button>
                      <button type="button" className={`${BTN_LIGHT} h-7`} onClick={() => remove(item)} aria-label={`Delete ${item.name}`}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {shown.length ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-slate-500">
          For all {shown.length} shown:
          <button type="button" className={BTN_LIGHT} onClick={() => bulk('available')}>Put on sale</button>
          <button type="button" className={BTN_LIGHT} onClick={() => bulk('coming_soon')}>Mark coming soon</button>
          <button type="button" className={BTN_LIGHT} onClick={() => bulk('hidden')}>Hide</button>
        </div>
      ) : null}

      {editing ? (
        <ItemEditor
          id={editing.id}
          initial={editing.input}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function ItemEditor({ id, initial, onClose, onSaved }: { id: string | null; initial: WorldItemInput; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<WorldItemInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof WorldItemInput>(key: K, value: WorldItemInput[K]) => setV((old) => ({ ...old, [key]: value }));
  const drawn = hasDrawing(v.category, v.item_key);
  const isCafe = v.category === 'drink' || v.category === 'snack';

  const problem =
    !/^[a-z0-9_-]{1,32}$/.test(v.item_key) ? 'Key: lowercase letters, numbers, - or _ (max 32).'
    : !v.name.trim() ? 'Give it a name.'
    : v.tier === 'coins' && (v.price_coins == null || v.price_coins < 0) ? 'Coins items need a coin price.'
    : v.status === 'available' && !drawn ? 'This key has no drawing in the website yet. Use “Coming soon” until the art is added.'
    : null;

  async function save() {
    if (problem) return;
    setBusy(true);
    try {
      await saveWorldItem(id, { ...v, name: v.name.trim(), description: v.description?.trim() || null, emoji: v.emoji?.trim() || null });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={id ? `Edit ${initial.name}` : 'New item'}
      onClose={onClose}
      footer={<>
        <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BTN_DARK} onClick={() => void save()} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-b from-sky-50 to-emerald-50 p-3 dark:from-slate-800 dark:to-slate-900">
        <ItemPicture category={v.category} itemKey={v.item_key} emoji={v.emoji} drawn={drawn} size={150} animate />
        {!isCafe && v.category !== 'pet' && drawn ? (
          <ItemPicture category={v.category} itemKey={v.item_key} drawn whole size={150} animate />
        ) : null}
        <div className="min-w-0 space-y-1">
          <div className="text-lg font-black text-slate-950 dark:text-white">{v.emoji && isCafe ? `${v.emoji} ` : ''}{v.name || 'New item'}</div>
          <div className="text-xs font-semibold text-slate-500">{CATEGORY_LABEL[v.category]} · {v.tier === 'free' ? 'Free' : v.tier === 'coins' ? `${v.price_coins ?? 0} coins` : 'Premium'}</div>
          <div className="text-[11px] font-semibold text-slate-400">{isCafe ? 'How it shows on the website café menu.' : 'Close-up, and worn by the default avatar — drawn by the website’s own code.'}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select value={v.category} disabled={!!id} onChange={(e) => set('category', e.target.value as ItemCategory)} className={FIELD}>
            {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Key" hint={id ? 'The key links to the website drawing, so it cannot change.' : 'Must match the website code id.'}>
          <input value={v.item_key} disabled={!!id} onChange={(e) => set('item_key', e.target.value.toLowerCase())} className={`${FIELD} font-mono`} />
        </Field>
      </div>
      {!drawn ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          The website has no drawing for “{v.item_key || '…'}” yet. You can add it now as “Coming soon” so players see it is on the way. A developer must add its pixel art to the website before it can go on sale.
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Name"><input value={v.name} maxLength={40} onChange={(e) => set('name', e.target.value)} className={FIELD} /></Field>
        {isCafe ? <Field label="Emoji"><input value={v.emoji ?? ''} maxLength={8} onChange={(e) => set('emoji', e.target.value)} className={FIELD} /></Field> : <div />}
      </div>
      <Field label="Description (optional)">
        <input value={v.description ?? ''} maxLength={200} onChange={(e) => set('description', e.target.value)} className={FIELD} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Tier">
          <select value={v.tier} onChange={(e) => set('tier', e.target.value as WorldItemInput['tier'])} className={FIELD}>
            <option value="free">Free</option>
            <option value="coins">Coins</option>
            <option value="premium">Premium</option>
          </select>
        </Field>
        <Field label="Coin price">
          <input type="number" min={0} disabled={v.tier !== 'coins'} value={v.price_coins ?? ''} onChange={(e) => set('price_coins', e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))))} className={FIELD} />
        </Field>
        <Field label="RM price (demo)" hint="Not charged. Syahrul sets real prices.">
          <input type="number" min={0} step="0.10" disabled={v.tier !== 'premium'} value={v.price_myr ?? ''} onChange={(e) => set('price_myr', e.target.value === '' ? null : Number(e.target.value))} className={FIELD} />
        </Field>
      </div>
      {id && !isCafe && initial.tier === 'free' && v.tier !== 'free' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          This item is free today. Once it is {v.tier === 'coins' ? 'a coins item' : 'premium'}, the world only lets people wear it if they own it, so players already wearing it for free will lose it from their look. Their owned items and coins are not touched.
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status">
          <select value={v.status} onChange={(e) => set('status', e.target.value as ItemStatus)} className={FIELD}>
            <option value="available" disabled={!drawn}>Available</option>
            <option value="coming_soon">Coming soon</option>
            <option value="hidden">Hidden</option>
          </select>
        </Field>
        <Field label="Coming on (optional)">
          <input type="date" value={v.release_at ? v.release_at.slice(0, 10) : ''} onChange={(e) => set('release_at', e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)} className={FIELD} />
        </Field>
        <Field label="Order"><input type="number" value={v.sort_order} onChange={(e) => set('sort_order', Math.floor(Number(e.target.value) || 0))} className={FIELD} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={v.featured} onChange={(e) => set('featured', e.target.checked)} className="h-4 w-4 accent-slate-900" /> Featured in the shop
      </label>
      <p className="text-xs font-semibold text-slate-500">The release date is shown to players only. It does not switch the item on by itself — change the status when it is ready.</p>
      {problem ? <div className="text-xs font-bold text-rose-600">{problem}</div> : null}
      <ErrorBox message={error} />
    </Modal>
  );
}

