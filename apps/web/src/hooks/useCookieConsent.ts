import { useState, useEffect, useCallback } from 'react';

type ConsentLevel = 'all' | 'essential' | 'custom';

interface ConsentPreferences {
  essential: boolean; // Always true
  analytics: boolean;
  functional: boolean;
}

const COOKIE_KEY = 'nbmd_consent';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

function getStoredConsent(): ConsentPreferences | null {
  try {
    const raw = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE_KEY}=`))
      ?.split('=')[1];
    return raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    return null;
  }
}

function storeConsent(prefs: ConsentPreferences) {
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function respectsDNT(): boolean {
  return navigator.doNotTrack === '1' || (navigator as unknown as { globalPrivacyControl?: string }).globalPrivacyControl === '1';
}

import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export function useCookieConsent() {
  const [consent, setConsent] = useState<ConsentPreferences | null>(() => getStoredConsent());
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!consent) {
      // Desktop app: no cookie banner needed — auto-accept essentials
      if (isTauriEnvironment() || respectsDNT()) {
        const essentialOnly: ConsentPreferences = { essential: true, analytics: false, functional: false };
        storeConsent(essentialOnly);
        setConsent(essentialOnly);
      } else {
        setShowBanner(true);
      }
    }
  }, [consent]);

  const acceptAll = useCallback(() => {
    const prefs: ConsentPreferences = { essential: true, analytics: true, functional: true };
    storeConsent(prefs);
    setConsent(prefs);
    setShowBanner(false);
  }, []);

  const rejectAll = useCallback(() => {
    const prefs: ConsentPreferences = { essential: true, analytics: false, functional: false };
    storeConsent(prefs);
    setConsent(prefs);
    setShowBanner(false);
  }, []);

  const saveCustom = useCallback((prefs: Omit<ConsentPreferences, 'essential'>) => {
    const full: ConsentPreferences = { essential: true, ...prefs };
    storeConsent(full);
    setConsent(full);
    setShowBanner(false);
  }, []);

  return {
    consent,
    showBanner,
    acceptAll,
    rejectAll,
    saveCustom,
    analyticsAllowed: consent?.analytics ?? false,
  };
}

export type { ConsentLevel, ConsentPreferences };
