import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteUser,
  listAiUsageForUsers,
  listUserCountries,
  listUsers,
  resetUserMonthlyTokens,
  setUserStatus,
  setUserSubscriptionPlan,
  setUserTokenLimit,
  type AdminUserCountry,
  type AdminUserRow,
  type SubscriptionPlan,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { useSafeActionDialog } from '../components/SafeActionDialog';
import { Button } from '../ui/Button';
import { Label, Select, TextInput } from '../ui/Input';
import { EmptyState, Notice, PageHeader, Panel, SidePanel, SkeletonRows } from '../ui/page';
import { formatCountry } from '../components/people/format';
import { TokenActionDialog, type TokenDialogState } from '../components/people/TokenActionDialog';
import { UserActionGroups, type UserActionItem } from '../components/people/UserActions';
import { UserChips, UserFacts, UserRow } from '../components/people/UserParts';

export function UsersRoute() {
  type RowLimit = 25 | 50 | 100 | 200;
  type SortKey = 'newest' | 'oldest' | 'name_az' | 'name_za';
  const { searchQuery } = useAdminSearch();
  const [query, setQuery] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [countries, setCountries] = useState<AdminUserCountry[]>([]);
  const [planFilter, setPlanFilter] = useState<'all' | SubscriptionPlan>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminUserRow['status']>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rowLimit, setRowLimit] = useState<RowLimit>(50);
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);
  const [usageByUser, setUsageByUser] = useState<Record<string, number>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<TokenDialogState | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();
  const hasMounted = useRef(false);

  const loadUsage = async (users: AdminUserRow[]) => {
    const ids = users.map((u) => u.id).filter(Boolean);
    if (!ids.length) {
      setUsageByUser({});
      return;
    }
    setUsageLoading(true);
    try {
      const totals = await listAiUsageForUsers(ids);
      setUsageByUser(totals);
    } catch (e) {
      // Non-fatal: users table still renders, the usage column just shows "—".
      console.warn('Failed to load AI usage:', e);
    } finally {
      setUsageLoading(false);
    }
  };

  const refresh = async (targetPage = page) => {
    setBusy(true);
    setErr('');
    try {
      const baseArgs = {
        query: query.trim() || undefined,
        universityId: universityId.trim() || undefined,
        country: countryFilter.trim() || undefined,
        plan: planFilter,
        status: statusFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort: sortBy,
      };
      const res = await listUsers({ ...baseArgs, limit: rowLimit, offset: targetPage * rowLimit });
      setPage(targetPage);
      setItems(res.items);
      setCount(res.count);
      void loadUsage(res.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh(0);
    // The list is admin-only and tiny; an empty result just means the database
    // has not been migrated yet, and the filter stays hidden.
    void listUserCountries()
      .then(setCountries)
      .catch((e) => console.warn('Failed to load country list:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    void refresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowLimit, countryFilter]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((u) =>
      matchesAdminSearch(
        searchQuery,
        u.id,
        u.email,
        u.name,
        u.student_id,
        u.university_id,
        u.country,
        u.status,
        u.subscription_plan,
        u.device_platform,
        u.created_at,
      ),
    );
  }, [items, searchQuery]);

  const rows = filteredRows;
  const pageCount = Math.max(1, Math.ceil(count / rowLimit));
  // The detail panel follows the loaded rows, so it shows fresh data after an
  // action reloads the list, and closes if the user is no longer in the list.
  const selectedUser = expandedUserId ? items.find((u) => u.id === expandedUserId) ?? null : null;

  // Same actions, confirmations and calls as before; only where they are shown changed.
  const userActions = (u: AdminUserRow, used: number): UserActionItem[] => [
    {
      label: 'Activate',
      group: 'Account',
      onClick: async () => {
        requestSafeAction({ title: 'Activate user', operation: 'Activate', affectedCount: 1, subject: `${u.name || u.id} (${u.id})`, confirmationText: 'ACTIVATE', requireReason: true, onConfirm: async (reason) => { await setUserStatus(u.id, 'active', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Disable',
      group: 'Account',
      variant: 'amber',
      onClick: async () => {
        requestSafeAction({ title: 'Disable user', operation: 'Disable', affectedCount: 1, subject: `${u.name || u.id} (${u.id})`, confirmationText: 'DISABLE', requireReason: true, warning: 'The user may lose access until reactivated.', onConfirm: async (reason) => { await setUserStatus(u.id, 'disabled', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Ban',
      group: 'Account',
      variant: 'rose',
      onClick: async () => {
        requestSafeAction({ title: 'Ban user', operation: 'Ban', affectedCount: 1, subject: `${u.name || u.id} (${u.id})`, confirmationText: 'BAN', requireReason: true, warning: 'This blocks the user account. It does not delete their data.', onConfirm: async (reason) => { await setUserStatus(u.id, 'banned', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Set Free',
      group: 'Plan',
      variant: 'amber',
      onClick: async () => {
        requestSafeAction({ title: 'Change subscription plan', operation: 'Set Free', affectedCount: 1, subject: `${u.name || u.id} → Free`, confirmationText: 'SET FREE', requireReason: true, warning: 'Only the explicit admin grant is removed. Valid RevenueCat or Curlec access remains authoritative.', onConfirm: async (reason) => { await setUserSubscriptionPlan(u.id, 'free', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Set Plus',
      group: 'Plan',
      onClick: async () => {
        requestSafeAction({ title: 'Grant Plus access', operation: 'Set Plus', affectedCount: 1, subject: `${u.name || u.id} → Plus`, confirmationText: 'SET PLUS', requireReason: true, onConfirm: async (reason) => { await setUserSubscriptionPlan(u.id, 'plus', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Set Pro',
      group: 'Plan',
      onClick: async () => {
        requestSafeAction({ title: 'Grant Pro access', operation: 'Set Pro', affectedCount: 1, subject: `${u.name || u.id} → Pro`, confirmationText: 'SET PRO', requireReason: true, onConfirm: async (reason) => { await setUserSubscriptionPlan(u.id, 'pro', reason); await refresh(); return { affected: 1 }; } });
      },
    },
    {
      label: 'Reset AI usage',
      group: 'AI usage',
      variant: 'amber',
      onClick: () => {
        setTokenDialog({ mode: 'reset', user: u, used });
      },
    },
    {
      label: 'Set AI limit',
      group: 'AI usage',
      onClick: () => {
        setTokenDialog({ mode: 'set_limit', user: u, used });
      },
    },
    {
      label: 'Delete user',
      group: 'Delete',
      variant: 'danger',
      onClick: async () => {
        const expected = (u.student_id && u.student_id.trim()) || u.id.slice(0, 8);
        requestSafeAction({ title: 'Permanently delete user', operation: 'Delete user', affectedCount: 1, subject: `${u.name || u.id} (${u.id})`, confirmationText: expected, requireReason: true, irreversible: true, warning: 'This permanently deletes the authentication account and associated data. Undo is unavailable.', onConfirm: async (reason) => { await deleteUser(u.id, reason); await refresh(); return { affected: 1 }; } });
      },
    },
  ];

  const searching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Find a student, see their details, change their access or plan, or delete their account." />

      <Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="users-search" className="mb-1">Search</Label>
            <TextInput id="users-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Email, name, student ID or user ID" />
          </div>
          <div>
            <Label htmlFor="users-university" className="mb-1">University</Label>
            <TextInput id="users-university" value={universityId} onChange={(e) => setUniversityId(e.target.value)} placeholder="e.g. uitm" />
          </div>
          <div>
            <Label htmlFor="users-country" className="mb-1">Country</Label>
            <Select id="users-country" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {formatCountry(c.country)} ({c.userCount.toLocaleString()})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="users-plan" className="mb-1">Plan</Label>
            <Select id="users-plan" value={planFilter} onChange={(e) => setPlanFilter(e.target.value as 'all' | SubscriptionPlan)}>
              <option value="all">All plans</option>
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="users-status" className="mb-1">Status</Label>
            <Select id="users-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | AdminUserRow['status'])}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="banned">Banned</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="users-from" className="mb-1">Joined from</Label>
            <TextInput id="users-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="users-to" className="mb-1">Joined to</Label>
            <TextInput id="users-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="users-sort" className="mb-1">Sort</Label>
            <Select id="users-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="newest">Newest joined</option>
              <option value="oldest">Oldest joined</option>
              <option value="name_az">Name A-Z</option>
              <option value="name_za">Name Z-A</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="users-limit" className="mb-1">Show</Label>
            <Select id="users-limit" value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value) as RowLimit)}>
              <option value={25}>25 users</option>
              <option value={50}>50 users</option>
              <option value={100}>100 users</option>
              <option value={200}>200 users</option>
            </Select>
          </div>
          <div className="flex items-end sm:col-span-2 sm:justify-end">
            <Button onClick={() => void refresh(0)} disabled={busy} className="w-full sm:w-auto sm:px-8">
              {busy ? 'Loading…' : 'Search'}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Country and Show apply straight away. Other filters apply when you press Search.
        </p>
      </Panel>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <Panel
        padded={false}
        title={`Showing ${rows.length.toLocaleString()} of ${count.toLocaleString()} users`}
        description={
          [searching ? 'Also filtered by the top search bar.' : '', usageLoading ? 'Loading AI usage…' : '']
            .filter(Boolean)
            .join(' ') || 'Click a user to see all their details and actions.'
        }
      >
        {busy && items.length === 0 ? (
          <div className="p-5">
            <SkeletonRows rows={6} height="h-16" />
          </div>
        ) : rows.length === 0 ? (
          busy ? null : (
            <div className="p-5">
              <EmptyState title={searching && items.length > 0 ? 'No loaded users match the top search' : 'No users found'}>
                {searching && items.length > 0 ? 'Clear it or run Search again.' : 'Try different filters, then press Search.'}
              </EmptyState>
            </div>
          )
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((u) => (
              <li key={u.id}>
                <UserRow u={u} used={usageByUser[u.id] ?? 0} onOpen={() => setExpandedUserId(u.id)} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <Button variant="secondary" size="sm" disabled={busy || page === 0} onClick={() => void refresh(page - 1)}>
            Previous
          </Button>
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Page {page + 1} of {pageCount}
          </div>
          <Button variant="secondary" size="sm" disabled={busy || page + 1 >= pageCount} onClick={() => void refresh(page + 1)}>
            Next
          </Button>
        </div>
      </Panel>

      {selectedUser ? (
        <SidePanel
          title={selectedUser.name || selectedUser.email || selectedUser.id.slice(0, 8)}
          subtitle={selectedUser.email || selectedUser.id}
          chips={<UserChips u={selectedUser} />}
          onClose={() => setExpandedUserId(null)}
        >
          <section>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</h3>
            <UserActionGroups items={userActions(selectedUser, usageByUser[selectedUser.id] ?? 0)} />
          </section>
          <UserFacts u={selectedUser} usedThisMonth={usageByUser[selectedUser.id] ?? 0} />
        </SidePanel>
      ) : null}

      {tokenDialog ? (
        <TokenActionDialog
          state={tokenDialog}
          onClose={() => setTokenDialog(null)}
          onApply={async ({ limit }) => {
            if (tokenDialog.mode === 'reset') {
              await resetUserMonthlyTokens(tokenDialog.user.id);
            } else {
              await setUserTokenLimit(tokenDialog.user.id, limit);
            }
            await refresh();
          }}
        />
      ) : null}
      {safeActionDialog}
    </div>
  );
}
