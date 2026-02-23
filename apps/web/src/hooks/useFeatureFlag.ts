import { useState, useEffect } from 'react';
import { apiFetch } from '../api/apiFetch';

const flagCache = new Map<string, { value: boolean; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Check if a feature flag is enabled. Returns false while loading.
 * Results are cached for 1 minute to avoid excessive API calls.
 */
export function useFeatureFlag(key: string): boolean {
  const [enabled, setEnabled] = useState(() => {
    const cached = flagCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value;
    }
    return false;
  });

  useEffect(() => {
    const cached = flagCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setEnabled(cached.value);
      return;
    }

    let cancelled = false;
    apiFetch(`/api/feature-flags/${key}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data) {
          const value = data.enabled ?? false;
          flagCache.set(key, { value, fetchedAt: Date.now() });
          setEnabled(value);
        }
      })
      .catch(() => {
        // Flag check failed — default to false
      });

    return () => { cancelled = true; };
  }, [key]);

  return enabled;
}
