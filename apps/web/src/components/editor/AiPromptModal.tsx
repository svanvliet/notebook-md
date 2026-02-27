import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFlag } from '../../hooks/useFlagProvider';

export type AiLength = 'short' | 'medium' | 'long';

interface AiPromptModalProps {
  onSubmit: (prompt: string, length: AiLength, webSearch: boolean) => void;
  onCancel: () => void;
  remainingQuota: number | null;
  quotaLimit: number | null;
}

const LENGTH_OPTIONS: { value: AiLength; labelKey: string }[] = [
  { value: 'short', labelKey: 'editor.ai.modal.length.short' },
  { value: 'medium', labelKey: 'editor.ai.modal.length.medium' },
  { value: 'long', labelKey: 'editor.ai.modal.length.long' },
];

export function AiPromptModal({ onSubmit, onCancel, remainingQuota, quotaLimit }: AiPromptModalProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [length, setLength] = useState<AiLength>('medium');
  const [webSearch, setWebSearch] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const webSearchEnabled = useFlag('ai_web_search');

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const isQuotaExhausted = remainingQuota !== null && remainingQuota <= 0;
  const canSubmit = prompt.trim().length > 0 && !isQuotaExhausted;

  const handleSubmit = () => {
    if (canSubmit) onSubmit(prompt.trim(), length, webSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[calc(100%-2rem)] md:w-[480px] overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="px-5 pt-5 pb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="text-base">✨</span>
            {t('editor.ai.modal.title', 'Create with AI')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('editor.ai.modal.subtitle', 'Describe the content you\'d like to generate')}
          </p>
        </div>

        <div className="px-5 pb-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={t('editor.ai.modal.placeholder', 'e.g., "Write an introduction to machine learning"')}
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            style={{ minHeight: '80px' }}
          />

          {/* Length toggle */}
          <div className="flex items-center gap-1 mt-2 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg w-fit">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLength(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  length === opt.value
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t(opt.labelKey, opt.value.charAt(0).toUpperCase() + opt.value.slice(1))}
              </button>
            ))}
          </div>

          {/* Web Search toggle */}
          {webSearchEnabled && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                🌐 {t('editor.ai.modal.webSearch', 'Use web search for up-to-date information')}
              </span>
            </label>
          )}

          {/* Quota display */}
          {remainingQuota !== null && quotaLimit !== null && (
            <div className="mt-2">
              {isQuotaExhausted ? (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {t('editor.ai.modal.quotaExceeded', 'Daily AI generation limit reached. Try again tomorrow.')}
                </p>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('editor.ai.modal.remaining', '{{count}} of {{limit}} remaining today', {
                    count: remainingQuota,
                    limit: quotaLimit,
                  })}
                </p>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
            {t('editor.ai.modal.disclaimer', 'Your prompt and document content are sent to an AI service (Azure OpenAI) to generate a response.')}
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={onCancel}
            className="px-4 h-8 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {t('editor.ai.modal.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 h-8 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <span className="text-xs">✨</span>
            {t('editor.ai.modal.create', 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
