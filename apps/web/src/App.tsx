import { useState, useCallback, useEffect, useRef } from 'react';
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
import { PublishModal } from './components/notebook/PublishModal';
import { DiscardModal } from './components/notebook/DiscardModal';
import { DemoBanner } from './components/common/DemoBanner';
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
import { useAnalytics, AnalyticsEvents } from './hooks/useAnalytics';
import { useNavigate, useLocation } from 'react-router-dom';
import { migrateAnonymousNotebooks } from './stores/localNotebookStore';
import { createDemoNotebook, DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH } from './stores/demoContent';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();
  const auth = useAuth();
  const { addToast } = useToast();
  const nb = useNotebookManager(auth.user?.id, addToast);
  const { settings, updateSettings } = useSettings(auth.isSignedIn);
  const cookieConsent = useCookieConsent();
  const { track } = useAnalytics(cookieConsent.analyticsAllowed, auth.user?.id);
  const navigate = useNavigate();
  const location = useLocation();

  // Status bar state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAddNotebook, setShowAddNotebook] = useState(false);
  const [initialSource, setInitialSource] = useState<string | null>(null);
  const [showOnboarding2fa, setShowOnboarding2fa] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [welcomeView, setWelcomeView] = useState<'main' | 'signin' | 'signup' | undefined>(undefined);

  // Enter demo mode: create demo notebook, reload tree, auto-open Getting Started
  const handleEnterDemo = useCallback(async () => {
    auth.enterDemoMode();
    await createDemoNotebook();
    await nb.reloadNotebooks();
    // Small delay to let state settle before opening the file
    setTimeout(() => nb.handleOpenFile(DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH), 100);
  }, [auth, nb]);

  // Handle navigation state from content pages (signIn, enterDemo)
  useEffect(() => {
    if (location.state?.enterDemo && !auth.isDemoMode && !auth.isSignedIn) {
      handleEnterDemo();
      navigate('/', { replace: true, state: {} });
    }
    if (location.state?.signIn && !auth.isSignedIn) {
      setWelcomeView('signin');
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state?.enterDemo, location.state?.signIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear welcomeView after it's been consumed (one-shot)
  useEffect(() => {
    if (welcomeView && !auth.isSignedIn) {
      const timer = setTimeout(() => setWelcomeView(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [welcomeView, auth.isSignedIn]);

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
      fetch(`${API_BASE}/auth/verify-email`, {
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
      params.delete('github_installed');
      params.delete('account');
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
  const dragCountRef = useRef(0);

  // Always reset drag state when any drop happens (even if handled by a child)
  useEffect(() => {
    const resetDrag = () => {
      dragCountRef.current = 0;
      setDragOver(false);
    };
    window.addEventListener('drop', resetDrag, true);
    return () => window.removeEventListener('drop', resetDrag, true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/notebook-file') || e.dataTransfer.types.includes('text/notebook-tree-item')) {
      return;
    }
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/notebook-file') || e.dataTransfer.types.includes('text/notebook-tree-item')) {
      return;
    }
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      dragCountRef.current = 0;
      setDragOver(false);
      // Ignore internal tree drags
      if (e.dataTransfer.types.includes('text/notebook-tree-item')) return;
      e.preventDefault();
      e.stopPropagation();
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
      window.location.href = `${API_BASE}/auth/oauth/${provider}?returnTo=/`;
    };
    const handleSignUp = async (email: string, password: string, displayName: string, rememberMe: boolean) => {
      const wasDemoMode = auth.isDemoMode;
      const ok = await auth.signUp(email, password, displayName, rememberMe);
      if (ok) {
        // Migrate demo notebooks to the new user's account
        if (wasDemoMode) {
          try {
            const count = await migrateAnonymousNotebooks(auth.user!.id);
            if (count > 0) nb.reloadNotebooks();
          } catch { /* migration is best-effort */ }
        }
        track(AnalyticsEvents.SIGN_UP, { method: 'email' });
        setShowOnboarding2fa(true);
      }
      return ok;
    };
    return (
      <div>
        <WelcomeScreen
          onSignIn={auth.signIn}
          onSignUp={handleSignUp}
          onMagicLink={auth.requestMagicLink}
          onOAuth={handleOAuth}
          onEnterDemo={handleEnterDemo}
          onDevLogin={auth.devSkipAuth}
          initialView={welcomeView}
          error={oauthError ?? auth.error}
          onClearError={() => { setOauthError(null); auth.clearError(); }}
          twoFactorChallenge={auth.twoFactorChallenge}
          onVerify2fa={auth.verify2fa}
          onSend2faEmailCode={auth.send2faEmailCode}
          onCancel2fa={auth.cancel2fa}
        />
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
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar
        displayMode={mode}
        onDisplayModeChange={setMode}
        user={auth.user}
        isDemoMode={auth.isDemoMode}
        onSignOut={auth.signOut}
        onExitDemo={() => { setWelcomeView(undefined); auth.exitDemoMode(); }}
        onCreateAccount={() => { setWelcomeView('signup'); auth.exitDemoMode(); }}
        onOpenAccount={() => setShowAccount(true)}
        onOpenSettings={() => setShowSettings(true)}
        onDevLogin={auth.devSkipAuth}
      />
      {auth.isDemoMode && <DemoBanner onCreateAccount={() => { setWelcomeView('signup'); auth.exitDemoMode(); }} />}
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
          onDropImport={nb.handleDirectImport}
          expandToPath={nb.pendingExpandPath}
          onExpandToPathHandled={nb.clearPendingExpandPath}
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
          onPublish={() => nb.activeTab && setShowPublishModal(true)}
          onDiscard={() => nb.activeTab && setShowDiscardModal(true)}
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
            track(AnalyticsEvents.NOTEBOOK_CREATED, { sourceType });
          }}
          onCancel={closeAddNotebook}
          userId={auth.user?.id}
          initialSource={initialSource}
          isDemoMode={auth.isDemoMode}
          onDemoSignUp={() => { closeAddNotebook(); setWelcomeView('signup'); auth.exitDemoMode(); }}
        />
      )}

      {/* Publish modal */}
      {showPublishModal && nb.activeTab && (() => {
        const info = nb.getWorkingBranchInfo(nb.activeTab.notebookId);
        if (!info) return null;
        return (
          <PublishModal
            workingBranch={info.branch}
            defaultBranch={info.defaultBranch}
            owner={info.owner}
            repo={info.repo}
            onPublish={(targetBranch, deleteBranch) => {
              setShowPublishModal(false);
              nb.handlePublish(nb.activeTab!.notebookId, targetBranch, deleteBranch);
            }}
            onCancel={() => setShowPublishModal(false)}
          />
        );
      })()}

      {/* Discard modal */}
      {showDiscardModal && nb.activeTab && (() => {
        const info = nb.getWorkingBranchInfo(nb.activeTab.notebookId);
        if (!info) return null;
        return (
          <DiscardModal
            workingBranch={info.branch}
            repoFullName={`${info.owner}/${info.repo}`}
            onDiscard={() => {
              setShowDiscardModal(false);
              nb.handleDiscard(nb.activeTab!.notebookId);
            }}
            onCancel={() => setShowDiscardModal(false)}
          />
        );
      })()}
    </div>
  );
}
