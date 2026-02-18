import { useState, useCallback, useEffect } from 'react';

const API_BASE = '';
const LOCAL_KEY = 'notebookmd-settings';

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
  margins: 'narrow' | 'regular' | 'wide';
  autoSave: boolean;
  spellCheck: boolean;
  lineNumbers: boolean;
  tabSize: number;
  showWordCount: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 16,
  margins: 'regular',
  autoSave: true,
  spellCheck: true,
  lineNumbers: false,
  tabSize: 2,
  showWordCount: true,
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
        const res = await fetch(`${API_BASE}/auth/settings`, { credentials: 'include' });
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

    // Sync to server if signed in
    if (isSignedIn) {
      try {
        await fetch(`${API_BASE}/auth/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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
