import { useEffect, useMemo, useState } from 'react';
import { listOrganizations, createOrganization, updateOrganization, deleteOrganization, type AdminOrganizationRow, listUniversities, type UniversityRow, listCampuses, type AdminCampusRow } from '../lib/api';
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

export function OrganizationsRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminOrganizationRow[]>([]);
  const [editing, setEditing] = useState<AdminOrganizationRow | null>(null);
  const [query, setQuery] = useState('');
  
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [campuses, setCampuses] = useState<AdminCampusRow[]>([]);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const [all, unis, camps] = await Promise.all([listOrganizations(), listUniversities(), listCampuses()]);
      setItems(all);
      setUniversities(unis);
      setCampuses(camps);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load organizations');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const form = useMemo(() => {
    const base: AdminOrganizationRow =
      editing ?? ({
        id: '',
        university_id: '',
        campus_id: null,
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

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Organizations</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage university clubs and organizations for the community.
        </div>
      </MotionSection>

      <MotionStagger className="mt-6 grid gap-4 xl:grid-cols-[420px_1fr]">
        <MotionStaggerItem>
          <MotionPanel className="h-full">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Organization list</CardTitle>
                  <CardDescription>{busy ? 'Loading…' : `${filtered.length} shown`}</CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    setEditing({
                      id: '',
                      university_id: '',
                      campus_id: null,
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
                          <th className="px-4 py-3">Organization</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filtered.map((u) => {
                           const camp = campuses.find(c => c.id === u.campus_id);
                           return (
                          <tr
                            key={u.id}
                            className="cursor-pointer bg-white transition hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/40"
                            onClick={() => setEditing(u)}
                          >
                            <td className="px-4 py-3">
                              <div className="text-sm font-black text-slate-900 dark:text-slate-100">{u.name}</div>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {u.university_id.toUpperCase()}
                              {camp ? ` · ${camp.name}` : ' · All Campuses'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const ok = confirm(`Delete ${u.name}?`);
                                    if (!ok) return;
                                    await deleteOrganization(u.id);
                                    if (editing?.id === u.id) setEditing(null);
                                    await refresh();
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )})}

                        {filtered.length === 0 && !busy ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                              {items.length > 0 && (query.trim() || searchQuery.trim())
                                ? 'No organizations match your filters.'
                                : 'No organizations found.'}
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
                  <CardTitle>{editing?.id ? 'Edit organization' : 'Setup'}</CardTitle>
                  <CardDescription>Configure organization details.</CardDescription>
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
                    <div className="text-sm font-black text-slate-900 dark:text-slate-100">Select an organization</div>
                    <div className="mt-1 max-w-md text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Pick one from the list to edit, or click <span className="font-black text-slate-700 dark:text-slate-200">+ Add</span>.
                    </div>
                  </div>
                ) : (
                  <OrganizationEditor
                    key={editing.id || 'new'}
                    initial={form}
                    universities={universities}
                    campuses={campuses}
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

function OrganizationEditor({
  initial,
  universities,
  campuses,
  onCancel,
  onSaved,
}: {
  initial: AdminOrganizationRow;
  universities: UniversityRow[];
  campuses: AdminCampusRow[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [universityId, setUniversityId] = useState(initial.university_id || (universities[0]?.id ?? ''));
  const [campusId, setCampusId] = useState(initial.campus_id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const availableCampuses = useMemo(() => {
    return campuses.filter(c => c.university_id === universityId);
  }, [campuses, universityId]);

  // Reset campus if university changes
  useEffect(() => {
    if (initial.id === '' && availableCampuses.length > 0 && !availableCampuses.find(c => c.id === campusId)) {
      setCampusId('');
    }
  }, [universityId, availableCampuses, campusId, initial.id]);

  return (
    <div className="mt-4 space-y-3">
      <Input label="Organization Name" value={name} onChange={setName} placeholder="e.g. Computer Science Club" />
      
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

      <label className="block">
        <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Campus (Optional)</div>
        <select
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value="">All Campuses</option>
          {availableCampuses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
                await updateOrganization(initial.id, campusId || null, name.trim());
              } else {
                await createOrganization(universityId.trim(), campusId || null, name.trim());
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
