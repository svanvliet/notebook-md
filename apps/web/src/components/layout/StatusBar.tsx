import { useTranslation } from 'react-i18next';

interface StatusBarProps {
  wordCount: number;
  charCount: number;
  lastSaved: string | null;
  message: string | null;
  onNavigateToLegal?: (page: 'terms' | 'privacy') => void;
}

export function StatusBar({ wordCount, charCount, lastSaved, message, onNavigateToLegal }: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <footer data-print="hide" className="statusbar h-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center px-3 text-xs text-gray-500 dark:text-gray-400 shrink-0 select-none">
      {message ? (
        <span className="text-blue-600 dark:text-blue-400">{message}</span>
      ) : (
        <div className="flex items-center gap-4">
          <span>{t('editor.wordCount', { count: wordCount })}</span>
          <span>{t('editor.charCount', { count: charCount })}</span>
          {lastSaved && <span>{t('editor.lastSaved', { time: lastSaved })}</span>}
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        <button onClick={() => onNavigateToLegal?.('terms')} className="hover:underline">Terms</button>
        <button onClick={() => onNavigateToLegal?.('privacy')} className="hover:underline">Privacy</button>
      </div>
    </footer>
  );
}
