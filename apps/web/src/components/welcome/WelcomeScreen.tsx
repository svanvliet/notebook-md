import { useTranslation } from 'react-i18next';
import { NotebookIcon } from '../icons/Icons';

export function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
      <div className="flex flex-col items-center max-w-sm text-center px-6">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg">
          <NotebookIcon className="w-9 h-9 text-white" />
        </div>

        {/* App name */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('app.name')}
        </h1>

        {/* Tagline */}
        <p className="text-gray-500 dark:text-gray-400 mb-8">{t('app.tagline')}</p>

        {/* Auth buttons */}
        <div className="w-full space-y-3">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors text-sm">
            {t('auth.signIn')}
          </button>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium transition-colors text-sm">
            {t('auth.signUp')}
          </button>
        </div>

        {/* Provider buttons (non-functional for now) */}
        <div className="w-full mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">or continue with</p>
          <div className="flex justify-center gap-3">
            {['Microsoft', 'GitHub', 'Google'].map((provider) => (
              <button
                key={provider}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 transition-colors"
              >
                {provider}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
