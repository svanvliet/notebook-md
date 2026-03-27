import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { apiFetch } from '../api/apiFetch';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

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

// Desktop (Tauri) flags — AI features are always available if the user has configured a key.
// The actual "is configured" check happens at generation time; flags just control UI visibility.
const DESKTOP_FLAGS: Record<string, ResolvedFlag> = {
  ai_content_generation: { enabled: true, variant: null, badge: null, source: 'desktop' },
  ai_web_search: { enabled: true, variant: null, badge: null, source: 'desktop' },
  ai_demo_mode: { enabled: false, variant: null, badge: null, source: 'desktop' },
};

export function FlagProvider({ children }: { children: ReactNode }) {
  const isDesktop = isTauriEnvironment();
  const [flags, setFlags] = useState<Record<string, ResolvedFlag>>(isDesktop ? DESKTOP_FLAGS : {});
  const [loading, setLoading] = useState(!isDesktop);

  const fetchFlags = useCallback(() => {
    // Desktop mode: no remote flag server, use hardcoded flags
    if (isDesktop) return;

    apiFetch('/api/flags')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.flags) setFlags(data.flags);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    fetchFlags();
    const interval = setInterval(fetchFlags, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchFlags, isDesktop]);

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
