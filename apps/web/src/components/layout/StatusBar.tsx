import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

interface StatusBarProps {
  wordCount: number;
  charCount: number;
  lastSaved: string | null;
  message: string | null;
}

export function StatusBar({ wordCount, charCount, lastSaved, message }: StatusBarProps) {
  const { t } = useTranslation();
  const location = useLocation();

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
        <Link to="/terms" state={{ backgroundLocation: location }} className="hover:underline">Terms</Link>
        <Link to="/privacy" state={{ backgroundLocation: location }} className="hover:underline">Privacy</Link>
      </div>
    </footer>
  );
}
