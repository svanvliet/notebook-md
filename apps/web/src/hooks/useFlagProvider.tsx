import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '../api/apiFetch';

interface ResolvedFlag {
  enabled: boolean;
  variant: string | null;
  badge: string | null;
  source: string;
}

interface FlagContextValue {
  flags: Record<string, ResolvedFlag>;
  loading: boolean;
  refresh: () => void;
}

const FlagContext = createContext<FlagContextValue>({
  flags: {},
  loading: true,
  refresh: () => {},
});

const POLL_INTERVAL_MS = 90_000; // 90 seconds

export function FlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, ResolvedFlag>>({});
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(() => {
    apiFetch('/api/flags')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.flags) setFlags(data.flags);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFlags();
    const interval = setInterval(fetchFlags, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  return (
    <FlagContext.Provider value={{ flags, loading, refresh: fetchFlags }}>
      {children}
    </FlagContext.Provider>
  );
}

/** Get all resolved flags. */
export function useFlags(): FlagContextValue {
  return useContext(FlagContext);
}

/** Check if a single flag is enabled. Drop-in replacement for per-flag fetching. */
export function useFlag(key: string): boolean {
  const { flags } = useContext(FlagContext);
  return flags[key]?.enabled ?? false;
}

/** Get the badge label for a flag (from flight assignment). */
export function useFlagBadge(key: string): string | null {
  const { flags } = useContext(FlagContext);
  return flags[key]?.badge ?? null;
}

export type { ResolvedFlag };
