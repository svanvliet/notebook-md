import { useState, useRef, useEffect } from 'react';

interface DevBadgeProps {
  onDevLogin?: () => void;
}

/**
 * Orange "DEV" pill shown only in non-production mode.
 * Floats at the center of the title bar / nav bar to distinguish dev from prod.
 * Clicking opens a small dropdown with dev-only actions.
 */
export function DevBadge({ onDevLogin }: DevBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm cursor-pointer select-none"
      >
        DEV
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
          {onDevLogin && (
            <button
              onClick={() => { onDevLogin(); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Log in to Dev Account
            </button>
          )}
          <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 mt-1">
            {window.location.host}
          </div>
        </div>
      )}
    </div>
  );
}
