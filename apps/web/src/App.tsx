import { useState, useCallback, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import type { Tab } from './components/layout/DocumentPane';
import { StatusBar } from './components/layout/StatusBar';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { InputModal } from './components/common/InputModal';
import { SaveLocationPicker } from './components/common/SaveLocationPicker';
import { CookieConsentBanner } from './components/common/CookieConsentBanner';
import { SettingsModal } from './components/settings/SettingsModal';
import { AccountModal } from './components/account/AccountModal';
import { AddNotebookModal } from './components/notebook/AddNotebookModal';
import { OnboardingTwoFactor } from './components/welcome/OnboardingTwoFactor';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useNotebookManager } from './hooks/useNotebookManager';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useToast } from './hooks/useToast';
import { useCookieConsent } from './hooks/useCookieConsent';
import { useModalHistory } from './hooks/useModalHistory';
import { ToastContainer } from './components/common/ToastContainer';
import { useNavigate } from 'react-router-dom';

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();
  const auth = useAuth();
  const { addToast } = useToast();
  const nb = useNotebookManager(auth.user?.id, addToast);
  const { settings, updateSettings } = useSettings(auth.isSignedIn);
  const cookieConsent = useCookieConsent();
  const navigate = useNavigate();

  // Status bar state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAddNotebook, setShowAddNotebook] = useState(false);
  const [initialSource, setInitialSource] = useState<string | null>(null);
  const [showOnboarding2fa, setShowOnboarding2fa] = useState(false);

  // Integrate modals with browser history (back button closes them)
  const closeSettings = useModalHistory(showSettings, () => setShowSettings(false));
  const closeAccount = useModalHistory(showAccount, () => setShowAccount(false));
  const closeAddNotebook = useModalHistory(showAddNotebook, () => { setShowAddNotebook(false); setInitialSource(null); });

  // Detect OAuth error from URL before auth init can clear it
  const [oauthError, setOauthError] = useState<string | null>(() => {
    const path = window.location.pathname;
    if (path === '/app/auth-error') {
      const params = new URLSearchParams(window.location.search);
      const error = params.get('error');
      const provider = params.get('provider');
      // Will navigate after mount
      if (error === 'account_exists') {
        return `An account with this email already exists. Sign in with your email and password, then link ${provider ?? 'this provider'} from Account Settings.`;
      }
      if (error === 'provider_already_linked') {
        return `This ${provider ?? 'provider'} account is already linked to another Notebook.md account. Unlink it from the other account first, or use a different ${provider ?? 'provider'} account.`;
      }
      return `Authentication failed: ${error ?? 'Unknown error'}`;
    }
    return null;
  });

  // Clean up auth callback URLs
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/app/auth-error') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Show OAuth error as toast when user is already signed in (WelcomeScreen won't show)
  useEffect(() => {
    if (oauthError && auth.isSignedIn) {
      addToast(oauthError, 'error');
      setOauthError(null);
    }
  }, [oauthError, auth.isSignedIn, addToast]);

  // Handle magic link and email verification from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('token');
    const path = window.location.pathname;

    if (path === '/app/magic-link' && magicToken) {
      auth.verifyMagicLink(magicToken).then(() => {
        navigate('/', { replace: true });
      });
    } else if (path === '/app/verify-email' && magicToken) {
      const apiBase = import.meta.env.VITE_API_URL || '';
      fetch(`${apiBase}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: magicToken }),
      }).then(() => {
        navigate('/', { replace: true });
      });
    }

    // Clean up auth=success from OAuth callback
    if (params.has('auth')) {
      params.delete('auth');
      params.delete('new');
      const newUrl = params.toString() ? `/?${params.toString()}` : '/';
      navigate(newUrl, { replace: true });
    }

    // Auto-open Add Notebook modal if returning from provider linking
    if (params.has('source')) {
      const src = params.get('source');
      params.delete('source');
      params.delete('linked');
      setInitialSource(src);
      setShowAddNotebook(true);
      const newUrl = params.toString() ? `/?${params.toString()}` : '/';
      navigate(newUrl, { replace: true });
    }
  }, []);

  const handleWordCountChange = useCallback((words: number, chars: number) => {
    setWordCount(words);
    setCharCount(chars);
  }, []);

  // Map OpenTab[] to Tab[] for DocumentPane
  const docTabs: Tab[] = nb.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    hasUnsavedChanges: t.hasUnsavedChanges,
    content: t.content,
  }));

  const lastSaved = nb.activeTab?.lastSaved
    ? new Date(nb.activeTab.lastSaved).toLocaleTimeString()
    : null;

  // Drag-and-drop handler for markdown files
  const SUPPORTED_EXTS = new Set(['md', 'mdx', 'markdown', 'txt']);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Don't show import overlay for internal tree drags
    if (e.dataTransfer.types.includes('text/notebook-file') || e.dataTransfer.types.includes('text/notebook-tree-item')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      // Ignore internal tree drags
      if (e.dataTransfer.types.includes('text/notebook-tree-item')) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!e.dataTransfer.files?.length) return;
      for (const file of Array.from(e.dataTransfer.files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!SUPPORTED_EXTS.has(ext)) continue;
        const content = await file.text();
        nb.handleDropImport(file.name, content);
      }
    },
    [nb],
  );

  // Welcome screen when not signed in
  if (!auth.isSignedIn && !auth.loading) {
    const handleOAuth = (provider: string) => {
      window.location.href = `/auth/oauth/${provider}?returnTo=/`;
    };
    const handleSignUp = async (email: string, password: string, displayName: string, rememberMe: boolean) => {
      const ok = await auth.signUp(email, password, displayName, rememberMe);
      if (ok) setShowOnboarding2fa(true);
      return ok;
    };
    return (
      <div>
        <WelcomeScreen
          onSignIn={auth.signIn}
          onSignUp={handleSignUp}
          onMagicLink={auth.requestMagicLink}
          onOAuth={handleOAuth}
          error={oauthError ?? auth.error}
          onClearError={() => { setOauthError(null); auth.clearError(); }}
          twoFactorChallenge={auth.twoFactorChallenge}
          onVerify2fa={auth.verify2fa}
          onSend2faEmailCode={auth.send2faEmailCode}
          onCancel2fa={auth.cancel2fa}
        />
        {/* Dev shortcut to skip auth */}
        {process.env.NODE_ENV !== 'production' && (
          <button
            onClick={auth.devSkipAuth}
            className="fixed bottom-4 right-4 px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Skip to app (dev)
          </button>
        )}
        {cookieConsent.showBanner && (
          <CookieConsentBanner
            onAcceptAll={cookieConsent.acceptAll}
            onRejectAll={cookieConsent.rejectAll}
            onSaveCustom={cookieConsent.saveCustom}
          />
        )}
      </div>
    );
  }

  // Loading state
  if (auth.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Post-signup 2FA onboarding
  if (showOnboarding2fa && auth.isSignedIn) {
    return (
      <OnboardingTwoFactor
        onSetup={auth.setup2fa}
        onEnable={auth.enable2fa}
        onSkip={() => setShowOnboarding2fa(false)}
      />
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      data-print-margins={settings.margins}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar
        displayMode={mode}
        onDisplayModeChange={setMode}
        user={auth.user}
        onSignOut={auth.signOut}
        onOpenAccount={() => setShowAccount(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ToastContainer />
      <div className="flex-1 flex min-h-0">
        <NotebookPane
          width={sidebar.width}
          collapsed={sidebar.collapsed}
          onToggleCollapse={sidebar.toggleCollapse}
          onResizeMouseDown={sidebar.onMouseDown}
          notebooks={nb.notebooks}
          files={nb.files}
          loadingNotebooks={nb.loadingNotebooks}
          onCreateNotebook={() => setShowAddNotebook(true)}
          onDeleteNotebook={nb.handleDeleteNotebook}
          onRenameNotebook={nb.handleRenameNotebook}
          onCreateFile={nb.handleCreateFile}
          onImportFile={nb.handleImportFile}
          onDeleteFile={nb.handleDeleteFile}
          onRenameFile={nb.handleRenameFile}
          onOpenFile={nb.handleOpenFile}
          onExpandNotebook={(notebookId: string) => {
            // Lazy-load files for remote notebooks when expanded
            const notebook = nb.notebooks.find((n) => n.id === notebookId);
            if (notebook && notebook.sourceType !== 'local' && notebook.sourceType) {
              // Only fetch if we don't already have files for this notebook
              if (!nb.files[notebookId] || nb.files[notebookId].length === 0) {
                nb.refreshFiles(notebookId);
              }
            }
          }}
          onRefreshNotebook={(notebookId: string) => {
            nb.refreshFiles(notebookId);
          }}
          onMoveFile={nb.handleMoveFile}
          onCopyFile={nb.handleCopyFile}
          onReorderNotebooks={nb.handleReorderNotebooks}
          activeFilePath={nb.activeTabId}
        />
        <DocumentPane
          tabs={docTabs}
          activeTabId={nb.activeTabId}
          onTabSelect={nb.setActiveTabId}
          onTabClose={nb.handleTabClose}
          onContentChange={nb.handleContentChange}
          onWordCountChange={handleWordCountChange}
          showPublish={!!(nb.activeTab && nb.hasWorkingBranch(nb.activeTab.notebookId))}
          onPublish={() => nb.activeTab && nb.handlePublish(nb.activeTab.notebookId)}
          fontFamily={settings.fontFamily}
          fontSize={settings.fontSize}
          spellCheck={settings.spellCheck}
          margins={settings.margins}
          lineNumbers={settings.lineNumbers}
        />
      </div>
      <StatusBar
        wordCount={wordCount}
        charCount={charCount}
        lastSaved={lastSaved}
        message={nb.statusMessage}
      />

      {cookieConsent.showBanner && (
        <CookieConsentBanner
          onAcceptAll={cookieConsent.acceptAll}
          onRejectAll={cookieConsent.rejectAll}
          onSaveCustom={cookieConsent.saveCustom}
        />
      )}

      {/* Drag-and-drop overlay */}
      {dragOver && nb.notebooks.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-400 pointer-events-none">
          <div className="bg-white dark:bg-gray-900 px-6 py-4 rounded-lg shadow-lg text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop Markdown file to import</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.md, .mdx, .markdown, .txt</p>
          </div>
        </div>
      )}

      {/* Input modal for notebook/file creation */}
      {nb.modalRequest && (
        <InputModal
          title={nb.modalRequest.title}
          label={nb.modalRequest.label}
          placeholder={nb.modalRequest.placeholder}
          onSubmit={nb.modalRequest.onSubmit}
          onCancel={() => nb.setModalRequest(null)}
        />
      )}

      {/* Save location picker for imported files */}
      {nb.saveLocationRequest && (
        <SaveLocationPicker
          fileName={nb.saveLocationRequest.fileName}
          notebooks={nb.notebooks}
          files={nb.files}
          onSave={nb.saveLocationRequest.onSave}
          onCancel={() => nb.setSaveLocationRequest(null)}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          displayMode={mode}
          onDisplayModeChange={setMode}
          onClose={closeSettings}
        />
      )}

      {/* Account modal */}
      {showAccount && auth.user && (
        <AccountModal
          user={auth.user}
          onUpdateProfile={auth.updateProfile}
          onChangePassword={auth.changePassword}
          onDeleteAccount={auth.deleteAccount}
          onSignOut={auth.signOut}
          onProviderUnlinked={nb.handleProviderUnlinked}
          onClose={closeAccount}
          onSetup2fa={auth.setup2fa}
          onEnable2fa={auth.enable2fa}
          onDisable2fa={auth.disable2fa}
          onSendDisable2faCode={auth.sendDisable2faCode}
        />
      )}

      {/* Add Notebook modal */}
      {showAddNotebook && (
        <AddNotebookModal
          onAdd={(name, sourceType, sourceConfig) => {
            closeAddNotebook();
            nb.handleAddNotebook(name, sourceType, sourceConfig);
          }}
          onCancel={closeAddNotebook}
          userId={auth.user?.id}
          initialSource={initialSource}
        />
      )}
    </div>
  );
}
