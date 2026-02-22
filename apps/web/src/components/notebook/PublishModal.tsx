import { useState, useEffect } from 'react';
import { listBranches, type Branch, type PublishResult } from '../../api/github';

interface PublishModalProps {
  workingBranch: string;
  defaultBranch: string;
  owner: string;
  repo: string;
  onPublish: (targetBranch: string, deleteBranch: boolean, commitMessage: string, autoMerge: boolean) => Promise<PublishResult | undefined>;
  onCancel: () => void;
}

export function PublishModal({
  workingBranch,
  defaultBranch,
  owner,
  repo,
  onPublish,
  onCancel,
}: PublishModalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetBranch, setTargetBranch] = useState(defaultBranch);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [autoMerge, setAutoMerge] = useState(true);
  const [commitMessage, setCommitMessage] = useState(`Notebook.md: publish from ${workingBranch}`);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  useEffect(() => {
    listBranches(owner, repo)
      .then((b) => {
        setBranches(b.filter((br) => br.name !== workingBranch));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [owner, repo, workingBranch]);

  const handlePublish = async () => {
    setPublishing(true);
    const res = await onPublish(targetBranch, deleteBranch, commitMessage, autoMerge);
    if (res) {
      setResult(res);
      if (res.outcome === 'merged') {
        // Auto-close after brief success display
        setTimeout(onCancel, 1500);
      }
    }
    setPublishing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-2 md:mx-4 p-4 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Publish Changes</h2>

        {result ? (
          <div className="space-y-4">
            {result.outcome === 'merged' && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span className="text-xl">✓</span>
                <span className="text-sm font-medium">Changes published successfully</span>
              </div>
            )}
            {result.outcome === 'pr_created' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <span className="text-xl">⬤</span>
                  <span className="text-sm font-medium">Pull request created — awaiting approval</span>
                </div>
                {result.prUrl && (
                  <a
                    href={result.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 underline hover:no-underline"
                  >
                    PR #{result.prNumber} — View on GitHub →
                  </a>
                )}
              </div>
            )}
            {result.outcome === 'conflict' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <span className="text-xl">⚠</span>
                  <span className="text-sm font-medium">Merge conflict detected</span>
                </div>
                {result.prUrl && (
                  <a
                    href={result.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 underline hover:no-underline"
                  >
                    PR #{result.prNumber} — Resolve on GitHub →
                  </a>
                )}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Working branch: <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{workingBranch}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Merge into
                </label>
                {loading ? (
                  <div className="text-sm text-gray-500">Loading branches…</div>
                ) : (
                  <select
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}{b.name === defaultBranch ? ' (default)' : ''}{b.protected ? ' 🔒' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Commit message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe your changes..."
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMerge}
                  onChange={(e) => setAutoMerge(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                Auto-merge if possible
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteBranch}
                  onChange={(e) => setDeleteBranch(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                Delete working branch after merge
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || loading || !commitMessage.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
