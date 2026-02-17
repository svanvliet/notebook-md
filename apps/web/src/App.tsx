import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="h-full flex flex-col">
      <header className="h-12 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 shrink-0">
        <span className="font-semibold">{t('app.name')}</span>
      </header>
      <main className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">{t('app.tagline')}</p>
      </main>
    </div>
  );
}
