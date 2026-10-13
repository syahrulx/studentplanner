import { useCallback, useEffect, useMemo, useState } from 'react';
import { listOrganizations, createOrganization, updateOrganization, deleteOrganization, type AdminOrganizationRow, listUniversities, type UniversityRow, listCampuses, type AdminCampusRow } from '../lib/api';
import { Button } from '../ui/Button';
import { Select, TextInput } from '../ui/Input';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { Chip, EmptyState, Notice, PageHeader, Panel, SidePanel, SkeletonRows } from '../ui/page';
import { Field, ListToolbar, RecordRow } from '../components/institutions/InstitutionUi';

const BLANK_ORGANIZATION: AdminOrganizationRow = {
  id: '',
  university_id: '',
  campus_id: null,
  name: '',
  created_at: '',
};

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
    const base: AdminOrganizationRow = editing ?? { ...BLANK_ORGANIZATION };
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

  const closeEditor = useCallback(() => setEditing(null), []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Organisations"
        description="Manage university clubs and organisations for the community."
        actions={<Button size="sm" onClick={() => setEditing({ ...BLANK_ORGANIZATION })}>Add organisation</Button>}
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Panel padded={false}>
        <ListToolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search by name or university"
          searchLabel="Search organisations"
          shown={filtered.length}
          busy={busy}
          topSearchActive={Boolean(searchQuery.trim())}
        />

        {busy && items.length === 0 ? (
          <div className="p-5"><SkeletonRows rows={4} height="h-14" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title={items.length > 0 && (query.trim() || searchQuery.trim()) ? 'No organisations match your filters' : 'No organisations found'} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => {
              const camp = campuses.find(c => c.id === u.campus_id);
              return (
                <RecordRow
                  key={u.id}
                  onOpen={() => setEditing(u)}
                  title={u.name}
                  chips={
                    <>
                      <Chip tone="brand">{u.university_id.toUpperCase()}</Chip>
                      <Chip>{camp ? camp.name : 'All campuses'}</Chip>
                    </>
                  }
                  actions={
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>Edit</Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={async () => {
                          const ok = confirm(`Delete ${u.name}?`);
                          if (!ok) return;
                          setErr('');
                          try {
                            await deleteOrganization(u.id);
                          } catch (e) {
                            setErr(`Could not delete ${u.name}: ${e instanceof Error ? e.message : 'unknown error'}. Nothing was removed.`);
                            return;
                          }
                          if (editing?.id === u.id) setEditing(null);
                          await refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </Panel>

      {editing ? (
        <OrganizationEditor
          key={editing.id || 'new'}
          initial={form}
          universities={universities}
          campuses={campuses}
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
    <SidePanel
      title={initial.id ? 'Edit organisation' : 'Add organisation'}
      subtitle={initial.id ? `${initial.name} · ${initial.university_id.toUpperCase()}` : 'Configure organisation details.'}
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <>
          {err ? <Notice tone="danger" className="w-full py-2">{err}</Notice> : null}
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={busy || !name.trim() || !universityId.trim()}
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
          </Button>
        </>
      }
    >
      <Field label="Organisation name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Computer Science Club" />
      </Field>
      <Field label="University">
        <Select value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
          <option value="" disabled>Select university</option>
          {universities.map(u => (
            <option key={u.id} value={u.id}>{u.id.toUpperCase()} - {u.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Campus (optional)">
        <Select value={campusId} onChange={(e) => setCampusId(e.target.value)}>
          <option value="">All campuses</option>
          {availableCampuses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
    </SidePanel>
  );
}
