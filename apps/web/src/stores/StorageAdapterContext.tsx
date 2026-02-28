/**
 * React context for the storage adapter.
 * Wraps the app so any component can access the platform-correct adapter.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { StorageAdapter } from './StorageAdapter';
import { getStorageAdapter } from './storageAdapterFactory';

const StorageAdapterContext = createContext<StorageAdapter | null>(null);

export function StorageAdapterProvider({ children }: { children: React.ReactNode }) {
  const adapter = useMemo(() => getStorageAdapter(), []);
  return (
    <StorageAdapterContext.Provider value={adapter}>
      {children}
    </StorageAdapterContext.Provider>
  );
}

export function useStorageAdapter(): StorageAdapter {
  const ctx = useContext(StorageAdapterContext);
  if (!ctx) {
    throw new Error('useStorageAdapter must be used within <StorageAdapterProvider>');
  }
  return ctx;
}
