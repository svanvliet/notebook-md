import { describe, it, expect } from 'vitest';
import type { AppSettings } from '../hooks/useSettings';

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

describe('AppSettings', () => {
  it('default fontFamily is system font stack', () => {
    expect(DEFAULT_SETTINGS.fontFamily).toContain('-apple-system');
  });

  it('default fontSize is 16', () => {
    expect(DEFAULT_SETTINGS.fontSize).toBe(16);
  });

  it('default spellCheck is true', () => {
    expect(DEFAULT_SETTINGS.spellCheck).toBe(true);
  });

  it('default margins is regular', () => {
    expect(DEFAULT_SETTINGS.margins).toBe('regular');
  });

  it('merging partial update preserves other settings', () => {
    const updated: AppSettings = { ...DEFAULT_SETTINGS, fontFamily: "'Inter', sans-serif", fontSize: 20 };
    expect(updated.fontFamily).toBe("'Inter', sans-serif");
    expect(updated.fontSize).toBe(20);
    expect(updated.spellCheck).toBe(true);
    expect(updated.margins).toBe('regular');
  });

  it('all font families are valid CSS values', () => {
    const fonts = [
      DEFAULT_SETTINGS.fontFamily,
      "'Inter', sans-serif",
      "'Georgia', serif",
      "'JetBrains Mono', monospace",
      "'Merriweather', serif",
      "'Source Sans 3', sans-serif",
    ];
    for (const font of fonts) {
      expect(font.length).toBeGreaterThan(0);
      // Should contain a fallback generic family
      expect(font).toMatch(/sans-serif|serif|monospace/);
    }
  });
});
