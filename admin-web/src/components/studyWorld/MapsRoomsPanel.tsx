import { useCallback, useEffect, useState } from 'react';
import { hasMapArt, listWorldMaps, saveWorldMap, useLiveCounts, type ItemStatus, type WorldMap } from '../../lib/studyWorld';
import { MapPreview } from './WorldArt';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD } from './format';
import { ErrorBox, Field, Modal, StatusBadge } from './ui';

/**
 * Rooms are made by the website as people arrive ("Campus 1", "Campus 2"…,
 * "Campus Pro lounge 1"…; see serversFor() in its src/lib/study-world/rooms.ts),
 * so this lists the rooms that have real people in them right now. Private
 * rooms are never announced, so they never appear. Each room holds at most
 * 25 people, and each map has at most 5 open rooms and 5 Pro lounges (website
 * ROOM_LIMIT and MAX_ROOMS_PER_MAP).
 */
const ROOM_LIMIT = 25;
const MAX_ROOMS = 5;
const roomNumber = (room: string) => Number(room.match(/(\d+)\s*$/)?.[1] ?? 0);
const byNumber = (a: string, b: string) => roomNumber(a) - roomNumber(b) || a.localeCompare(b);

function RoomRow({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${count ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{name}</span>
      <span className="ml-auto shrink-0 tabular-nums text-xs font-black text-slate-900 dark:text-white">
        {count}<span className="font-semibold text-slate-400">/{ROOM_LIMIT}</span>
      </span>
    </div>
  );
}

export function MapsRoomsPanel() {
  const live = useLiveCounts();
  const [maps, setMaps] = useState<WorldMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorldMap | null>(null);

  const load = useCallback(async () => {
    try {
      setMaps(await listWorldMaps());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load maps.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(map: WorldMap, change: Partial<WorldMap>) {
    const next = { ...map, ...change };
    if (next.status === 'available' && !hasMapArt(next.map_key)) {
      setError(`The website has no "${next.map_key}" map built yet, so it can only be "coming soon".`);
      return;
    }
    setBusy(map.map_key);
    try {
      const { updated_at: _ignored, ...row } = next;
      void _ignored;
      await saveWorldMap(row, false);
      setMaps((all) => all.map((m) => (m.map_key === map.map_key ? next : m)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save map.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <p className="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Live numbers are real people in each room right now (up to {ROOM_LIMIT} per room, {MAX_ROOMS} open rooms and {MAX_ROOMS} Pro lounges per map). Each room also has helper bots, which are not counted here.
        {live.connected ? '' : ' Connecting to the live count…'}
      </p>
      {maps.map((m) => {
        const counts = live.byMap[m.map_key]?.rooms ?? {};
        const rooms = Object.keys(counts).filter((r) => counts[r] > 0 && !/^private room/i.test(r));
        const pro = rooms.filter((r) => /pro lounge/i.test(r)).sort(byNumber);
        const open = rooms.filter((r) => !/pro lounge/i.test(r)).sort(byNumber);
        const total = rooms.reduce((sum, r) => sum + counts[r], 0);
        const off = m.status !== 'available';
        return (
          <section key={m.map_key} className={`${CARD} grid overflow-hidden md:grid-cols-[320px_1fr]`}>
            <div className="relative border-b border-slate-200 md:border-b-0 md:border-r dark:border-slate-800">
              <MapPreview mapKey={m.map_key} className={`h-56 md:h-full ${off ? 'opacity-50 grayscale' : ''}`} />
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black text-white">
                {total} {total === 1 ? 'person' : 'people'} now
              </span>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-black text-slate-900 dark:text-white">{m.name}</div>
                <StatusBadge status={m.status} />
                {m.pro_only ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Pro only</span> : null}
                <div className="ml-auto flex items-center gap-2">
                  <select value={m.status} disabled={busy === m.map_key} onChange={(e) => void patch(m, { status: e.target.value as ItemStatus })} className={`${FIELD} h-8 w-auto text-xs`} aria-label={`${m.name} status`}>
                    <option value="available">Open</option>
                    <option value="coming_soon">Coming soon</option>
                    <option value="hidden">Hidden</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={m.pro_only} disabled={busy === m.map_key} onChange={(e) => void patch(m, { pro_only: e.target.checked })} className="h-4 w-4 accent-slate-900" /> Pro only
                  </label>
                </div>
              </div>
              <div className="-mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>{m.description || 'No description'}</span>
                <button type="button" className="text-brand-600 underline" onClick={() => setEditing(m)}>Rename / describe</button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Open world</div>
                  {open.length ? open.map((r) => <RoomRow key={r} name={r} count={counts[r]} />) : <div className="py-1 text-sm text-slate-400">No one here right now</div>}
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-violet-500">Pro lounges</div>
                  {pro.length ? pro.map((r) => <RoomRow key={r} name={r} count={counts[r]} />) : <div className="py-1 text-sm text-slate-400">No one here right now</div>}
                </div>
              </div>
            </div>
          </section>
        );
      })}
      {editing ? (
        <MapTextEditor
          map={editing}
          onClose={() => setEditing(null)}
          onSave={async (name, description) => {
            await patch(editing, { name, description });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Change the name and short description players see in the lobby and map switcher. */
function MapTextEditor({ map, onClose, onSave }: { map: WorldMap; onClose: () => void; onSave: (name: string, description: string | null) => Promise<void> }) {
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description ?? '');
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length >= 1 && name.trim().length <= 40 && description.length <= 200;
  return (
    <Modal title={`Edit ${map.name}`} onClose={onClose} footer={<>
      <button type="button" className={BTN_LIGHT} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BTN_DARK} disabled={!ok || busy} onClick={async () => {
        setBusy(true);
        try { await onSave(name.trim(), description.trim() || null); } finally { setBusy(false); }
      }}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <Field label="Name" hint="Rooms are named after the map (e.g. “Garden 1”). Renaming changes the room names for people who join after this.">
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={FIELD} />
      </Field>
      <Field label={`Description (${description.length}/200)`} hint="Shown under the map in the lobby.">
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} className={FIELD} />
      </Field>
    </Modal>
  );
}
