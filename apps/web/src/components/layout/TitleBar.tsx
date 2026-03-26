import { useTranslation } from 'react-i18next';
import type { DisplayMode } from '@notebook-md/shared';
import { NotebookIcon, UserIcon, SunIcon, MoonIcon, MonitorIcon } from '../icons/Icons';
import { DevBadge } from '../common/DevBadge';
import { useState, useRef, useEffect } from 'react';
import type { User } from '../../hooks/useAuth';

function MenuIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18h18M3 6h18M3 12h18"/></svg>;
}

interface TitleBarProps {
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  user?: User | null;
  isDemoMode?: boolean;
  isDesktopMode?: boolean;
  onSignOut?: () => void;
  onExitDemo?: () => void;
  onCreateAccount?: () => void;
  onOpenAccount?: () => void;
  onOpenSettings?: () => void;
  onDevLogin?: () => void;
  onToggleMobilePane?: () => void;
}

export function TitleBar({ displayMode, onDisplayModeChange, user, isDemoMode, isDesktopMode, onSignOut, onExitDemo, onCreateAccount, onOpenAccount, onOpenSettings, onDevLogin, onToggleMobilePane }: TitleBarProps) {
  const { t } = useTranslation();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const modes: { value: DisplayMode; icon: typeof SunIcon; label: string }[] = [
    { value: 'light', icon: SunIcon, label: t('settings.light') },
    { value: 'dark', icon: MoonIcon, label: t('settings.dark') },
    { value: 'system', icon: MonitorIcon, label: t('settings.system') },
  ];

  return (
    <header className="h-11 border-b border-gray-200 dark:border-gray-800 flex items-center px-3 shrink-0 bg-white dark:bg-gray-950 select-none relative">
      {/* Mobile notebook pane toggle */}
      {onToggleMobilePane && (
        <button
          onClick={onToggleMobilePane}
          className="md:hidden p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors mr-1"
          aria-label="Toggle notebooks"
        >
          <MenuIcon className="w-4 h-4" />
        </button>
      )}
      {/* Left: Logo + App Name */}
      <div className="flex items-center gap-2 shrink-0">
        <NotebookIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-sm hidden sm:inline">{t('app.name')}</span>
      </div>

      {/* Center: Toolbar placeholder — will hold formatting controls when a doc is open */}
      <div className="flex-1 flex items-center justify-center">
        <div id="toolbar-portal" />
      </div>

      {/* Centered DEV badge — absolute so position is consistent across pages */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <DevBadge onDevLogin={onDevLogin} />
      </div>

      {/* Right: Theme toggle + Account */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Display mode toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          {modes.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => onDisplayModeChange(value)}
              className={`p-1.5 rounded transition-colors ${
                displayMode === value
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Account dropdown — hidden in desktop mode (no auth) */}
        {isDesktopMode ? (
          <button
            onClick={() => onOpenSettings?.()}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors ml-1"
            aria-label={t('settings.title')}
            title={t('settings.title')}
          >
            <UserIcon className="w-5 h-5" />
          </button>
        ) : (
        <div className="relative ml-1" ref={menuRef}>
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
            aria-label={t('settings.account')}
          >
            <UserIcon className="w-5 h-5" />
          </button>
          {showAccountMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
              {user ? (
                isDemoMode ? (
                  <>
                    <div className="px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-800">
                      <div className="font-medium text-gray-900 dark:text-gray-100">Demo Mode</div>
                      <div className="text-gray-500 dark:text-gray-400">Local notebooks only</div>
                    </div>
                    <button onClick={() => { setShowAccountMenu(false); onOpenSettings?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {t('settings.title')}
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                      <button onClick={() => { setShowAccountMenu(false); onCreateAccount?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 font-medium">
                        Create Account
                      </button>
                      <button onClick={() => { setShowAccountMenu(false); onExitDemo?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Exit Demo
                      </button>
                    </div>
                  </>
                ) : (
                <>
                  <div className="px-3 py-2 text-xs border-b border-gray-100 dark:border-gray-800">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{user.displayName}</div>
                    <div className="text-gray-500 dark:text-gray-400 truncate">{user.email}</div>
                  </div>
                  <button onClick={() => { setShowAccountMenu(false); onOpenAccount?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {t('settings.account')}
                  </button>
                  <button onClick={() => { setShowAccountMenu(false); onOpenSettings?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {t('settings.title')}
                  </button>
                  {user.isAdmin && (
                    <a href={import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174'} target="_blank" rel="noopener noreferrer" className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300">
                      Admin Site
                    </a>
                  )}
                  <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                    <button onClick={() => { setShowAccountMenu(false); onSignOut?.(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-red-600 dark:text-red-400">
                      {t('auth.signOut')}
                    </button>
                  </div>
                </>
                )
              ) : (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  Not signed in
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </header>
  );
}
