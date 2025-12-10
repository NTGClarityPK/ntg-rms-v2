'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface InventoryRefreshContextType {
  refreshKey: number;
  triggerRefresh: () => void;
}

const InventoryRefreshContext = createContext<InventoryRefreshContextType | undefined>(undefined);

export function InventoryRefreshProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <InventoryRefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </InventoryRefreshContext.Provider>
  );
}

export function useInventoryRefresh() {
  const context = useContext(InventoryRefreshContext);
  if (context === undefined) {
    throw new Error('useInventoryRefresh must be used within an InventoryRefreshProvider');
  }
  return context;
}

