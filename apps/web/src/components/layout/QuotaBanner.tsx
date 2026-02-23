import { useState, useEffect } from 'react';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface UsageData {
  cloudNotebookCount: number;
  cloudStorageBytes: number;
  limits: {
    maxCloudNotebooks: number;
    maxStorageBytes: number;
  };
}

export default function QuotaBanner() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const flagEnabled = useFeatureFlag('soft_quota_banners');

  useEffect(() => {
    if (!flagEnabled) return;

    const fetchUsage = () => {
      fetch(`${API_BASE}/api/usage/me`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => setUsage(data))
        .catch(() => {});
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, [flagEnabled]);

  if (!flagEnabled || !usage || dismissed) return null;

  const storageBytes = usage.storageBytesUsed ?? 0;
  const maxBytes = usage.storageLimit ?? 500 * 1024 * 1024;
  const pct = maxBytes > 0 ? (storageBytes / maxBytes) * 100 : 0;
  const usedMB = (storageBytes / (1024 * 1024)).toFixed(1);
  const maxMB = (maxBytes / (1024 * 1024)).toFixed(0);

  if (pct < 90) return null;

  const exceeded = pct >= 100;

  return (
    <div className={`px-4 py-2 text-sm flex items-center justify-between ${
      exceeded
        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    }`}>
      <span>
        {exceeded
          ? `You've exceeded your Cloud storage limit. ${usedMB} MB of ${maxMB} MB used. You can continue editing for now, but please free up space.`
          : `You're approaching your Cloud storage limit. ${usedMB} MB of ${maxMB} MB used.`}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-xs underline hover:no-underline"
      >
        Dismiss
      </button>
    </div>
  );
}
