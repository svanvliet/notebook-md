import { useState } from 'react';

interface DiscardModalProps {
  workingBranch: string;
  repoFullName: string;
  onDiscard: () => void;
  onCancel: () => void;
}

export function DiscardModal({
  workingBranch,
  repoFullName,
  onDiscard,
  onCancel,
}: DiscardModalProps) {
  const [discarding, setDiscarding] = useState(false);

  const handleDiscard = () => {
    setDiscarding(true);
    onDiscard();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Discard Changes</h2>

        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will permanently delete the working branch and all unpublished changes on it.
          </p>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Repository:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{repoFullName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Branch:</span>
              <span className="font-mono text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">{workingBranch}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            Open files will be reloaded from the base branch. This cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDiscard}
            disabled={discarding}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {discarding ? 'Discarding…' : 'Discard Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
