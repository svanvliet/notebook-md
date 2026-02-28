/**
 * useNetworkStatus — tracks online/offline state for the desktop app.
 *
 * Works in both browser and Tauri WebView (navigator.onLine is supported).
 * Cloud notebooks and AI features check this before making API calls.
 */

import { useState, useEffect, useCallback } from 'react';

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const handleOnline = useCallback(() => setIsOnline(true), []);
  const handleOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline };
}
