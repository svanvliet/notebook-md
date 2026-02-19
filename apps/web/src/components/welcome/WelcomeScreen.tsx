import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { NotebookIcon } from '../icons/Icons';

interface WelcomeScreenProps {
  onSignIn: (email: string, password: string, rememberMe: boolean) => Promise<boolean>;
  onSignUp: (email: string, password: string, displayName: string, rememberMe: boolean) => Promise<boolean>;
  onMagicLink: (email: string) => Promise<boolean>;
  onOAuth: (provider: string) => void;
  error: string | null;
  onClearError: () => void;
  // 2FA
  twoFactorChallenge: { challengeToken: string; method: 'totp' | 'email' } | null;
  onVerify2fa: (code: string, method?: 'totp' | 'email' | 'recovery') => Promise<boolean>;
  onSend2faEmailCode: () => Promise<boolean>;
  onCancel2fa: () => void;
}

type View = 'main' | 'signin' | 'signup' | 'magic-link-sent';

export function WelcomeScreen({ onSignIn, onSignUp, onMagicLink, onOAuth, error, onClearError, twoFactorChallenge, onVerify2fa, onSend2faEmailCode, onCancel2fa }: WelcomeScreenProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [view, setView] = useState<View>(error ? 'signin' : 'main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaMode, setTwoFaMode] = useState<'totp' | 'email' | 'recovery'>('totp');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const emailAutoSentRef = useRef(false);

  // When 2FA challenge arrives, set mode to match the user's configured method
  // and auto-send email code if method is email
  useEffect(() => {
    if (twoFactorChallenge) {
      setTwoFaMode(twoFactorChallenge.method);
      setTwoFaCode('');
      if (twoFactorChallenge.method === 'email' && !emailAutoSentRef.current) {
        emailAutoSentRef.current = true;
        onSend2faEmailCode().then((ok) => { if (ok) setEmailCodeSent(true); });
      }
    } else {
      emailAutoSentRef.current = false;
      setEmailCodeSent(false);
    }
  }, [twoFactorChallenge, onSend2faEmailCode]);

  const switchView = (v: View) => {
    setView(v);
    setPassword('');
    onClearError();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onClearError();
    const ok = await onSignIn(email, password, rememberMe);
    // If 2FA is needed, twoFactorChallenge will be set by useAuth
    if (!ok && !error) {
      // Reset code state for 2FA
      setTwoFaCode('');
      setEmailCodeSent(false);
    }
    setLoading(false);
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaCode) return;
    setLoading(true);
    onClearError();
    await onVerify2fa(twoFaCode, twoFaMode);
    setLoading(false);
  };

  const handleSendEmailCode = async () => {
    setLoading(true);
    const ok = await onSend2faEmailCode();
    if (ok) {
      setEmailCodeSent(true);
      setTwoFaMode('email');
    }
    setLoading(false);
  };

  const handleCancel2fa = () => {
    onCancel2fa();
    setTwoFaCode('');
    setTwoFaMode('totp');
    setEmailCodeSent(false);
    emailAutoSentRef.current = false;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onClearError();
    const ok = await onSignUp(email, password, displayName || email.split('@')[0], rememberMe);
    if (ok) switchView('main');
    setLoading(false);
  };

  const handleMagicLink = async () => {
    if (!email) return;
    setLoading(true);
    const ok = await onMagicLink(email);
    if (ok) setView('magic-link-sent');
    setLoading(false);
  };

  const providers = [
    { id: 'microsoft', label: 'Microsoft', icon: (
      <svg className="w-5 h-5" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
    )},
    { id: 'github', label: 'GitHub', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
    )},
    { id: 'google', label: 'Google', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
    )},
  ];

  // 2FA verification screen
  if (twoFactorChallenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
        <div className="flex flex-col items-center w-full max-w-sm px-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Two-factor authentication</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-center text-sm">
            {twoFaMode === 'totp' && 'Enter the 6-digit code from your authenticator app.'}
            {twoFaMode === 'email' && (emailCodeSent ? 'Enter the code sent to your email.' : 'Click below to receive a code via email.')}
            {twoFaMode === 'recovery' && 'Enter one of your recovery codes.'}
          </p>

          <form onSubmit={handleVerify2fa} className="w-full space-y-3">
            {(twoFaMode !== 'email' || emailCodeSent) && (
              <input
                type="text"
                inputMode={twoFaMode === 'recovery' ? 'text' : 'numeric'}
                pattern={twoFaMode === 'recovery' ? undefined : '[0-9]*'}
                maxLength={twoFaMode === 'recovery' ? 10 : 6}
                placeholder={twoFaMode === 'recovery' ? 'xxxx-xxxx' : '000000'}
                value={twoFaCode}
                onChange={e => setTwoFaCode(twoFaMode === 'recovery' ? e.target.value : e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 text-center tracking-widest font-mono text-lg"
              />
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {twoFaMode === 'email' && !emailCodeSent ? (
              <button
                type="button"
                onClick={handleSendEmailCode}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                {loading ? 'Sending...' : 'Send code to my email'}
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !twoFaCode}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            )}
          </form>

          <div className="w-full mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
            {twoFaMode === 'totp' && (
              <button
                onClick={handleSendEmailCode}
                disabled={loading}
                className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                Send code to my email instead
              </button>
            )}
            {twoFaMode === 'email' && twoFactorChallenge.method === 'totp' && (
              <button
                onClick={() => { setTwoFaMode('totp'); setTwoFaCode(''); onClearError(); }}
                className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Use authenticator app instead
              </button>
            )}
            {twoFaMode !== 'recovery' ? (
              <button
                onClick={() => { setTwoFaMode('recovery'); setTwoFaCode(''); onClearError(); }}
                className="w-full text-xs text-gray-500 dark:text-gray-400 hover:underline"
              >
                Use a recovery code
              </button>
            ) : (
              <button
                onClick={() => { setTwoFaMode(twoFactorChallenge.method); setTwoFaCode(''); onClearError(); }}
                className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Back to {twoFactorChallenge.method === 'totp' ? 'authenticator code' : 'email code'}
              </button>
            )}
            <button
              onClick={handleCancel2fa}
              className="w-full text-xs text-gray-500 dark:text-gray-400 hover:underline"
            >
              Cancel and sign in with a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Magic link sent confirmation
  if (view === 'magic-link-sent') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
        <div className="flex flex-col items-center max-w-sm text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-green-600 flex items-center justify-center mb-6 shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Check your email</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">We sent a sign-in link to <strong className="text-gray-700 dark:text-gray-300">{email}</strong></p>
          <button onClick={() => switchView('main')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
      <div className="flex flex-col items-center w-full max-w-sm px-6">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg">
          <NotebookIcon className="w-9 h-9 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('app.name')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">{t('app.tagline')}</p>

        {/* Main view: buttons */}
        {view === 'main' && (
          <>
            <div className="w-full space-y-3">
              <button
                onClick={() => switchView('signin')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors text-sm"
              >
                {t('auth.signIn')}
              </button>
              <button
                onClick={() => switchView('signup')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium transition-colors text-sm"
              >
                {t('auth.signUp')}
              </button>
            </div>

            <div className="w-full mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 text-center">or continue with</p>
              <div className="flex justify-center gap-3">
                {providers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => onOAuth(p.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 transition-colors"
                    title={`Continue with ${p.label}`}
                  >
                    {p.icon}
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Sign In form */}
        {view === 'signin' && (
          <form onSubmit={handleSignIn} className="w-full space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded" />
              Remember me
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" onClick={handleMagicLink} className="text-blue-600 dark:text-blue-400 hover:underline">
                Send magic link instead
              </button>
              <button type="button" onClick={() => switchView('main')} className="text-gray-500 dark:text-gray-400 hover:underline">
                Back
              </button>
            </div>
          </form>
        )}

        {/* Sign Up form */}
        {view === 'signup' && (
          <form onSubmit={handleSignUp} className="w-full space-y-3">
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <input
              type="password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="rounded" />
              Remember me
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              By creating an account, you agree to our{' '}
              <Link to="/terms" state={{ backgroundLocation: location }} className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" state={{ backgroundLocation: location }} className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</Link>.
            </p>
            <div className="text-center">
              <button type="button" onClick={() => switchView('main')} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
