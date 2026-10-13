import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCampuses, createCampus, updateCampus, deleteCampus, getCampusDeleteImpact, type AdminCampusRow, listUniversities, type UniversityRow } from '../lib/api';
import { Button } from '../ui/Button';
import { Select, TextInput } from '../ui/Input';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { duplicateRecordIds, normaliseRecordName } from '../lib/dataQuality';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SidePanel, SkeletonRows } from '../ui/page';
import { Field, ListToolbar, RecordRow } from '../components/institutions/InstitutionUi';

const BLANK_CAMPUS: AdminCampusRow = {
  id: '',
  university_id: '',
  name: '',
  created_at: '',
};

export function CampusesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminCampusRow[]>([]);
  const [editing, setEditing] = useState<AdminCampusRow | null>(null);
  const [query, setQuery] = useState('');
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [expandedUnis, setExpandedUnis] = useState<Set<string>>(new Set());
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);

  const duplicateIds = useMemo(
    () => duplicateRecordIds(items, (c) => `${c.university_id}|${normaliseRecordName(c.name)}`),
    [items],
  );

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
    const base: AdminCampusRow = editing ?? { ...BLANK_CAMPUS };
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
    if (duplicatesOnly) list = list.filter((c) => duplicateIds.has(c.id));
    return list;
  }, [items, query, searchQuery, duplicatesOnly, duplicateIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminCampusRow[]>();
    for (const c of filtered) {
      if (!map.has(c.university_id)) map.set(c.university_id, []);
      map.get(c.university_id)!.push(c);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const closeEditor = useCallback(() => setEditing(null), []);
  const searching = Boolean(query.trim() || searchQuery.trim());

  const handleDelete = async (u: AdminCampusRow) => {
    setErr('');
    try {
      const impact = await getCampusDeleteImpact(u.id);
      if (impact.total > 0) {
        const detail = Object.entries(impact.counts)
          .filter(([, count]) => count > 0)
          .map(([name, count]) => `${name}: ${count}`)
          .join('\n');
        alert(`Cannot delete ${u.name}. Reassign these affected records first:\n\n${detail}`);
        return;
      }
      const ok = confirm(`Delete unused campus ${u.name}?\n\nAffected records: 0`);
      if (!ok) return;
      await deleteCampus(u.id);
      if (editing?.id === u.id) setEditing(null);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Campus deletion failed');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campuses"
        description="Manage university campuses for the community."
        actions={<Button size="sm" onClick={() => setEditing({ ...BLANK_CAMPUS })}>Add campus</Button>}
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Panel padded={false}>
        <ListToolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search by name or university"
          searchLabel="Search campuses"
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
              title="Campuses with the same name under the same university"
            >
              Redundant only
            </Pill>
          </PillGroup>
        </ListToolbar>

        {busy && items.length === 0 ? (
          <div className="p-5"><SkeletonRows rows={4} height="h-14" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title={items.length > 0 && searching ? 'No campuses match your filters' : 'No campuses found'} />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {grouped.map(([uniId, groupCampuses]) => {
              // Open every group while searching so matches are visible.
              const isExpanded = expandedUnis.has(uniId) || searching;
              const uniName = universities.find((u) => u.id === uniId)?.name || '';
              return (
                <div key={uniId}>
                  <button
                    type="button"
                    onClick={() => toggleUni(uniId)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-3 text-left transition hover:bg-slate-100 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0 truncate text-sm font-black">
                      <span className="text-brand-700 dark:text-brand-300">{uniId.toUpperCase()}</span>
                      {uniName ? <span className="ml-2 font-semibold text-slate-500 dark:text-slate-400">{uniName}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Chip>{groupCampuses.length} campus{groupCampuses.length !== 1 ? 'es' : ''}</Chip>
                      <span
                        aria-hidden
                        className="inline-block text-xs text-slate-400 transition-transform duration-200"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        ▼
                      </span>
                    </span>
                  </button>
                  {isExpanded ? (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {groupCampuses.map((u) => (
                        <RecordRow
                          key={u.id}
                          className="pl-8"
                          onOpen={() => setEditing(u)}
                          title={u.name}
                          chips={duplicateIds.has(u.id) ? <Chip tone="warning">Redundant</Chip> : null}
                          actions={
                            <>
                              <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>Edit</Button>
                              <Button variant="danger" size="sm" onClick={() => void handleDelete(u)}>Delete</Button>
                            </>
                          }
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {editing ? (
        <CampusEditor
          key={editing.id || 'new'}
          initial={form}
          universities={universities}
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
    <SidePanel
      title={initial.id ? 'Edit campus' : 'Add campus'}
      subtitle={initial.id ? `${initial.name} · ${initial.university_id.toUpperCase()}` : 'Configure campus details.'}
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
          </Button>
        </>
      }
    >
      <Field label="Campus name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Puncak Alam" />
      </Field>
      <Field label="University">
        <Select value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
          <option value="" disabled>Select university</option>
          {universities.map(u => (
            <option key={u.id} value={u.id}>{u.id.toUpperCase()} - {u.name}</option>
          ))}
        </Select>
      </Field>
    </SidePanel>
  );
}
