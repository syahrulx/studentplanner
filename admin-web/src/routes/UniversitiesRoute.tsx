import { useEffect, useMemo, useState } from 'react';
import { deleteUniversity, getMapping, listUniversities, saveMapping, testFetch, upsertUniversity, type UniversityRow } from '../lib/api';
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

export function UniversitiesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<UniversityRow[]>([]);
  const [editing, setEditing] = useState<UniversityRow | null>(null);
  const [query, setQuery] = useState('');

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const all = await listUniversities();
      setItems(all);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load universities');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const form = useMemo(() => {
    const base: UniversityRow =
      editing ?? ({
        id: '',
        name: '',
        api_endpoint: '',
        login_method: 'manual',
        request_method: 'GET',
        required_params: [],
        response_sample: null,
      } as any);
    return base;
  }, [editing]);

  const filtered = useMemo(() => {
    let list = items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
    }
    if (searchQuery.trim()) {
      list = list.filter((u) =>
        matchesAdminSearch(searchQuery, u.id, u.name, u.request_method, u.login_method, u.api_endpoint),
      );
    }
    return list;
  }, [items, query, searchQuery]);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Universities</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage universities and integrations.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              List filtered by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionStagger className="mt-6 grid gap-4 xl:grid-cols-[420px_1fr]">
        <MotionStaggerItem>
          <MotionPanel className="h-full">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>University list</CardTitle>
              <CardDescription>{busy ? 'Loading…' : `${filtered.length} shown`}</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() =>
                setEditing({
                  id: '',
                  name: '',
                  api_endpoint: '',
                  login_method: 'manual',
                  request_method: 'GET',
                  required_params: [],
                  response_sample: null,
                } as any)
              }
            >
              + Add
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div>
                <Label>Search</Label>
                <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by id or name" />
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
                      <th className="px-4 py-3">University</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((u) => (
                      <tr
                        key={u.id}
                        className="cursor-pointer bg-white transition hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/40"
                        onClick={() => setEditing(u)}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{u.name}</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{u.id}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {u.request_method} • {u.login_method}
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
                                const ok = confirm(`Delete ${u.id}?`);
                                if (!ok) return;
                                await deleteUniversity(u.id);
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

                    {filtered.length === 0 && !busy ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {items.length > 0 && (query.trim() || searchQuery.trim())
                            ? 'No universities match your filters. Adjust the list search or clear the top search.'
                            : 'No universities found.'}
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
              <CardTitle>{editing?.id ? 'Edit university' : 'Setup'}</CardTitle>
              <CardDescription>Configure endpoint, request method, params, and mappings.</CardDescription>
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
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">Select a university</div>
                <div className="mt-1 max-w-md text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Pick one from the list to edit, or click <span className="font-black text-slate-700 dark:text-slate-200">+ Add</span>.
                </div>
              </div>
            ) : (
              <UniEditor
                key={editing.id || 'new'}
                initial={form}
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

function UniEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: UniversityRow;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [api, setApi] = useState(initial.api_endpoint ?? '');
  const [loginMethod, setLoginMethod] = useState<UniversityRow['login_method']>(initial.login_method);
  const [reqMethod, setReqMethod] = useState<UniversityRow['request_method']>(initial.request_method);
  const [paramsJson, setParamsJson] = useState(() => JSON.stringify(initial.required_params ?? [], null, 2));
  const [testParamsJson, setTestParamsJson] = useState('{\n  \"studentId\": \"\",\n  \"password\": \"\"\n}');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testRes, setTestRes] = useState<any>(null);
  const [mappingJson, setMappingJson] = useState('{\n  \"subject_name\": \"subject_name\",\n  \"lecturer\": \"lecturer\",\n  \"class_time\": \"start_time\",\n  \"location\": \"location\"\n}');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id.trim()) return;
      try {
        const existing = await getMapping(id.trim());
        if (cancelled) return;
        if (existing?.timetable_mapping) setMappingJson(JSON.stringify(existing.timetable_mapping, null, 2));
      } catch {}
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mt-4 space-y-3">
      <Input label="University ID" value={id} onChange={setId} placeholder="e.g. uitm" />
      <Input label="Name" value={name} onChange={setName} placeholder="UiTM" />
      <Input label="API endpoint" value={api} onChange={setApi} placeholder="https://example.com/api" />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Login method</div>
          <select
            value={loginMethod}
            onChange={(e) => setLoginMethod(e.target.value as any)}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="manual">manual</option>
            <option value="api">api</option>
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Request method</div>
          <select
            value={reqMethod}
            onChange={(e) => setReqMethod(e.target.value as any)}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
      </div>

      <label className="block">
        <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Required params schema (JSON)</div>
        <textarea
          value={paramsJson}
          onChange={(e) => setParamsJson(e.target.value)}
          rows={5}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              const required_params = JSON.parse(paramsJson || '[]');
              await upsertUniversity({
                id: id.trim(),
                name: name.trim(),
                api_endpoint: api.trim() || null,
                login_method: loginMethod,
                request_method: reqMethod,
                required_params,
                response_sample: initial.response_sample ?? null,
              } as any);
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

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="text-sm font-black text-slate-900 dark:text-slate-100">Test Fetch</div>
        <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Calls the Supabase Edge Function `admin_test_fetch` (server-side proxy).
        </div>

        <label className="mt-3 block">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Test params (JSON)</div>
          <textarea
            value={testParamsJson}
            onChange={(e) => setTestParamsJson(e.target.value)}
            rows={5}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <div className="mt-3 flex gap-2">
          <button
            disabled={busy}
            className="h-11 rounded-2xl bg-slate-900 px-4 text-sm font-black text-white hover:bg-black disabled:opacity-70 dark:bg-slate-700 dark:hover:bg-slate-600"
            onClick={async () => {
              setBusy(true);
              setErr('');
              setTestRes(null);
              try {
                const params = JSON.parse(testParamsJson || '{}');
                const res = await testFetch(id.trim(), params);
                setTestRes(res);
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Test failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            Test Fetch
          </button>
        </div>

        {testRes ? (
          <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            {JSON.stringify(testRes, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="text-sm font-black text-slate-900 dark:text-slate-100">Data mapping</div>
        <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Map university response fields to GradeUp timetable fields. Stored per university.
        </div>

        <label className="mt-3 block">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Timetable mapping (JSON)</div>
          <textarea
            value={mappingJson}
            onChange={(e) => setMappingJson(e.target.value)}
            rows={7}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <div className="mt-3 flex gap-2">
          <button
            disabled={busy}
            className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                const mapping = JSON.parse(mappingJson || '{}');
                await saveMapping(id.trim(), mapping);
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Failed to save mapping');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save mapping
          </button>
        </div>
      </div>
    </div>
  );
}

