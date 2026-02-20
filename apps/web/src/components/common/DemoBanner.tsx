import { useState } from 'react';

interface DemoBannerProps {
  onCreateAccount: () => void;
}

export function DemoBanner({ onCreateAccount }: DemoBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/50 px-4 py-2 flex items-center justify-between gap-4 text-sm">
      <p className="text-blue-800 dark:text-blue-200">
        You're using Notebook.md in demo mode.{' '}
        <button onClick={onCreateAccount} className="font-medium underline hover:no-underline">
          Create a free account
        </button>{' '}
        to connect cloud storage and sync across devices.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 shrink-0"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
