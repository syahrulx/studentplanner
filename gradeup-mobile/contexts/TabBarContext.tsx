import React, { createContext, useContext } from 'react';

type TabBarContextValue = {
  openAddMenu: () => void;
};

const TabBarContext = createContext<TabBarContextValue | null>(null);

export function TabBarProvider({ children, openAddMenu }: { children: React.ReactNode; openAddMenu: () => void }) {
  return <TabBarContext.Provider value={{ openAddMenu }}>{children}</TabBarContext.Provider>;
}

export function useTabBarAddMenu(): (() => void) | null {
  const ctx = useContext(TabBarContext);
  return ctx?.openAddMenu ?? null;
}
