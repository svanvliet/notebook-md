import { useState } from 'react';
import type { ConsentPreferences } from '../../hooks/useCookieConsent';

interface CookieConsentBannerProps {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onSaveCustom: (prefs: Omit<ConsentPreferences, 'essential'>) => void;
}

export function CookieConsentBanner({ onAcceptAll, onRejectAll, onSaveCustom }: CookieConsentBannerProps) {
  const [showPreferences, setShowPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(true);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-4">
        {!showPreferences ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">
              We use cookies to keep you signed in and remember your preferences.{' '}
              <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                Privacy Policy
              </a>
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowPreferences(true)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                Manage
              </button>
              <button
                onClick={onRejectAll}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                Reject All
              </button>
              <button
                onClick={onAcceptAll}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Accept All
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Cookie Preferences</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked disabled className="rounded" />
                <span><strong>Essential</strong> — Required for sign-in and core functionality</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={functional} onChange={(e) => setFunctional(e.target.checked)} className="rounded" />
                <span><strong>Functional</strong> — Remembers your preferences and settings</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="rounded" />
                <span><strong>Analytics</strong> — Helps us improve the app (not currently active)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPreferences(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                Back
              </button>
              <button
                onClick={() => onSaveCustom({ analytics, functional })}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
