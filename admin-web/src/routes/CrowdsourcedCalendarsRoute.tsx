import { useEffect, useState, useMemo } from 'react';
import {
  listCrowdsourcedCalendarOffers,
  deleteUniversityCalendarOffer,
  type CrowdsourcedCalendarRow,
} from '../lib/api';
import { Card, CardContent } from '../ui/Card';
import { Label, TextInput } from '../ui/Input';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { AcademicCalendarOfferGraphic } from '../components/AcademicCalendarOfferGraphic';

export function CrowdsourcedCalendarsRoute() {
  const { searchQuery, clearSearch } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [offers, setOffers] = useState<CrowdsourcedCalendarRow[]>([]);
  const [offersSearch, setOffersSearch] = useState('');
  const [deletingOfferId, setDeletingOfferId] = useState<string>('');

  const refreshHistory = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listCrowdsourcedCalendarOffers();
      setOffers(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  const filteredOffers = useMemo(() => {
    const qTop = searchQuery.trim().toLowerCase();
    const qLocal = offersSearch.trim().toLowerCase();
    
    return offers.filter((h) => {
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
  }, [offers, offersSearch, searchQuery]);

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
        <MotionPanel delay={0.05}>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {err}
          </div>
        </MotionPanel>
      ) : null}
      
      {okMsg ? (
        <MotionPanel delay={0.05}>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
            {okMsg}
          </div>
        </MotionPanel>
      ) : null}

      <MotionSection delay={0.1}>
        <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
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
          </div>
          <div className="mt-2 text-xs font-semibold text-blue-500 dark:text-blue-400">
            Showing <span className="font-black">{filteredOffers.length}</span> crowdsourced offer(s)
            {searchQuery.trim() ? ' (also filtered by top search bar)' : ''}.
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {filteredOffers.map((h) => (
            <Card key={h.id} className="border-blue-200 dark:border-blue-900/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div className="flex items-center gap-4">
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
                      disabled={Boolean(deletingOfferId)}
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
