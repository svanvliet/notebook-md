import posthog from 'posthog-js';
import { useEffect, useRef, useCallback } from 'react';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let initialized = false;

/** Fire-and-forget analytics event from anywhere (no hook needed). */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}

/**
 * Analytics hook — initializes PostHog only when cookie consent is granted.
 * All events use internal user IDs only (no PII). IPs are anonymized.
 */
export function useAnalytics(analyticsAllowed: boolean, userId?: string) {
  const identified = useRef(false);

  useEffect(() => {
    if (!POSTHOG_KEY || !analyticsAllowed) return;

    if (!initialized) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage+cookie',
        ip: false,
        disable_session_recording: true,
        loaded: () => { initialized = true; },
      });
    }

    return () => {
      if (!analyticsAllowed && initialized) {
        posthog.opt_out_capturing();
      }
    };
  }, [analyticsAllowed]);

  useEffect(() => {
    if (!initialized || !userId || identified.current) return;
    posthog.identify(userId);
    identified.current = true;
  }, [userId]);

  useEffect(() => {
    if (!userId && identified.current) {
      posthog.reset();
      identified.current = false;
    }
  }, [userId]);

  const track = useCallback((event: string, properties?: Record<string, unknown>) => {
    if (!initialized || !analyticsAllowed) return;
    posthog.capture(event, properties);
  }, [analyticsAllowed]);

  return { track };
}

// ── Event name constants ─────────────────────────────────────────────────
export const AnalyticsEvents = {
  SIGN_UP: 'user_signed_up',
  SIGN_IN: 'user_signed_in',
  SIGN_OUT: 'user_signed_out',
  NOTEBOOK_CREATED: 'notebook_created',
  FILE_OPENED: 'file_opened',
  FILE_SAVED: 'file_saved',
  FILE_CREATED: 'file_created',
  PUBLISH: 'branch_published',
  SETTINGS_CHANGED: 'settings_changed',
  OAUTH_LINKED: 'oauth_provider_linked',
  TWO_FACTOR_ENABLED: '2fa_enabled',
} as const;
