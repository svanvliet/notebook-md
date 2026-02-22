import { useState, useCallback, useEffect } from 'react';
import { trackEvent, AnalyticsEvents } from './useAnalytics';
import { apiFetch } from '../api/apiFetch.js';

const LOCAL_KEY = 'notebookmd-settings';

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
  margins: 'narrow' | 'regular' | 'wide';
  autoSave: boolean;
  spellCheck: boolean;
  lineNumbers: boolean;
  tabSize: number;
  idleTimeoutMinutes: number | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 16,
  margins: 'narrow',
  autoSave: true,
  spellCheck: true,
  lineNumbers: false,
  tabSize: 2,
  idleTimeoutMinutes: null,
};

export function useSettings(isSignedIn: boolean) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_KEY);
      return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Load from server when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const res = await apiFetch('/auth/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings && Object.keys(data.settings).length > 0) {
            const merged = { ...DEFAULT_SETTINGS, ...data.settings };
            setSettings(merged);
            localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
          }
        }
      } catch { /* use local */ }
    })();
  }, [isSignedIn]);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(newSettings));
    trackEvent(AnalyticsEvents.SETTINGS_CHANGED, { keys: Object.keys(updates) });

    // Sync to server if signed in
    if (isSignedIn) {
      try {
        await apiFetch('/auth/settings', {
          method: 'PUT',
          body: JSON.stringify({ settings: newSettings }),
        });
      } catch { /* best effort */ }
    }
  }, [settings, isSignedIn]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }, []);

  return { settings, updateSettings, resetSettings, DEFAULT_SETTINGS };
}
