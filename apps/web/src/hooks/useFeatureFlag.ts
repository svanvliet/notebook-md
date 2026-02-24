import { useFlag } from './useFlagProvider';

/**
 * Check if a feature flag is enabled.
 * Uses the FlagProvider context for batch resolution.
 * @deprecated Prefer useFlag() from useFlagProvider.tsx directly.
 */
export function useFeatureFlag(key: string): boolean {
  return useFlag(key);
}

