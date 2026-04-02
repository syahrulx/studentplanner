import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AdminSearchContextValue = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  clearSearch: () => void;
};

const AdminSearchContext = createContext<AdminSearchContextValue | null>(null);

export function AdminSearchProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQueryState] = useState('');
  const setSearchQuery = useCallback((q: string) => {
    setSearchQueryState(q);
  }, []);
  const clearSearch = useCallback(() => setSearchQueryState(''), []);
  const value = useMemo(
    () => ({ searchQuery, setSearchQuery, clearSearch }),
    [searchQuery, setSearchQuery, clearSearch],
  );
  return <AdminSearchContext.Provider value={value}>{children}</AdminSearchContext.Provider>;
}

export function useAdminSearch(): AdminSearchContextValue {
  const ctx = useContext(AdminSearchContext);
  if (!ctx) {
    throw new Error('useAdminSearch must be used within AdminSearchProvider');
  }
  return ctx;
}
