import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteUniversity, getMapping, getUniversityDeleteImpact, listUniversities, saveMapping, testFetch, upsertUniversity, type UniversityRow } from '../lib/api';
import { Button } from '../ui/Button';
import { Select, TextInput, Textarea } from '../ui/Input';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { duplicateRecordIds, normaliseRecordName } from '../lib/dataQuality';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SidePanel, SkeletonRows } from '../ui/page';
import { Field, ListToolbar, PanelSection, RecordRow } from '../components/institutions/InstitutionUi';

const BLANK_UNIVERSITY: UniversityRow = {
  id: '',
  name: '',
  api_endpoint: '',
  login_method: 'manual',
  request_method: 'GET',
  required_params: [],
  response_sample: null,
};

export function UniversitiesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<UniversityRow[]>([]);
  const [editing, setEditing] = useState<UniversityRow | null>(null);
  const [query, setQuery] = useState('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);

  const duplicateIds = useMemo(
    () => duplicateRecordIds(items, (u) => `${String(u.country ?? 'MY').toUpperCase()}|${normaliseRecordName(u.name)}`),
    [items],
  );

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
    const base: UniversityRow = editing ?? { ...BLANK_UNIVERSITY };
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
    if (duplicatesOnly) list = list.filter((u) => duplicateIds.has(u.id));
    return list;
  }, [items, query, searchQuery, duplicatesOnly, duplicateIds]);

  const closeEditor = useCallback(() => setEditing(null), []);

  const handleDelete = async (u: UniversityRow) => {
    setErr('');
    try {
      const impact = await getUniversityDeleteImpact(u.id);
      if (impact.total > 0) {
        const detail = Object.entries(impact.counts)
          .filter(([, count]) => count > 0)
          .map(([name, count]) => `${name}: ${count}`)
          .join('\n');
        alert(`Cannot delete ${u.name}. Reassign these affected records first:\n\n${detail}`);
        return;
      }
      const ok = confirm(`Delete unused university ${u.name} (${u.id})?\n\nAffected records: 0`);
      if (!ok) return;
      await deleteUniversity(u.id);
      if (editing?.id === u.id) setEditing(null);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'University deletion failed');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Universities"
        description="Manage universities and integrations."
        actions={<Button size="sm" onClick={() => setEditing({ ...BLANK_UNIVERSITY })}>Add university</Button>}
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Panel padded={false}>
        <ListToolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search by id or name"
          searchLabel="Search universities"
          shown={filtered.length}
          busy={busy}
          topSearchActive={Boolean(searchQuery.trim())}
        >
          <PillGroup>
            <Pill active={!duplicatesOnly} onClick={() => setDuplicatesOnly(false)}>All</Pill>
            <Pill
              active={duplicatesOnly}
              count={duplicateIds.size}
              alert
              onClick={() => setDuplicatesOnly(true)}
              title="Universities with the same name in the same country"
            >
              Redundant only
            </Pill>
          </PillGroup>
        </ListToolbar>

        {busy && items.length === 0 ? (
          <div className="p-5"><SkeletonRows rows={4} height="h-14" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title={items.length > 0 && (query.trim() || searchQuery.trim()) ? 'No universities match your filters' : 'No universities found'}>
              {items.length > 0 && (query.trim() || searchQuery.trim()) ? 'Adjust the list search or clear the top search.' : null}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => (
              <RecordRow
                key={u.id}
                onOpen={() => setEditing(u)}
                title={u.name}
                meta={u.id}
                chips={
                  <>
                    {duplicateIds.has(u.id) ? <Chip tone="warning">Redundant</Chip> : null}
                    {u.country && u.country !== 'MY' ? <Chip>{u.country}</Chip> : null}
                    <Chip tone="info">{u.request_method} · {u.login_method}</Chip>
                  </>
                }
                actions={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => void handleDelete(u)}>Delete</Button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Panel>

      {editing ? (
        <UniEditor
          key={editing.id || 'new'}
          initial={form}
          onCancel={closeEditor}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

const DEFAULT_TEST_PARAMS = '{\n  "studentId": "",\n  "password": ""\n}';
const DEFAULT_MAPPING = '{\n  "subject_name": "subject_name",\n  "lecturer": "lecturer",\n  "class_time": "start_time",\n  "location": "location"\n}';

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
  const [country, setCountry] = useState(initial.country ?? 'MY');
  const [api, setApi] = useState(initial.api_endpoint ?? '');
  const [loginMethod, setLoginMethod] = useState<UniversityRow['login_method']>(initial.login_method);
  const [reqMethod, setReqMethod] = useState<UniversityRow['request_method']>(initial.request_method);
  const [paramsJson, setParamsJson] = useState(() => JSON.stringify(initial.required_params ?? [], null, 2));
  const [testParamsJson, setTestParamsJson] = useState(DEFAULT_TEST_PARAMS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [testRes, setTestRes] = useState<unknown>(null);
  const [mappingJson, setMappingJson] = useState(DEFAULT_MAPPING);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id.trim()) return;
      try {
        const existing = await getMapping(id.trim());
        if (cancelled) return;
        if (existing?.timetable_mapping) setMappingJson(JSON.stringify(existing.timetable_mapping, null, 2));
      } catch {
        // No saved mapping yet (or not reachable): keep the default text.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const required_params = JSON.parse(paramsJson || '[]');
      await upsertUniversity({
        id: id.trim(),
        name: name.trim(),
        country: country.trim().toUpperCase() || 'MY',
        api_endpoint: api.trim() || null,
        login_method: loginMethod,
        request_method: reqMethod,
        required_params,
        response_sample: initial.response_sample ?? null,
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel
      title={initial.id ? 'Edit university' : 'Add university'}
      subtitle={initial.id ? `${initial.name} · ${initial.id}` : 'Configure endpoint, request method, params, and mappings.'}
      onClose={onCancel}
      footer={
        <>
          {err ? <Notice tone="danger" className="w-full py-2">{err}</Notice> : null}
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <PanelSection title="Details">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="University ID">
            <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. uitm" />
          </Field>
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="UiTM" />
          </Field>
        </div>
        <Field label="API endpoint">
          <TextInput value={api} onChange={(e) => setApi(e.target.value)} placeholder="https://example.com/api" />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Country">
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="MY">Malaysia</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="CA">Canada</option>
              <option value="AU">Australia</option>
            </Select>
          </Field>
          <Field label="Login method">
            <Select value={loginMethod} onChange={(e) => setLoginMethod(e.target.value as UniversityRow['login_method'])}>
              <option value="manual">manual</option>
              <option value="api">api</option>
            </Select>
          </Field>
          <Field label="Request method">
            <Select value={reqMethod} onChange={(e) => setReqMethod(e.target.value as UniversityRow['request_method'])}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </Select>
          </Field>
        </div>
        <Field label="Required params schema (JSON)">
          <Textarea value={paramsJson} onChange={(e) => setParamsJson(e.target.value)} rows={5} className="font-mono" />
        </Field>
      </PanelSection>

      <PanelSection title="Test fetch" description="Runs a test call to the university endpoint through the server-side proxy.">
        <Field label="Test params (JSON)">
          <Textarea value={testParamsJson} onChange={(e) => setTestParamsJson(e.target.value)} rows={5} className="font-mono" />
        </Field>
        <div>
          <Button
            variant="secondary"
            disabled={busy}
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
            Test fetch
          </Button>
        </div>
        {testRes ? (
          <pre className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            {JSON.stringify(testRes, null, 2)}
          </pre>
        ) : null}
      </PanelSection>

      <PanelSection title="Data mapping" description="Map university response fields to Rencana timetable fields. Stored per university.">
        <Field label="Timetable mapping (JSON)">
          <Textarea value={mappingJson} onChange={(e) => setMappingJson(e.target.value)} rows={7} className="font-mono" />
        </Field>
        <div>
          <Button
            variant="secondary"
            disabled={busy}
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
          </Button>
        </div>
      </PanelSection>
    </SidePanel>
  );
}
