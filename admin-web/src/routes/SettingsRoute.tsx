import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const SETTINGS_SEARCH_BLOB =
  'Settings app name theme integration timeouts coming next settings editor configuration';

export function SettingsRoute() {
  const { searchQuery } = useAdminSearch();
  const settingsMatches = !searchQuery.trim() || matchesAdminSearch(searchQuery, SETTINGS_SEARCH_BLOB);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Settings</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          App name, theme, and integration timeouts.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              Top search checks this page’s keywords until the real editor ships.
            </span>
          ) : null}
        </div>
      </MotionSection>
      <MotionSection delay={0.06} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            {settingsMatches ? (
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">Coming next: settings editor.</div>
            ) : (
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Nothing on this page matches “{searchQuery.trim()}”. Clear the top search or try another section.
              </div>
            )}
          </div>
        </MotionPanel>
      </MotionSection>
    </div>
  );
}

