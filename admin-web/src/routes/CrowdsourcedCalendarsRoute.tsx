import { useEffect, useState, useMemo } from 'react';
import {
  deleteExpiredCrowdsourcedCalendarOffers,
  listCrowdsourcedCalendarOffers,
  listUitmCalendarContributions,
  reviewUitmCalendarContribution,
  deleteUniversityCalendarOffer,
  type CrowdsourcedCalendarRow,
  type UitmCalendarContributionRow,
} from '../lib/api';
import { Card, CardContent } from '../ui/Card';
import { Label, Select, TextInput } from '../ui/Input';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { AcademicCalendarOfferGraphic } from '../components/AcademicCalendarOfferGraphic';

export function CrowdsourcedCalendarsRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [offers, setOffers] = useState<CrowdsourcedCalendarRow[]>([]);
  const [uitmContributions, setUitmContributions] = useState<UitmCalendarContributionRow[]>([]);
  const [offersSearch, setOffersSearch] = useState('');
  const [calendarAge, setCalendarAge] = useState<'all' | 'expired'>('all');
  const [selectedExpiredIds, setSelectedExpiredIds] = useState<string[]>([]);
  const [deletingOfferId, setDeletingOfferId] = useState<string>('');
  const [deletingExpired, setDeletingExpired] = useState(false);
  const [reviewingUitmId, setReviewingUitmId] = useState('');

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

  useEffect(() => {
    setSelectedExpiredIds((ids) => ids.filter((id) => expiredIdSet.has(id)));
  }, [expiredIdSet]);

  const filteredOffers = useMemo(() => {
    const qTop = searchQuery.trim().toLowerCase();
    const qLocal = offersSearch.trim().toLowerCase();
    
    return offers.filter((h) => {
      if (calendarAge === 'expired' && !isExpired(h)) return false;
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
    });
  }, [calendarAge, offers, offersSearch, searchQuery, today]);

  const allExpiredSelected = expiredOffers.length > 0 && expiredOffers.every((offer) => selectedExpiredIds.includes(offer.id));

  const toggleExpiredOffer = (id: string) => {
    setSelectedExpiredIds((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  };

  const toggleAllExpired = () => {
    setSelectedExpiredIds(allExpiredSelected ? [] : expiredOffers.map((offer) => offer.id));
  };

  const deleteSelectedExpired = async () => {
    if (!selectedExpiredIds.length) return;
    const count = selectedExpiredIds.length;
    const ok = window.confirm(
      `Delete ${count} expired crowdsourced academic calendar${count === 1 ? '' : 's'}?\n\nOnly calendars with an end date before today will be removed. This cannot be undone.`,
    );
    if (!ok) return;

    setErr('');
    setOkMsg('');
    setDeletingExpired(true);
    try {
      const deletedCount = await deleteExpiredCrowdsourcedCalendarOffers(selectedExpiredIds);
      setSelectedExpiredIds([]);
      await refreshHistory();
      setOkMsg(`${deletedCount} expired crowdsourced calendar${deletedCount === 1 ? '' : 's'} deleted.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete expired calendars');
    } finally {
      setDeletingExpired(false);
    }
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

  return (
    <div className="space-y-8">
      <MotionSection>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Crowdsourced Calendars
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Academic calendars published by users directly from the mobile app.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setOffersSearch('');
                setCalendarAge('all');
                setSelectedExpiredIds([]);
                void refreshHistory();
              }}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {busy ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </MotionSection>

      {err ? (
        <MotionPanel>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        </MotionPanel>
      ) : null}

      {okMsg ? (
        <MotionPanel>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
            {okMsg}
          </div>
        </MotionPanel>
      ) : null}

      <MotionSection delay={0.05}>
        <div className="rounded-3xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-base font-black text-slate-900 dark:text-slate-100">UiTM community submissions</div>
              <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Pending submissions never change a student’s calendar. Approved submissions are shown as an opt-in alternative to HEA.
              </div>
            </div>
            <span className="rounded-full bg-violet-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-900 dark:bg-violet-500/20 dark:text-violet-100">
              {uitmContributions.filter((row) => row.status === 'pending').length} pending
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {uitmContributions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-violet-200 px-4 py-5 text-sm font-semibold text-violet-900 dark:border-violet-900/60 dark:text-violet-100">No UiTM community submissions yet.</div>
            ) : uitmContributions.map((row) => (
              <div key={row.id} className="rounded-2xl border border-violet-100 bg-white p-4 dark:border-violet-900/40 dark:bg-slate-950/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-slate-100">{row.semester_label}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{row.start_date} to {row.end_date} · {row.total_weeks} weeks · Group {row.group_code} · {row.calendar_variant === 'kkt' ? 'Kedah/Kelantan/Terengganu' : 'Standard'}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Submitted by {row.user_profile?.full_name || row.user_profile?.email || 'Unknown user'} · {new Date(row.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${row.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : row.status === 'rejected' ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}>{row.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-black">
                  {row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2 dark:text-brand-300">Open source</a> : null}
                  {row.status === 'pending' ? (
                    <>
                      <button type="button" disabled={Boolean(reviewingUitmId)} onClick={() => void reviewUitmContribution(row, 'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700 disabled:opacity-40">{reviewingUitmId === row.id ? 'Saving…' : 'Approve'}</button>
                      <button type="button" disabled={Boolean(reviewingUitmId)} onClick={() => void reviewUitmContribution(row, 'rejected')} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">Reject</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </MotionSection>

      <MotionSection delay={0.1}>
        <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">
                Search
              </span>
              <TextInput
                value={offersSearch}
                onChange={(e) => setOffersSearch(e.target.value)}
                placeholder="Search university, semester, user email, name…"
                className="border-blue-200 focus:border-blue-500"
              />
            </Label>
            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">
                Calendar status
              </span>
              <Select value={calendarAge} onChange={(e) => setCalendarAge(e.target.value as 'all' | 'expired')} className="border-blue-200 focus:border-blue-500">
                <option value="all">All calendars</option>
                <option value="expired">Old academic calendars</option>
              </Select>
            </Label>
          </div>
          <div className="mt-2 text-xs font-semibold text-blue-500 dark:text-blue-400">
            Showing <span className="font-black">{filteredOffers.length}</span> crowdsourced offer(s)
            {searchQuery.trim() ? ' (also filtered by top search bar)' : ''}.
            {expiredOffers.length ? ` ${expiredOffers.length} old calendar${expiredOffers.length === 1 ? '' : 's'} can be cleaned up.` : ''}
          </div>
        </div>

        {expiredOffers.length ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30">
            <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-amber-950 dark:text-amber-100">
              <input
                type="checkbox"
                checked={allExpiredSelected}
                onChange={toggleAllExpired}
                disabled={deletingExpired}
              />
              <span>Select all old calendars ({expiredOffers.length})</span>
            </label>
            <button
              type="button"
              onClick={() => void deleteSelectedExpired()}
              disabled={selectedExpiredIds.length === 0 || deletingExpired}
              className="h-10 rounded-xl bg-red-600 px-4 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deletingExpired ? 'Deleting…' : `Delete selected (${selectedExpiredIds.length})`}
            </button>
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          {filteredOffers.map((h) => (
            <Card key={h.id} className="border-blue-200 dark:border-blue-900/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div className="flex items-center gap-4">
                    {isExpired(h) ? (
                      <input
                        type="checkbox"
                        checked={selectedExpiredIds.includes(h.id)}
                        onChange={() => toggleExpiredOffer(h.id)}
                        disabled={deletingExpired}
                        aria-label={`Select expired calendar ${h.semester_label}`}
                      />
                    ) : null}
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl dark:bg-blue-900/50">
                      👤
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                        {h.user_profile?.full_name || 'Unknown User'}
                      </div>
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {h.user_profile?.email || 'No email provided'} 
                        {h.user_profile?.phone_number ? ` • ${h.user_profile.phone_number}` : ''}
                      </div>
                      <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-400">
                        Submitted: {new Date(h.created_at).toLocaleString()}
                      </div>
                      {isExpired(h) ? (
                        <div className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                          Old calendar · ended {h.end_date}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {(h.report_count ?? 0) > 0 ? (
                      <div className="rounded-xl border border-red-500 bg-red-100 px-3 py-1.5 text-xs font-black text-red-700 shadow-sm dark:border-red-900 dark:bg-red-950 dark:text-red-300 flex items-center gap-1">
                        <span className="text-sm">🚨</span> {h.report_count} Reports
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/60 transition-colors"
                      disabled={Boolean(deletingOfferId) || deletingExpired}
                      onClick={async () => {
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
                      }}
                    >
                      {deletingOfferId === h.id ? 'Deleting…' : 'Delete Offer'}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="mb-3 text-sm font-black text-slate-700 dark:text-slate-300">
                    Calendar Details
                  </div>
                  <AcademicCalendarOfferGraphic
                    offer={h}
                    universityName={h.university_id}
                  />
                </div>

                {h.admin_note ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                    <span className="font-black text-slate-900 dark:text-slate-100">Note: </span>
                    {h.admin_note}
                  </div>
                ) : null}
                
                <div className="flex flex-wrap gap-3 pt-2 text-xs font-bold">
                  {h.official_url ? (
                    <a href={h.official_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
                      🔗 Original URL
                    </a>
                  ) : null}
                  {h.reference_pdf_url ? (
                    <a
                      href={h.reference_pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                    >
                      📄 Reference PDF
                    </a>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredOffers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-800">
              <span className="text-4xl mb-4">📭</span>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100">No crowdsourced offers yet</div>
              <div className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md">
                When users publish their academic calendars from the mobile app, they will appear here for you to review.
              </div>
            </div>
          ) : null}
        </div>
      </MotionSection>
    </div>
  );
}
