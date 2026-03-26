import { useState, useCallback, useEffect, useRef } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import OutlinePane from './components/layout/OutlinePane';
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
import QuotaBanner from './components/layout/QuotaBanner';
import { OnboardingTwoFactor } from './components/welcome/OnboardingTwoFactor';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useOutlineResize } from './hooks/useOutlineResize';
import { useNotebookManager } from './hooks/useNotebookManager';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useToast } from './hooks/useToast';
import { useCookieConsent } from './hooks/useCookieConsent';
import { useModalHistory } from './hooks/useModalHistory';
import { ToastContainer } from './components/common/ToastContainer';
import { useAnalytics, AnalyticsEvents } from './hooks/useAnalytics';
import { useFlag } from './hooks/useFlagProvider';
import { useNavigate, useLocation } from 'react-router-dom';
import { migrateAnonymousNotebooks, setStorageScope } from './stores/localNotebookStore';
import { createDemoNotebook, DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH } from './stores/demoContent';
import { useDocumentRoute } from './hooks/useDocumentRoute';
import { useDocumentOutline } from './hooks/useDocumentOutline';
import type { Editor } from '@tiptap/react';
import { useNativeMenu, type MenuAction } from './hooks/useNativeMenu';
import { isTauriEnvironment } from './stores/storageAdapterFactory';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function App() {
  const isDesktop = isTauriEnvironment();
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();
  const outline = useOutlineResize();
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const { headings } = useDocumentOutline(activeEditor);
  const auth = useAuth();
  const { addToast } = useToast();
  const nb = useNotebookManager(auth.user?.id, addToast, auth.isDemoMode);
  const { settings, updateSettings } = useSettings(auth.isSignedIn && !auth.isDemoMode);
  const cookieConsent = useCookieConsent();
  const { track } = useAnalytics(cookieConsent.analyticsAllowed, auth.user?.id);
  const collabEnabled = useFlag('cloud_collab');
  const navigate = useNavigate();
  const location = useLocation();

  // URL-based navigation state
  const docRoute = useDocumentRoute({
    notebooks: nb.notebooks,
    activeTabId: nb.activeTabId,
    isDemoMode: auth.isDemoMode,
    isSignedIn: auth.isSignedIn,
    handleOpenFile: nb.handleOpenFile,
    expandToFile: nb.expandToFile,
  });

  // Wire navigateToFile into notebook manager for link clicks
  useEffect(() => {
    nb.setNavigateToFile(docRoute.navigateToFile);
    return () => nb.setNavigateToFile(null);
  }, [nb.setNavigateToFile, docRoute.navigateToFile]);

  // Handle app URL link clicks from the editor (e.g. /app/Notebook/file.md)
  useEffect(() => {
    const handler = (e: Event) => {
      const { href } = (e as CustomEvent<{ href: string }>).detail;
      navigate(href);
    };
    window.addEventListener('app-link-click', handler);
    return () => window.removeEventListener('app-link-click', handler);
  }, [navigate]);

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

  // Mobile notebook pane drawer
  const [mobilePaneOpen, setMobilePaneOpen] = useState(false);

  // Track pending demo initialization (state so it triggers a re-render)
  const [demoInitPending, setDemoInitPending] = useState(false);
  // Guard: prevent auto-enter effect from re-entering demo after intentional exit
  const demoExitingRef = useRef(false);

  // Helper: open a standalone file (outside any notebook) in the editor
  const openStandaloneFile = useCallback(async (filePath: string) => {
    if (!isTauriEnvironment()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const file = await invoke<{ path: string; name: string; content: string; updatedAt: number }>('read_standalone_file', { path: filePath });
      const { isMarkdownContent, markdownToHtml } = await import('./components/editor/markdownConverter');
      let content = file.content;
      if (isMarkdownContent(content)) {
        content = markdownToHtml(content);
      }
      nb.openStandaloneTab(file.path, file.name, content, file.updatedAt);
    } catch (err) {
      addToast(`Failed to open file: ${err}`, 'error');
    }
  }, [nb, addToast]);

  // Helper: validate a folder path isn't too broad (home dir, root, etc.)
  const isLargeDirectory = (path: string) => {
    const home = typeof window !== 'undefined' ? (window as unknown as Record<string, string>).__HOME__ : '';
    const normalized = path.replace(/\/+$/, '');
    const blocked = ['/', '/Users', '/home', '/var', '/tmp', '/System', '/Library', 'C:\\', 'C:\\Users'];
    if (blocked.includes(normalized)) return true;
    if (home && normalized === home.replace(/\/+$/, '')) return true;
    return false;
  };

  // Listen for file-open events (file associations: double-click .md in Finder)
  useEffect(() => {
    if (!isDesktop) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlistenFn = await listen<string>('file-open', (event) => {
          openStandaloneFile(event.payload);
        });
        unlisten = unlistenFn;
      } catch (err) {
        console.error('[file-open] Failed to listen:', err);
      }
    })();
    return () => { unlisten?.(); };
  }, [isDesktop, openStandaloneFile]);

  // Native menu bar actions (desktop only — no-op in browser)
  useNativeMenu({
    onMenuAction: useCallback((action: MenuAction) => {
      switch (action) {
        case 'new_notebook':
          setShowAddNotebook(true);
          break;
        case 'new_file':
          if (nb.activeNotebook) nb.handleCreateFile(nb.activeNotebook.id, '', 'file');
          break;
        case 'open_file':
          if (isTauriEnvironment()) {
            (async () => {
              try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const selected = await open({
                  title: 'Open Markdown File',
                  filters: [{ name: 'Markdown', extensions: ['md', 'mdx', 'markdown', 'txt'] }],
                });
                if (selected) {
                  openStandaloneFile(selected as string);
                }
              } catch (err) {
                addToast(`Failed to open file: ${err}`, 'error');
              }
            })();
          }
          break;
        case 'open_folder':
          if (isTauriEnvironment()) {
            (async () => {
              try {
                const { open } = await import('@tauri-apps/plugin-dialog');
                const selected = await open({ directory: true, title: 'Open Notebook Folder' });
                if (selected) {
                  if (isLargeDirectory(selected as string)) {
                    addToast('This folder is too broad. Choose a specific project or notes folder instead.', 'error');
                    return;
                  }
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('open_folder_as_notebook', { path: selected });
                  nb.reloadNotebooks();
                  addToast('Opened folder as notebook', 'success');
                }
              } catch (err) {
                addToast(`Failed to open folder: ${err}`, 'error');
              }
            })();
          }
          break;
        case 'save':
          // Cmd+S is already handled by useAutoSave keydown listener
          break;
        case 'close_tab':
          if (nb.activeTabId) nb.handleTabClose(nb.activeTabId);
          break;
        case 'toggle_sidebar':
          sidebar.toggleCollapse();
          break;
        case 'toggle_dark':
          setMode(mode === 'dark' ? 'light' : mode === 'light' ? 'dark' : 'dark');
          break;
        case 'about':
          addToast('Notebook.md v0.1.0 — A beautiful Markdown notebook', 'info');
          break;
        case 'docs':
          window.open('https://www.notebookmd.io/features', '_blank');
          break;
        default:
          break;
      }
    }, [nb.activeNotebook, nb.activeTabId, nb.handleCreateFile, nb.handleTabClose, nb.reloadNotebooks, sidebar, mode, setMode, addToast, openStandaloneFile, isLargeDirectory]),
  });

  // Enter demo mode via /demo route or "Try Demo" button
  const handleEnterDemo = useCallback(async () => {
    auth.enterDemoMode();
    // Set storage scope early so createDemoNotebook writes to the correct IndexedDB
    setStorageScope('demo-user');
    await createDemoNotebook();
    setDemoInitPending(true);
  }, [auth]);

  const handleExitDemo = useCallback(() => {
    demoExitingRef.current = true;
    auth.exitDemoMode();
    navigate('/', { replace: true });
  }, [auth, navigate]);

  // Auto-enter demo mode when navigating to /demo
  useEffect(() => {
    if (demoExitingRef.current) {
      // Clear the guard once the URL has updated away from /demo
      if (!location.pathname.startsWith('/demo')) {
        demoExitingRef.current = false;
      }
      return;
    }
    if (location.pathname.startsWith('/demo') && !auth.isDemoMode && !auth.isSignedIn && !auth.loading) {
      handleEnterDemo();
    }
  }, [location.pathname, auth.isDemoMode, auth.isSignedIn, auth.loading, handleEnterDemo]);

  // Complete demo init after re-render provides a fresh nb with correct userId
  useEffect(() => {
    if (!demoInitPending || !auth.isDemoMode) return;
    setDemoInitPending(false);
    nb.reloadNotebooks().then(() => {
      // Check current URL for a specific file path — if present, open it directly.
      // Otherwise, open Getting Started by default.
      const path = window.location.pathname;
      const hasFilePath = path.startsWith('/demo/') && path.split('/').length > 3;
      if (hasFilePath) {
        // Parse the URL and open the deep-linked file
        const parts = path.split('/');
        const filePath = parts.slice(3).join('/');
        // Use DEMO_NOTEBOOK_ID directly — the demo notebook always has a known ID
        nb.handleOpenFile(DEMO_NOTEBOOK_ID, filePath);
        nb.expandToFile(DEMO_NOTEBOOK_ID, filePath);
      } else {
        nb.handleOpenFile(DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH);
        nb.expandToFile(DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH);
      }
      docRoute.completeInitialLoad();
    });
  }, [auth.isDemoMode, demoInitPending, nb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle navigation state from content pages (signIn, enterDemo)
  useEffect(() => {
    if (location.state?.enterDemo && !auth.isDemoMode && !auth.isSignedIn) {
      handleEnterDemo();
      navigate('/demo', { replace: true, state: {} });
    }
    if (location.state?.signIn && !auth.isSignedIn) {
      setWelcomeView('signin');
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state?.enterDemo, location.state?.signIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore previously open tabs after notebooks finish loading.
  // This is the SOLE initial tab opener — URL→State is blocked until this completes.
  useEffect(() => {
    if ((!isDesktop && !auth.isSignedIn) || nb.notebooks.length === 0 || nb.tabs.length > 0) return;
    // Skip if demo init is in progress (it handles its own file opening)
    if (demoInitPending) return;

    if (auth.isDemoMode) {
      // Demo refresh: demo mode was restored from sessionStorage (not fresh enter).
      const urlFile = (docRoute.urlNotebookName && docRoute.urlFilePath)
        ? (() => {
            const notebook = nb.notebooks.find((n) => n.name === docRoute.urlNotebookName);
            return notebook ? { notebookId: notebook.id, path: docRoute.urlFilePath! } : null;
          })()
        : null;
      const hadPersistedTabs = (() => {
        try { const raw = sessionStorage.getItem('nb:tabs'); return raw && JSON.parse(raw).length > 0; }
        catch { return false; }
      })();
      nb.restoreTabs(urlFile).then(() => {
        if (!hadPersistedTabs && !urlFile) {
          const demoNb = nb.notebooks.find((n) => n.id === DEMO_NOTEBOOK_ID);
          if (demoNb) {
            nb.handleOpenFile(DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH);
            nb.expandToFile(DEMO_NOTEBOOK_ID, GETTING_STARTED_PATH);
          }
        }
        if (urlFile) {
          nb.expandToFile(urlFile.notebookId, urlFile.path);
        }
        docRoute.completeInitialLoad();
      });
    } else {
      // Normal signed-in user: restore persisted tabs + URL file
      let urlFile: { notebookId: string; path: string } | null = null;
      if (docRoute.urlNotebookName && docRoute.urlFilePath) {
        const notebook = nb.notebooks.find((n) => n.name === docRoute.urlNotebookName);
        if (notebook) {
          urlFile = { notebookId: notebook.id, path: docRoute.urlFilePath };
        }
      }
      nb.restoreTabs(urlFile).then(() => {
        if (urlFile) {
          nb.expandToFile(urlFile.notebookId, urlFile.path);
        }
        docRoute.completeInitialLoad();
      });
    }
  }, [isDesktop, auth.isSignedIn, auth.isDemoMode, nb.notebooks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear welcomeView after it's been consumed (one-shot)
  useEffect(() => {
    if (welcomeView && !auth.isSignedIn) {
      const timer = setTimeout(() => setWelcomeView(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [welcomeView, auth.isSignedIn]);

  // Redirect to stored deep link URL after successful login
  useEffect(() => {
    if (auth.isSignedIn && !auth.loading) {
      const returnTo = sessionStorage.getItem('nb:returnTo');
      if (returnTo) {
        sessionStorage.removeItem('nb:returnTo');
        navigate(returnTo, { replace: true });
      }
    }
  }, [auth.isSignedIn, auth.loading, navigate]);

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
    } else if (path === '/app/invite' && magicToken) {
      // Share invite acceptance — requires auth
      if (auth.isSignedIn) {
        fetch(`${API_BASE}/api/cloud/invites/${encodeURIComponent(magicToken)}/accept`, {
          method: 'POST',
          credentials: 'include',
        }).then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            addToast('Invite accepted! The shared notebook is now in your sidebar.', 'success');
            nb.reloadNotebooks();
            navigate('/', { replace: true });
          } else {
            const data = await res.json().catch(() => ({}));
            addToast(data.error ?? 'Failed to accept invite', 'error');
            navigate('/', { replace: true });
          }
        });
      } else {
        // Store invite token and show login — will re-run after auth
        sessionStorage.setItem('pendingInviteToken', magicToken);
      }
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

  // Accept pending invite after sign-in
  useEffect(() => {
    if (!auth.isSignedIn) return;
    const pendingToken = sessionStorage.getItem('pendingInviteToken');
    if (!pendingToken) return;
    sessionStorage.removeItem('pendingInviteToken');
    fetch(`${API_BASE}/api/cloud/invites/${encodeURIComponent(pendingToken)}/accept`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (res.ok) {
        addToast('Invite accepted! The shared notebook is now in your sidebar.', 'success');
        nb.reloadNotebooks();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error ?? 'Failed to accept invite', 'error');
      }
      navigate('/', { replace: true });
    });
  }, [auth.isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWordCountChange = useCallback((words: number, chars: number) => {
    setWordCount(words);
    setCharCount(chars);
  }, []);

  // Map OpenTab[] to Tab[] for DocumentPane
  const docTabs: Tab[] = nb.tabs.map((t) => {
    const notebook = nb.notebooks.find((n) => n.id === t.notebookId);
    return {
      id: t.id,
      name: t.name,
      hasUnsavedChanges: t.hasUnsavedChanges,
      content: t.content,
      loading: t.loading,
      readOnly: nb.pendingPrs.has(t.notebookId) || notebook?.sharedPermission === 'viewer' || (!collabEnabled && notebook?.sharedPermission && notebook.sharedPermission !== 'owner'),
      cloudDoc: notebook?.sourceType === 'cloud' ? { notebookId: t.notebookId, path: t.path } : undefined,
    };
  });

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

  // Welcome screen when not signed in (skip for desktop — no auth required)
  if (!isDesktop && !auth.isSignedIn && !auth.loading) {
    // Store deep link URL for post-login redirect
    if (location.pathname.startsWith('/app/') && !location.pathname.startsWith('/app/magic-link') && !location.pathname.startsWith('/app/verify-email') && !location.pathname.startsWith('/app/auth-error')) {
      sessionStorage.setItem('nb:returnTo', location.pathname);
    }
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

  // Loading state (desktop skips auth, so never blocks on auth.loading)
  if (!isDesktop && auth.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Post-signup 2FA onboarding (not applicable on desktop)
  if (!isDesktop && showOnboarding2fa && auth.isSignedIn) {
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
        user={isDesktop ? undefined : auth.user}
        isDemoMode={!isDesktop && auth.isDemoMode}
        isDesktopMode={isDesktop}
        onSignOut={auth.signOut}
        onExitDemo={() => { setWelcomeView(undefined); handleExitDemo(); }}
        onCreateAccount={() => { setWelcomeView('signup'); handleExitDemo(); }}
        onOpenAccount={() => setShowAccount(true)}
        onOpenSettings={() => setShowSettings(true)}
        onDevLogin={auth.devSkipAuth}
        onToggleMobilePane={() => setMobilePaneOpen(v => !v)}
      />
      {!isDesktop && auth.isDemoMode && <DemoBanner onCreateAccount={() => { setWelcomeView('signup'); handleExitDemo(); }} />}
      {!isDesktop && auth.user && <QuotaBanner />}
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
          pendingPrs={nb.pendingPrs}
          onCreateNotebook={() => setShowAddNotebook(true)}
          onDeleteNotebook={nb.handleDeleteNotebook}
          onRenameNotebook={nb.handleRenameNotebook}
          onCreateFile={nb.handleCreateFile}
          onImportFile={nb.handleImportFile}
          onDeleteFile={nb.handleDeleteFile}
          onRenameFile={nb.handleRenameFile}
          onOpenFile={docRoute.navigateToFile}
          onExpandNotebook={(notebookId: string) => {
            // Lazy-load files for remote notebooks when expanded
            const notebook = nb.notebooks.find((n) => n.id === notebookId);
            if (notebook && notebook.sourceType !== 'local' && notebook.sourceType && !notebook.pendingInvite) {
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
          mobileOpen={mobilePaneOpen}
          onMobileClose={() => setMobilePaneOpen(false)}
          onLeaveNotebook={async (notebookId: string) => {
            try {
              const API_BASE = import.meta.env.VITE_API_URL || '';
              const res = await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/leave`, {
                method: 'POST',
                credentials: 'include',
              });
              if (res.ok) {
                addToast('Left shared notebook', 'success');
                nb.reloadNotebooks();
              } else {
                addToast('Failed to leave notebook', 'error');
              }
            } catch {
              addToast('Failed to leave notebook', 'error');
            }
          }}
          onAcceptInvite={async (shareId: string) => {
            const API_BASE = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${API_BASE}/api/cloud/invites/accept-by-id`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ shareId }),
            });
            if (res.ok) {
              addToast('Invitation accepted!', 'success');
              await nb.syncNotebooksFromServer();
            } else {
              const data = await res.json().catch(() => ({}));
              addToast(data.error || 'Failed to accept invitation', 'error');
            }
          }}
          onDeclineInvite={async (shareId: string) => {
            const API_BASE = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${API_BASE}/api/cloud/invites/decline-by-id`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ shareId }),
            });
            if (res.ok) {
              addToast('Invitation declined', 'info');
              await nb.syncNotebooksFromServer();
            } else {
              const data = await res.json().catch(() => ({}));
              addToast(data.error || 'Failed to decline invitation', 'error');
            }
          }}
          onOpenFolder={isDesktop ? async () => {
            try {
              const { open } = await import('@tauri-apps/plugin-dialog');
              const selected = await open({ directory: true, title: 'Open Notebook Folder' });
              if (selected) {
                if (isLargeDirectory(selected as string)) {
                  addToast('This folder is too broad. Choose a specific project or notes folder instead.', 'error');
                  return;
                }
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('open_folder_as_notebook', { path: selected });
                nb.reloadNotebooks();
                addToast('Opened folder as notebook', 'success');
              }
            } catch (err) {
              addToast(`Failed to open folder: ${err}`, 'error');
            }
          } : undefined}
        />
        <OutlinePane
          headings={headings}
          editor={activeEditor}
          width={outline.width}
          collapsed={outline.collapsed}
          onToggleCollapse={outline.toggleCollapse}
          onResizeMouseDown={outline.onMouseDown}
          hasActiveDocument={!!nb.activeTabId}
        />
        <DocumentPane
          tabs={docTabs}
          activeTabId={nb.activeTabId}
          onTabSelect={nb.setActiveTabId}
          onTabClose={(tabId: string) => {
            docRoute.markReplaceNext(); // URL update should replace, not push
            nb.handleTabClose(tabId);
          }}
          onContentChange={nb.handleContentChange}
          onWordCountChange={handleWordCountChange}
          onEditorReady={(editor) => setActiveEditor(editor as Editor | null)}
          showPublish={!!(nb.activeTab && nb.hasWorkingBranch(nb.activeTab.notebookId))}
          pendingPr={nb.activeTab ? nb.pendingPrs.get(nb.activeTab.notebookId) ?? null : null}
          onPublish={() => nb.activeTab && setShowPublishModal(true)}
          onDiscard={() => nb.activeTab && setShowDiscardModal(true)}
          fontFamily={settings.fontFamily}
          fontSize={settings.fontSize}
          spellCheck={settings.spellCheck}
          margins={settings.margins}
          lineNumbers={settings.lineNumbers}
          currentUser={auth.user ? { name: auth.user.displayName } : undefined}
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
          onFolderOpened={() => {
            closeAddNotebook();
            nb.reloadNotebooks();
            addToast('Opened folder as notebook', 'success');
          }}
          userId={auth.user?.id}
          initialSource={initialSource}
          isDemoMode={auth.isDemoMode}
          isDesktopMode={isDesktop}
          onDemoSignUp={() => { closeAddNotebook(); setWelcomeView('signup'); handleExitDemo(); }}
          existingNames={nb.notebooks.map((n) => n.name)}
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
            onPublish={async (targetBranch, deleteBranch, commitMessage, autoMerge) => {
              const result = await nb.handlePublish(nb.activeTab!.notebookId, targetBranch, deleteBranch, commitMessage, autoMerge);
              return result;
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
