/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';

const COOKIE_KEY = 'nbmd_consent';

function clearCookie() {
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
}

function getCookie(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE_KEY}=`))
    ?.split('=')[1];
}

describe('useCookieConsent', () => {
  beforeEach(() => {
    clearCookie();
  });

  it('stores consent cookie on accept all', async () => {
    const { useCookieConsent } = await import('../hooks/useCookieConsent');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.showBanner).toBe(true);
    expect(result.current.consent).toBeNull();

    act(() => result.current.acceptAll());

    expect(result.current.showBanner).toBe(false);
    expect(result.current.consent).toEqual({ essential: true, analytics: true, functional: true });
    expect(result.current.analyticsAllowed).toBe(true);

    const raw = getCookie();
    expect(raw).toBeDefined();
    const parsed = JSON.parse(decodeURIComponent(raw!));
    expect(parsed.analytics).toBe(true);
  });

  it('stores essential-only cookie on reject all', async () => {
    const { useCookieConsent } = await import('../hooks/useCookieConsent');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useCookieConsent());

    act(() => result.current.rejectAll());

    expect(result.current.showBanner).toBe(false);
    expect(result.current.consent).toEqual({ essential: true, analytics: false, functional: false });
    expect(result.current.analyticsAllowed).toBe(false);
  });

  it('stores custom preferences', async () => {
    const { useCookieConsent } = await import('../hooks/useCookieConsent');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useCookieConsent());

    act(() => result.current.saveCustom({ analytics: false, functional: true }));

    expect(result.current.consent).toEqual({ essential: true, analytics: false, functional: true });
    expect(result.current.analyticsAllowed).toBe(false);
  });

  it('reads existing consent from cookie', async () => {
    const prefs = { essential: true, analytics: true, functional: true };
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(JSON.stringify(prefs))}; path=/`;

    // Dynamic import to pick up the cookie
    const mod = await import('../hooks/useCookieConsent');
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() => mod.useCookieConsent());

    expect(result.current.showBanner).toBe(false);
    expect(result.current.consent).toEqual(prefs);
  });
});
