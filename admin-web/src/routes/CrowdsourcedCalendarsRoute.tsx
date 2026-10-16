import { useEffect, useState, useMemo } from 'react';
import { deleteUitmContributions } from '../lib/adminAlerts';
import {
  deleteExpiredCrowdsourcedCalendarOffers,
  listCrowdsourcedCalendarOffers,
  listUitmCalendarContributions,
  reviewUitmCalendarContribution,
  deleteUniversityCalendarOffer,
  type CrowdsourcedCalendarRow,
  type UitmCalendarContributionRow,
} from '../lib/api';
import { Button } from '../ui/Button';
import { Select, TextInput } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';
import { useAdminSearch } from '../state/AdminSearchContext';
import { AcademicCalendarOfferGraphic } from '../components/AcademicCalendarOfferGraphic';
import { useSafeActionDialog } from '../components/SafeActionDialog';
import { crowdsourcedDuplicates, uitmSuggestions } from '../lib/calendarReview';
import { compareWithHea, describeHeaCheck, loadHeaPage, type HeaCheck, type HeaPage } from '../lib/uitmHea';
import { CleanupBox, Field } from '../components/calendars/calendarUi';
import { BTN_APPROVE, BTN_DANGER, BTN_DANGER_SOFT, BTN_SECONDARY, CHECKBOX, LINK_SM } from '../components/calendars/calendarStyles';

export function CrowdsourcedCalendarsRoute() {
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [offers, setOffers] = useState<CrowdsourcedCalendarRow[]>([]);
  const [uitmContributions, setUitmContributions] = useState<UitmCalendarContributionRow[]>([]);
  const [offersSearch, setOffersSearch] = useState('');
  const [calendarAge, setCalendarAge] = useState<'all' | 'expired' | 'redundant'>('all');
  const [selectedExpiredIds, setSelectedExpiredIds] = useState<string[]>([]);
  const [deletingOfferId, setDeletingOfferId] = useState<string>('');
  const [deletingExpired, setDeletingExpired] = useState(false);
  const [reviewingUitmId, setReviewingUitmId] = useState('');
  const [selectedUitmIds, setSelectedUitmIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'semester' | 'university' | 'reports'>('newest');
  const [groupBy, setGroupBy] = useState<'none' | 'university' | 'duplicates'>('none');
  const [uitmStatus, setUitmStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  // Compare-only hint against UiTM's official HEA calendar. Never approves or rejects.
  const [heaPage, setHeaPage] = useState<HeaPage | null>(null);
  const [heaErr, setHeaErr] = useState('');
  const [heaLoading, setHeaLoading] = useState(false);

  const refreshHistory = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listCrowdsourcedCalendarOffers();
      setOffers(items);
      // Keep the existing crowdsourced moderation page usable during a staged
      // rollout if the new UiTM migration has not reached the backend yet.
      try {
        setUitmContributions(await listUitmCalendarContributions());
      } catch {
        setUitmContributions([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const isExpired = (offer: CrowdsourcedCalendarRow) =>
    /^\d{4}-\d{2}-\d{2}$/.test(offer.end_date) && offer.end_date < today;

  const expiredOffers = useMemo(() => offers.filter(isExpired), [offers, today]);
  const expiredIdSet = useMemo(() => new Set(expiredOffers.map((offer) => offer.id)), [expiredOffers]);
  // Copies students would see as one calendar, with one copy picked to keep.
  const duplicates = useMemo(() => crowdsourcedDuplicates(offers), [offers]);
  const redundantIds = useMemo(() => new Set(duplicates.keys()), [duplicates]);
  const suggestedDeleteIds = useMemo(
    () => [...duplicates.entries()].filter(([, info]) => !info.keep).map(([id]) => id),
    [duplicates],
  );
  const loadHea = async (refresh = false) => {
    setHeaLoading(true);
    setHeaErr('');
    try {
      setHeaPage(await loadHeaPage(refresh));
    } catch (e) {
      setHeaErr(e instanceof Error ? e.message : 'Could not load HEA');
    } finally {
      setHeaLoading(false);
    }
  };

  useEffect(() => {
    if (uitmContributions.length > 0 && !heaPage && !heaLoading && !heaErr) void loadHea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uitmContributions.length]);

  const heaChecks = useMemo(() => {
    const checks = new Map<string, HeaCheck>();
    if (heaPage) for (const row of uitmContributions) checks.set(row.id, compareWithHea(row, heaPage));
    return checks;
  }, [heaPage, uitmContributions]);

  const uitmVerdicts = useMemo(() => uitmSuggestions(uitmContributions, today), [uitmContributions, today]);
  const visibleUitm = useMemo(
    () =>
      uitmContributions
        .filter((row) => uitmStatus === 'all' || row.status === uitmStatus)
        .sort((a, b) =>
          (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) ||
          b.created_at.localeCompare(a.created_at),
        ),
    [uitmContributions, uitmStatus],
  );

  useEffect(() => {
    setSelectedExpiredIds((ids) => ids.filter((id) => expiredIdSet.has(id)));
  }, [expiredIdSet]);

  const filteredOffers = useMemo(() => {
    const qTop = searchQuery.trim().toLowerCase();
    const qLocal = offersSearch.trim().toLowerCase();
    
    return offers.filter((h) => {
      if (calendarAge === 'expired' && !isExpired(h)) return false;
      if (calendarAge === 'redundant' && !redundantIds.has(h.id)) return false;
      const texts = [
        h.university_id,
        h.semester_label,
        h.admin_note,
        h.official_url,
        h.user_profile?.full_name,
        h.user_profile?.email,
      ].map(t => String(t || '').toLowerCase());

      if (qTop) {
        if (!texts.some(t => t.includes(qTop))) return false;
      }
      if (qLocal) {
        if (!texts.some(t => t.includes(qLocal))) return false;
      }
      return true;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'oldest': return a.created_at.localeCompare(b.created_at);
        case 'semester': return b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at);
        case 'university': return a.university_id.localeCompare(b.university_id) || b.start_date.localeCompare(a.start_date);
        case 'reports': return (b.report_count ?? 0) - (a.report_count ?? 0) || b.created_at.localeCompare(a.created_at);
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
  }, [calendarAge, offers, offersSearch, searchQuery, today, redundantIds, sortBy]);

  // Sections for the list. "Duplicates" puts every same-calendar group together
  // (kept copy first) and leaves single calendars in a last section.
  const offerSections = useMemo(() => {
    if (groupBy === 'university') {
      const byUni = new Map<string, CrowdsourcedCalendarRow[]>();
      filteredOffers.forEach((o) => byUni.set(o.university_id, [...(byUni.get(o.university_id) ?? []), o]));
      return [...byUni.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([uni, items]) => ({ key: uni, title: uni, subtitle: `${items.length} calendar(s)`, items }));
    }
    if (groupBy === 'duplicates') {
      const byGroup = new Map<string, CrowdsourcedCalendarRow[]>();
      const singles: CrowdsourcedCalendarRow[] = [];
      filteredOffers.forEach((o) => {
        const info = duplicates.get(o.id);
        if (!info) singles.push(o);
        else byGroup.set(info.groupKey, [...(byGroup.get(info.groupKey) ?? []), o]);
      });
      const groups = [...byGroup.values()].map((items) => {
        const sorted = [...items].sort((a, b) => Number(duplicates.get(b.id)?.keep) - Number(duplicates.get(a.id)?.keep));
        const first = sorted[0];
        return {
          key: duplicates.get(first.id)!.groupKey,
          title: `${first.university_id} · ${first.start_date} to ${first.end_date}`,
          subtitle: `${items.length} copies of the same calendar · keep 1, delete ${items.length - 1}`,
          items: sorted,
        };
      });
      return singles.length
        ? [...groups, { key: 'singles', title: 'No duplicates', subtitle: `${singles.length} calendar(s)`, items: singles }]
        : groups;
    }
    return [{ key: 'all', title: '', subtitle: '', items: filteredOffers }];
  }, [filteredOffers, groupBy, duplicates]);

  const deleteSuggestedDuplicates = () => {
    const ids = suggestedDeleteIds;
    if (!ids.length) return;
    requestSafeAction({
      title: 'Delete suggested duplicates',
      operation: 'Delete calendars',
      affectedCount: ids.length,
      confirmationText: `DELETE ${ids.length}`,
      requireReason: true,
      irreversible: true,
      warning: 'Deletes only the extra copies. One copy of each calendar (the one marked Keep) stays, so students still see it.',
      onConfirm: async () => {
        setErr(''); setOkMsg(''); setDeletingDuplicates(true);
        let deleted = 0;
        try {
          for (const id of ids) {
            try { await deleteUniversityCalendarOffer(id); deleted += 1; } catch { /* counted as failed below */ }
          }
          await refreshHistory();
          setOkMsg(`${deleted} duplicate calendar${deleted === 1 ? '' : 's'} deleted.`);
          return { affected: deleted, failed: ids.length - deleted };
        } finally { setDeletingDuplicates(false); }
      },
    });
  };

  const allExpiredSelected = expiredOffers.length > 0 && expiredOffers.every((offer) => selectedExpiredIds.includes(offer.id));

  const toggleExpiredOffer = (id: string) => {
    setSelectedExpiredIds((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  };

  const toggleAllExpired = () => {
    setSelectedExpiredIds(allExpiredSelected ? [] : expiredOffers.map((offer) => offer.id));
  };

  const deleteSelectedExpired = () => {
    if (!selectedExpiredIds.length) return;
    const count = selectedExpiredIds.length;
    requestSafeAction({ title: 'Delete expired crowdsourced calendars', operation: 'Delete calendars', affectedCount: count, confirmationText: `DELETE ${count}`, requireReason: true, irreversible: true, warning: 'The server deletes only crowdsourced calendars whose end date is before today. Active calendars are protected.', onConfirm: async (reason) => {
      setErr(''); setOkMsg(''); setDeletingExpired(true);
      try {
        const deletedCount = await deleteExpiredCrowdsourcedCalendarOffers(selectedExpiredIds, reason);
        setSelectedExpiredIds([]); await refreshHistory();
        setOkMsg(`${deletedCount} expired crowdsourced calendar${deletedCount === 1 ? '' : 's'} deleted.`);
        return { affected: deletedCount, failed: Math.max(0, count - deletedCount) };
      } finally { setDeletingExpired(false); }
    } });
  };

  const toggleUitm = (id: string) =>
    setSelectedUitmIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const deleteSelectedUitm = () => {
    const ids = selectedUitmIds.filter((id) => uitmContributions.some((r) => r.id === id));
    if (!ids.length) return;
    const chosen = uitmContributions.filter((r) => ids.includes(r.id));
    const approved = chosen.filter((r) => r.status === 'approved').length;
    requestSafeAction({
      title: `Delete ${ids.length} UiTM submission${ids.length === 1 ? '' : 's'}`,
      operation: 'Delete submissions',
      affectedCount: ids.length,
      confirmationText: `DELETE ${ids.length}`,
      requireReason: true,
      irreversible: true,
      subject: `${chosen.filter((r) => r.status === 'pending').length} pending · ${approved} approved · ${chosen.filter((r) => r.status === 'rejected').length} rejected`,
      warning: approved
        ? `${approved} of these are APPROVED: UiTM students can see them now, and they will disappear for everyone. Pending and rejected ones are only removed from this list. This cannot be undone.`
        : 'Removes these submissions for good. No student calendar changes: pending and rejected submissions are not shown to students.',
      onConfirm: async (reason) => {
        const n = await deleteUitmContributions(ids, reason);
        setSelectedUitmIds([]);
        await refreshHistory();
        setOkMsg(`${n} UiTM submission${n === 1 ? '' : 's'} deleted.`);
        return { affected: n, failed: Math.max(0, ids.length - n) };
      },
    });
  };

  // Pending and the same as HEA: students already get these dates from HEA
  // automatically, so approving would only add a duplicate choice.
  const sameAsHea = (row: UitmCalendarContributionRow) => row.status === 'pending' && heaChecks.get(row.id)?.kind === 'match';

  const rejectSelectedUitm = () => {
    const chosen = uitmContributions.filter((r) => selectedUitmIds.includes(r.id) && r.status === 'pending');
    if (!chosen.length) return;
    requestSafeAction({
      title: `Reject ${chosen.length} pending UiTM submission${chosen.length === 1 ? '' : 's'}`,
      operation: 'Reject submissions',
      affectedCount: chosen.length,
      subject: `${chosen.filter(sameAsHea).length} of them are the same as HEA`,
      warning: 'Only marks them as rejected. The students who sent them are not told, and no student calendar changes. Approved and already rejected ones you ticked are left alone.',
      onConfirm: async () => {
        let done = 0;
        for (const row of chosen) {
          try {
            await reviewUitmCalendarContribution(row.id, 'rejected');
            done += 1;
          } catch {
            // Counted as failed below; the rest still go through.
          }
        }
        setSelectedUitmIds([]);
        await refreshHistory();
        setOkMsg(`${done} UiTM submission${done === 1 ? '' : 's'} rejected.`);
        return { affected: done, failed: chosen.length - done };
      },
    });
  };

  const reviewUitmContribution = async (row: UitmCalendarContributionRow, status: 'approved' | 'rejected') => {
    const action = status === 'approved' ? 'Approve' : 'Reject';
    const ok = window.confirm(
      `${action} this UiTM community calendar?\n\n${row.semester_label}\n${row.start_date} to ${row.end_date}\nGroup ${row.group_code} · ${row.calendar_variant}\n\nApproval only makes it available as an opt-in calendar. It will not update any student automatically.`,
    );
    if (!ok) return;
    setErr('');
    setOkMsg('');
    setReviewingUitmId(row.id);
    try {
      await reviewUitmCalendarContribution(row.id, status);
      await refreshHistory();
      setOkMsg(`UiTM contribution ${status}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not ${status} UiTM contribution`);
    } finally {
      setReviewingUitmId('');
    }
  };

  // ── Button handlers (moved out of the JSX unchanged, so the layout can be read) ──

  const resetAndRefresh = () => {
    setOffersSearch('');
    setCalendarAge('all');
    setSelectedExpiredIds([]);
    void refreshHistory();
  };

  const deleteOneOffer = async (h: CrowdsourcedCalendarRow) => {
    const ok = window.confirm(
      `Delete this crowdsourced offer from ${h.user_profile?.full_name || 'this user'}?\n\n${h.university_id}\n${h.semester_label}\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setErr('');
    setOkMsg('');
    setDeletingOfferId(h.id);
    try {
      await deleteUniversityCalendarOffer(h.id);
      await refreshHistory();
      setOkMsg('Crowdsourced offer deleted.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingOfferId('');
    }
  };

  // ── Display-only helpers ──

  const uitmCount = (st: 'pending' | 'approved' | 'rejected' | 'all') =>
    st === 'all' ? uitmContributions.length : uitmContributions.filter((r) => r.status === st).length;
  const suggestedRejectRows = visibleUitm.filter((r) => uitmVerdicts.get(r.id)?.verdict === 'reject');
  const sameAsHeaRows = visibleUitm.filter(sameAsHea);
  const selectedPendingCount = uitmContributions.filter((r) => selectedUitmIds.includes(r.id) && r.status === 'pending').length;
  const loading = busy && offers.length === 0 && uitmContributions.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Community submissions"
        description="Academic calendars published by users directly from the mobile app."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={resetAndRefresh}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}
      {okMsg ? <Notice tone="success">{okMsg}</Notice> : null}

      {/* ── UiTM community submissions ── */}
      <Panel
        title="UiTM submissions"
        description="Pending submissions never change a student’s calendar. Approved ones are shown as an opt-in alternative to HEA. Each pending one shows a suggestion: it is only advice, you still press Approve or Reject."
        padded={false}
      >
        <div className="space-y-3 px-5 py-4">
          <PillGroup label="Status">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
              <Pill key={st} active={uitmStatus === st} count={uitmCount(st)} alert={st === 'pending'} onClick={() => setUitmStatus(st)}>
                {st === 'all' ? 'All' : st.charAt(0).toUpperCase() + st.slice(1)}
              </Pill>
            ))}
          </PillGroup>
          {uitmContributions.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>
                {heaLoading
                  ? 'Checking against UiTM HEA calendar…'
                  : heaErr
                    ? `Couldn't load the HEA calendar (${heaErr}). Suggestions below still work.`
                    : heaPage
                      ? `Compared with UiTM HEA calendar, read ${new Date(heaPage.fetchedAt).toLocaleString()}${heaPage.stale ? ' (old copy, HEA did not answer)' : ''}. Only a hint.`
                      : ''}
              </span>
              <button type="button" disabled={heaLoading} onClick={() => void loadHea(true)} className={LINK_SM}>
                Check HEA again
              </button>
            </div>
          ) : null}
          {visibleUitm.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-950/40">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={visibleUitm.every((r) => selectedUitmIds.includes(r.id))}
                  onChange={(e) => setSelectedUitmIds(e.target.checked ? visibleUitm.map((r) => r.id) : [])}
                />
                Select all shown ({visibleUitm.length})
              </label>
              {visibleUitm.some((r) => uitmVerdicts.get(r.id)?.verdict === 'reject') ? (
                <button
                  type="button"
                  onClick={() => setSelectedUitmIds(visibleUitm.filter((r) => uitmVerdicts.get(r.id)?.verdict === 'reject').map((r) => r.id))}
                  className={BTN_SECONDARY}
                >
                  Tick suggested “Reject” ({suggestedRejectRows.length})
                </button>
              ) : null}
              {sameAsHeaRows.length ? (
                <button type="button" onClick={() => setSelectedUitmIds(sameAsHeaRows.map((r) => r.id))} className={BTN_SECONDARY}>
                  Tick “Same as HEA” ({sameAsHeaRows.length})
                </button>
              ) : null}
              <button type="button" disabled={selectedPendingCount === 0} onClick={rejectSelectedUitm} className={`ml-auto ${BTN_DANGER_SOFT}`}>
                Reject selected ({selectedPendingCount})
              </button>
              <button type="button" disabled={selectedUitmIds.length === 0} onClick={deleteSelectedUitm} className={BTN_DANGER}>
                Delete selected ({selectedUitmIds.length})
              </button>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="px-5 pb-5"><SkeletonRows rows={2} height="h-24" /></div>
        ) : visibleUitm.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title={uitmContributions.length === 0 ? 'No UiTM community submissions yet.' : `No ${uitmStatus} submissions.`} />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {visibleUitm.map((row) => {
              const v = uitmVerdicts.get(row.id);
              const hea = heaChecks.get(row.id);
              return (
                <li key={row.id} className="flex gap-3 px-5 py-4">
                  <input
                    type="checkbox"
                    className={`${CHECKBOX} mt-1`}
                    aria-label={`Select ${row.semester_label}`}
                    checked={selectedUitmIds.includes(row.id)}
                    onChange={() => toggleUitm(row.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 dark:text-slate-100">{row.semester_label}</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {row.start_date} to {row.end_date} · {row.total_weeks} weeks · Group {row.group_code} · {row.calendar_variant === 'kkt' ? 'Kedah/Kelantan/Terengganu' : 'Standard'}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Submitted by {row.user_profile?.full_name || row.user_profile?.email || 'Unknown user'} · {new Date(row.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Chip tone={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'neutral' : 'warning'}>
                        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                      </Chip>
                    </div>
                    {sameAsHea(row) ? (
                      <div className="flex flex-wrap items-baseline gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Chip tone="neutral">Not needed</Chip>
                        <span className="min-w-0">Same as HEA, and students already get the HEA calendar automatically. Approving only adds a duplicate choice. Reject to clear it.</span>
                      </div>
                    ) : v ? (
                      <div className="flex flex-wrap items-baseline gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Chip tone={v.verdict === 'approve' ? 'success' : v.verdict === 'reject' ? 'danger' : 'warning'}>
                          {v.verdict === 'approve' ? 'Suggested: Approve' : v.verdict === 'reject' ? 'Suggested: Reject' : 'Check first'}
                        </Chip>
                        <span className="min-w-0">{v.reason}</span>
                      </div>
                    ) : null}
                    {hea ? (
                      <div className="flex flex-wrap items-baseline gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Chip tone={hea.kind === 'match' ? 'success' : hea.kind === 'differs' ? 'warning' : 'neutral'}>
                          {hea.kind === 'match' ? 'Matches HEA' : hea.kind === 'differs' ? 'Differs from HEA' : hea.kind === 'not_on_hea' ? 'Not on HEA yet' : "Couldn't check HEA"}
                        </Chip>
                        <span className="min-w-0">{describeHeaCheck(hea)}</span>
                      </div>
                    ) : null}
                    {row.source_url || row.status === 'pending' ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {row.status === 'pending' ? (
                          <>
                            <button type="button" disabled={Boolean(reviewingUitmId)} onClick={() => void reviewUitmContribution(row, 'approved')} className={BTN_APPROVE}>
                              {reviewingUitmId === row.id ? 'Saving…' : 'Approve'}
                            </button>
                            <button type="button" disabled={Boolean(reviewingUitmId)} onClick={() => void reviewUitmContribution(row, 'rejected')} className={BTN_DANGER_SOFT}>
                              Reject
                            </button>
                          </>
                        ) : null}
                        {row.source_url ? (
                          <a href={row.source_url} target="_blank" rel="noreferrer" className={`${LINK_SM} ml-1`}>
                            Open source
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ── Crowdsourced calendars (other universities) ── */}
      <Panel
        title="Crowdsourced calendars"
        description="Calendars students published for their university from the app."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label="Search">
              <TextInput
                value={offersSearch}
                onChange={(e) => setOffersSearch(e.target.value)}
                placeholder="Search university, semester, user email, name…"
              />
            </Field>
            <Field label="Sort by">
              <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="newest">Newest submitted</option>
                <option value="oldest">Oldest submitted</option>
                <option value="semester">Semester start (latest first)</option>
                <option value="university">University A–Z</option>
                <option value="reports">Most reported</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <PillGroup label="Show">
              <Pill active={calendarAge === 'all'} onClick={() => setCalendarAge('all')}>All calendars</Pill>
              <Pill active={calendarAge === 'expired'} onClick={() => setCalendarAge('expired')} title="End date is before today">
                Old academic calendars
              </Pill>
              <Pill active={calendarAge === 'redundant'} count={redundantIds.size} onClick={() => setCalendarAge('redundant')}>
                Redundant calendars
              </Pill>
            </PillGroup>
            <PillGroup label="Group">
              <Pill active={groupBy === 'none'} onClick={() => setGroupBy('none')}>No grouping</Pill>
              <Pill active={groupBy === 'university'} onClick={() => setGroupBy('university')}>University</Pill>
              <Pill active={groupBy === 'duplicates'} onClick={() => setGroupBy('duplicates')}>Duplicates together</Pill>
            </PillGroup>
          </div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Showing <span className="font-black text-slate-700 dark:text-slate-200">{filteredOffers.length}</span> crowdsourced offer(s)
            {searchQuery.trim() ? ' (also filtered by top search bar)' : ''}.
          </div>

          {expiredOffers.length || suggestedDeleteIds.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {expiredOffers.length ? (
                <CleanupBox
                  tone="warning"
                  title={
                    <label className="inline-flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        checked={allExpiredSelected}
                        onChange={toggleAllExpired}
                        disabled={deletingExpired}
                      />
                      <span>Select all old calendars ({expiredOffers.length})</span>
                    </label>
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => void deleteSelectedExpired()}
                      disabled={selectedExpiredIds.length === 0 || deletingExpired}
                      className={BTN_DANGER}
                    >
                      {deletingExpired ? 'Deleting…' : `Delete selected (${selectedExpiredIds.length})`}
                    </button>
                  }
                >
                  Or tick single old calendars in the list below.
                </CleanupBox>
              ) : null}
              {suggestedDeleteIds.length ? (
                <CleanupBox
                  tone="danger"
                  title={`${duplicates.size - suggestedDeleteIds.length} calendar(s) have extra copies. ${suggestedDeleteIds.length} copy(ies) can go; one of each is kept.`}
                  action={
                    <button
                      type="button"
                      onClick={deleteSuggestedDuplicates}
                      disabled={deletingDuplicates || Boolean(deletingOfferId) || deletingExpired}
                      className={BTN_DANGER}
                    >
                      {deletingDuplicates ? 'Deleting…' : `Delete suggested duplicates (${suggestedDeleteIds.length})`}
                    </button>
                  }
                >
                  <button type="button" onClick={() => { setGroupBy('duplicates'); setCalendarAge('redundant'); }} className="font-black underline underline-offset-2">
                    Show them
                  </button>
                </CleanupBox>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="space-y-6">
        {offerSections.map((section) => (
          <div key={section.key} className="space-y-3">
            {section.title ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">{section.title}</div>
                <div className="text-xs font-black text-slate-500 dark:text-slate-400">{section.subtitle}</div>
              </div>
            ) : null}
            {section.items.map((h) => {
              const dup = duplicates.get(h.id);
              const reported = (h.report_count ?? 0) > 0;
              return (
                <article
                  key={h.id}
                  className={`space-y-4 rounded-3xl border bg-white p-5 shadow-soft dark:bg-slate-900 ${reported ? 'border-rose-300 dark:border-rose-900/70' : 'border-slate-200 dark:border-slate-800'}`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 items-start gap-3">
                      {isExpired(h) ? (
                        <input
                          type="checkbox"
                          className={`${CHECKBOX} mt-1`}
                          checked={selectedExpiredIds.includes(h.id)}
                          onChange={() => toggleExpiredOffer(h.id)}
                          disabled={deletingExpired}
                          aria-label={`Select expired calendar ${h.semester_label}`}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {h.user_profile?.full_name || 'Unknown User'}
                        </div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {h.user_profile?.email || 'No email provided'}
                          {h.user_profile?.phone_number ? ` • ${h.user_profile.phone_number}` : ''}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          Submitted {new Date(h.created_at).toLocaleString()}
                        </div>
                        {isExpired(h) || dup || reported ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {reported ? <Chip tone="danger">{h.report_count} report{h.report_count === 1 ? '' : 's'}</Chip> : null}
                            {isExpired(h) ? <Chip tone="warning">Old calendar · ended {h.end_date}</Chip> : null}
                            {dup ? (
                              dup.keep ? (
                                <Chip tone="success">Keep · best of {dup.size} copies</Chip>
                              ) : (
                                <Chip tone="danger">Suggested delete · duplicate copy</Chip>
                              )
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${BTN_DANGER_SOFT} self-start`}
                      disabled={Boolean(deletingOfferId) || deletingExpired}
                      onClick={() => deleteOneOffer(h)}
                    >
                      {deletingOfferId === h.id ? 'Deleting…' : 'Delete offer'}
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                    <AcademicCalendarOfferGraphic offer={h} universityName={h.university_id} />
                  </div>

                  {h.admin_note ? (
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      <span className="font-black text-slate-900 dark:text-slate-100">Note: </span>
                      {h.admin_note}
                    </p>
                  ) : null}

                  {h.official_url || h.reference_pdf_url ? (
                    <div className="flex flex-wrap gap-4">
                      {h.official_url ? (
                        <a href={h.official_url} target="_blank" rel="noreferrer" className={LINK_SM}>
                          Original URL
                        </a>
                      ) : null}
                      {h.reference_pdf_url ? (
                        <a href={h.reference_pdf_url} target="_blank" rel="noreferrer" className={LINK_SM}>
                          Reference PDF
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ))}
        {filteredOffers.length === 0 ? (
          loading ? (
            <SkeletonRows rows={3} height="h-40" />
          ) : (
            <EmptyState title={offers.length === 0 ? 'No crowdsourced offers yet' : 'No calendars match these filters'}>
              When users publish their academic calendars from the mobile app, they will appear here for you to review.
            </EmptyState>
          )
        ) : null}
      </div>
      {safeActionDialog}
    </div>
  );
}
