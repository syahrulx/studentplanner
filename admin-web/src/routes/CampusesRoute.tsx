import React, { useEffect, useMemo, useState } from 'react';
import { listCampuses, createCampus, updateCampus, deleteCampus, type AdminCampusRow, listUniversities, type UniversityRow } from '../lib/api';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Label, TextInput } from '../ui/Input';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection, MotionStagger, MotionStaggerItem } from '../ui/motion';

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

export function CampusesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminCampusRow[]>([]);
  const [editing, setEditing] = useState<AdminCampusRow | null>(null);
  const [query, setQuery] = useState('');
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [expandedUnis, setExpandedUnis] = useState<Set<string>>(new Set());

  const toggleUni = (id: string) => {
    setExpandedUnis(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const [all, unis] = await Promise.all([listCampuses(), listUniversities()]);
      setItems(all);
      setUniversities(unis);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load campuses');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const form = useMemo(() => {
    const base: AdminCampusRow =
      editing ?? ({
        id: '',
        university_id: '',
        name: '',
        created_at: '',
      });
    return base;
  }, [editing]);

  const filtered = useMemo(() => {
    let list = items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.university_id.toLowerCase().includes(q));
    }
    if (searchQuery.trim()) {
      list = list.filter((u) =>
        matchesAdminSearch(searchQuery, u.name, u.university_id),
      );
    }
    return list;
  }, [items, query, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminCampusRow[]>();
    for (const c of filtered) {
      if (!map.has(c.university_id)) map.set(c.university_id, []);
      map.get(c.university_id)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Campuses</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage university campuses for the community.
        </div>
      </MotionSection>

      <MotionStagger className="mt-6 grid gap-4 xl:grid-cols-[420px_1fr]">
        <MotionStaggerItem>
          <MotionPanel className="h-full">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Campus list</CardTitle>
                  <CardDescription>{busy ? 'Loading…' : `${filtered.length} shown`}</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    setEditing({
                      id: '',
                      university_id: '',
                      name: '',
                      created_at: '',
                    })
                  }
                >
                  + Add
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  <div>
                    <Label>Search</Label>
                    <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or university" />
                  </div>

                  {err ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                      {err}
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full">
                      <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">University</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {grouped.map(([uniId, groupCampuses]) => {
                          const isExpanded = expandedUnis.has(uniId) || (query.trim() || searchQuery.trim() ? true : false); // auto expand if searching
                          const uniName = universities.find((u) => u.id === uniId)?.name || '';
                          return (
                            <React.Fragment key={uniId}>
                              <tr
                                className="cursor-pointer bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 transition"
                                onClick={() => toggleUni(uniId)}
                              >
                                <td colSpan={3} className="px-4 py-3 font-black text-slate-800 dark:text-slate-200">
                                  <div className="flex items-center justify-between">
                                    <div className="truncate">
                                      <span className="text-brand-600 dark:text-brand-400">{uniId.toUpperCase()}</span>
                                      {uniName && <span className="text-slate-500 dark:text-slate-400 font-semibold ml-2">— {uniName}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-full shadow-sm border border-slate-200 dark:border-slate-700/50">
                                        {groupCampuses.length} campus{groupCampuses.length !== 1 ? 'es' : ''}
                                      </div>
                                      <span
                                        className="inline-block text-slate-400 transition-transform duration-200"
                                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                      >
                                        ▼
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded &&
                                groupCampuses.map((u) => (
                                  <tr
                                    key={u.id}
                                    className="cursor-pointer bg-white transition hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/40"
                                    onClick={() => setEditing(u)}
                                  >
                                    <td className="px-4 py-3 pl-8 relative">
                                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-200 dark:bg-brand-900/50" />
                                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{u.name}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                                      {u.university_id.toUpperCase()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="inline-flex gap-2">
                                        <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(u); }}>
                                          Edit
                                        </Button>
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const ok = confirm(`Delete ${u.name}?`);
                                            if (!ok) return;
                                            await deleteCampus(u.id);
                                            if (editing?.id === u.id) setEditing(null);
                                            await refresh();
                                          }}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })}

                        {filtered.length === 0 && !busy ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                              {items.length > 0 && (query.trim() || searchQuery.trim())
                                ? 'No campuses match your filters.'
                                : 'No campuses found.'}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </MotionPanel>
        </MotionStaggerItem>

        <MotionStaggerItem>
          <MotionPanel className="h-full">
            <Card className="min-h-[420px]">
              <CardHeader>
                <div>
                  <CardTitle>{editing?.id ? 'Edit campus' : 'Setup'}</CardTitle>
                  <CardDescription>Configure campus details.</CardDescription>
                </div>
                {editing ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                    Close
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                {!editing ? (
                  <div className="grid place-items-center rounded-3xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-800">
                    <div className="text-sm font-black text-slate-900 dark:text-slate-100">Select a campus</div>
                    <div className="mt-1 max-w-md text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Pick one from the list to edit, or click <span className="font-black text-slate-700 dark:text-slate-200">+ Add</span>.
                    </div>
                  </div>
                ) : (
                  <CampusEditor
                    key={editing.id || 'new'}
                    initial={form}
                    universities={universities}
                    onCancel={() => setEditing(null)}
                    onSaved={async () => {
                      setEditing(null);
                      await refresh();
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </MotionPanel>
        </MotionStaggerItem>
      </MotionStagger>
    </div>
  );
}

function CampusEditor({
  initial,
  universities,
  onCancel,
  onSaved,
}: {
  initial: AdminCampusRow;
  universities: UniversityRow[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [universityId, setUniversityId] = useState(initial.university_id || (universities[0]?.id ?? ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <div className="mt-4 space-y-3">
      <Input label="Campus Name" value={name} onChange={setName} placeholder="e.g. Puncak Alam" />
      
      <label className="block">
        <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
        <select
          value={universityId}
          onChange={(e) => setUniversityId(e.target.value)}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value="" disabled>Select University</option>
          {universities.map(u => (
            <option key={u.id} value={u.id}>{u.id.toUpperCase()} - {u.name}</option>
          ))}
        </select>
      </label>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-4">
        <button
          disabled={busy || !name.trim() || !universityId.trim()}
          className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              if (initial.id) {
                await updateCampus(initial.id, name.trim());
              } else {
                await createCampus(universityId.trim(), name.trim());
              }
              await onSaved();
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Failed to save');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        <button
          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
