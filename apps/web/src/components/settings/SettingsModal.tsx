import { useTranslation } from 'react-i18next';
import type { DisplayMode } from '@notebook-md/shared';
import type { AppSettings } from '../../hooks/useSettings';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (updates: Partial<AppSettings>) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onUpdate, displayMode, onDisplayModeChange, onClose }: SettingsModalProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('settings.title')}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Display Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('settings.displayMode')}</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as DisplayMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => onDisplayModeChange(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    displayMode === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t(`settings.${m}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Font Family</label>
            <div className="space-y-1">
              {([
                { value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", label: 'System Default' },
                { value: "'Inter', sans-serif", label: 'Inter' },
                { value: "'Georgia', serif", label: 'Georgia' },
                { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
                { value: "'Merriweather', serif", label: 'Merriweather' },
                { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onUpdate({ fontFamily: value })}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    settings.fontFamily === value
                      ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
                      : 'bg-gray-50 dark:bg-gray-800 border border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  style={{ fontFamily: value }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Font Size: {settings.fontSize}px</label>
            <input
              type="range"
              min={12}
              max={24}
              value={settings.fontSize}
              onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Margins */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Document Margins</label>
            <div className="flex gap-2">
              {(['narrow', 'regular', 'wide'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => onUpdate({ margins: m })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    settings.margins === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            {([
              { key: 'autoSave' as const, label: 'Auto-Save' },
              { key: 'spellCheck' as const, label: 'Spell Check' },
              { key: 'lineNumbers' as const, label: 'Line Numbers (source view)' },
              { key: 'showWordCount' as const, label: 'Show Word Count' },
            ]).map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                <button
                  onClick={() => onUpdate({ [key]: !settings[key] })}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    settings[key] ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    settings[key] ? 'translate-x-4' : ''
                  }`} />
                </button>
              </label>
            ))}
          </div>

          {/* Tab Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tab Size</label>
            <select
              value={settings.tabSize}
              onChange={e => onUpdate({ tabSize: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value={2}>2 spaces</option>
              <option value={4}>4 spaces</option>
              <option value={8}>8 spaces</option>
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
