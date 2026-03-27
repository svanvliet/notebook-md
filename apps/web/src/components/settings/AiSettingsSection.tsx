import { useState, useEffect, useCallback } from 'react';

interface AiSettingsData {
  providerType: string;
  aiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  apiVersion: string;
  braveSearchApiKey: string;
  // Per-provider saved values (preserved when switching)
  azureEndpoint: string;
  azureModel: string;
  openaiEndpoint: string;
  openaiModel: string;
}

const DEFAULTS: AiSettingsData = {
  providerType: 'azure',
  aiEndpoint: 'https://eastus.api.cognitive.microsoft.com/',
  aiApiKey: '',
  aiModel: '',
  apiVersion: '2024-12-01-preview',
  braveSearchApiKey: '',
  azureEndpoint: 'https://eastus.api.cognitive.microsoft.com/',
  azureModel: '',
  openaiEndpoint: 'https://api.openai.com/v1',
  openaiModel: '',
};

export function AiSettingsSection() {
  const [settings, setSettings] = useState<AiSettingsData>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const data = await invoke<AiSettingsData>('get_ai_settings');
        setSettings({ ...DEFAULTS, ...data });
      } catch {
        // Use defaults if loading fails
      }
      setLoaded(true);
    })();
  }, []);

  const saveSettings = useCallback(async (updated: AiSettingsData) => {
    setSaving(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_ai_settings', { settings: updated });
    } catch {
      // best effort
    }
    setSaving(false);
  }, []);

  const handleChange = useCallback(
    (field: keyof AiSettingsData, value: string) => {
      const isAzure = settings.providerType === 'azure';
      const updated = { ...settings, [field]: value };

      // Keep per-provider fields in sync with the active fields
      if (field === 'aiEndpoint') {
        if (isAzure) updated.azureEndpoint = value;
        else updated.openaiEndpoint = value;
      }
      if (field === 'aiModel') {
        if (isAzure) updated.azureModel = value;
        else updated.openaiModel = value;
      }

      setSettings(updated);
      if (testStatus !== 'idle') setTestStatus('idle');
    },
    [settings, testStatus],
  );

  // Save on blur (not on every keystroke)
  const handleBlur = useCallback(() => {
    saveSettings(settings);
  }, [settings, saveSettings]);

  const handleTestConnection = useCallback(async () => {
    await saveSettings(settings);
    setTestStatus('testing');
    setTestMessage('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string>('test_ai_connection');
      setTestStatus('success');
      setTestMessage(result);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.toString());
    }
  }, [settings, saveSettings]);

  const handleProviderSwitch = useCallback(
    (newProvider: string) => {
      const isAzure = settings.providerType === 'azure';

      // Save current values to per-provider fields before switching
      const saved = { ...settings };
      if (isAzure) {
        saved.azureEndpoint = settings.aiEndpoint;
        saved.azureModel = settings.aiModel;
      } else {
        saved.openaiEndpoint = settings.aiEndpoint;
        saved.openaiModel = settings.aiModel;
      }

      // Restore saved values for the target provider
      const updated: AiSettingsData = {
        ...saved,
        providerType: newProvider,
        aiEndpoint: newProvider === 'azure' ? saved.azureEndpoint : saved.openaiEndpoint,
        aiModel: newProvider === 'azure' ? saved.azureModel : saved.openaiModel,
        apiVersion: newProvider === 'azure' ? (saved.apiVersion || '2024-12-01-preview') : saved.apiVersion,
      };

      setSettings(updated);
      saveSettings(updated);
      if (testStatus !== 'idle') setTestStatus('idle');
    },
    [settings, saveSettings, testStatus],
  );

  if (!loaded) return null;

  const isAzure = settings.providerType === 'azure';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Configuration</span>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Configure your own API key to enable AI content generation. Your key is stored locally on this device.
      </p>

      {/* Provider Type */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
        <div className="flex gap-2">
          {[
            { value: 'azure', label: 'Azure OpenAI' },
            { value: 'openai', label: 'OpenAI-compatible' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleProviderSwitch(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                settings.providerType === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Endpoint */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Endpoint</label>
        <input
          type="text"
          value={settings.aiEndpoint}
          onChange={(e) => handleChange('aiEndpoint', e.target.value)}
          onBlur={handleBlur}
          placeholder={isAzure ? 'https://eastus.api.cognitive.microsoft.com/' : 'https://api.openai.com/v1'}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Key</label>
        <input
          type="password"
          value={settings.aiApiKey}
          onChange={(e) => handleChange('aiApiKey', e.target.value)}
          onBlur={handleBlur}
          placeholder="Enter your API key"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Model / Deployment */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          {isAzure ? 'Deployment Name' : 'Model'}
        </label>
        <input
          type="text"
          value={settings.aiModel}
          onChange={(e) => handleChange('aiModel', e.target.value)}
          onBlur={handleBlur}
          placeholder={isAzure ? 'my-gpt4-deployment' : 'gpt-4o-mini'}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isAzure && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            The deployment name from your Azure AI resource (not the model name)
          </p>
        )}
      </div>

      {/* API Version (Azure only) */}
      {isAzure && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Version</label>
          <input
            type="text"
            value={settings.apiVersion}
            onChange={(e) => handleChange('apiVersion', e.target.value)}
            onBlur={handleBlur}
            placeholder="2024-12-01-preview"
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Test Connection */}
      <div>
        <button
          onClick={handleTestConnection}
          disabled={!settings.aiApiKey || !settings.aiEndpoint || testStatus === 'testing'}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        {testStatus === 'success' && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{testMessage}</p>
        )}
        {testStatus === 'error' && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">{testMessage}</p>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Web Search (optional)</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Add a Brave Search API key to enable web search grounding for AI-generated content.
        </p>
        <input
          type="password"
          value={settings.braveSearchApiKey}
          onChange={(e) => handleChange('braveSearchApiKey', e.target.value)}
          onBlur={handleBlur}
          placeholder="Brave Search API key"
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          Get a free key at brave.com/search/api (2,000 queries/month)
        </p>
      </div>

      {saving && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Saving...</p>
      )}
    </div>
  );
}
