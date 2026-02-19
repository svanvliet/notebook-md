import { useState } from 'react';
import QRCode from 'qrcode';
import { NotebookIcon } from '../icons/Icons';

interface OnboardingTwoFactorProps {
  onSetup: () => Promise<{ secret: string; uri: string } | null>;
  onEnable: (code: string, method: 'totp' | 'email') => Promise<{ recoveryCodes: string[] } | null>;
  onSkip: () => void;
}

type Step = 'offer' | 'choose-method' | 'totp-scan' | 'recovery-codes' | 'done';

export function OnboardingTwoFactor({ onSetup, onEnable, onSkip }: OnboardingTwoFactorProps) {
  const [step, setStep] = useState<Step>('offer');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChooseTotp = async () => {
    setLoading(true);
    setError(null);
    const result = await onSetup();
    if (!result) {
      setError('Failed to set up. Please try again.');
      setLoading(false);
      return;
    }
    try {
      const dataUrl = await QRCode.toDataURL(result.uri, { width: 200, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {
      setError('Failed to generate QR code');
      setLoading(false);
      return;
    }
    setSecretKey(result.secret);
    setStep('totp-scan');
    setLoading(false);
  };

  const handleChooseEmail = async () => {
    setLoading(true);
    setError(null);
    const result = await onEnable('', 'email');
    if (!result) {
      setError('Failed to enable. Please try again.');
      setLoading(false);
      return;
    }
    setRecoveryCodes(result.recoveryCodes);
    setStep('recovery-codes');
    setLoading(false);
  };

  const handleVerifyTotp = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await onEnable(code, 'totp');
    if (!result) {
      setError('Invalid code. Please try again.');
      setLoading(false);
      return;
    }
    setRecoveryCodes(result.recoveryCodes);
    setStep('recovery-codes');
    setLoading(false);
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
      <div className="flex flex-col items-center w-full max-w-sm px-6">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg">
          <NotebookIcon className="w-9 h-9 text-white" />
        </div>

        {/* Offer step */}
        {step === 'offer' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Secure your account</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-center text-sm">
              Add two-factor authentication for an extra layer of security. You can also do this later from Account Settings.
            </p>
            <div className="w-full space-y-3">
              <button
                onClick={() => setStep('choose-method')}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
              >
                Set up two-factor authentication
              </button>
              <button
                onClick={onSkip}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium text-sm transition-colors"
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* Choose method */}
        {step === 'choose-method' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Choose a method</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-center text-sm">
              How would you like to verify your identity when signing in?
            </p>
            <div className="w-full space-y-2">
              <button
                onClick={handleChooseTotp}
                disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
              >
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Authenticator app</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Google Authenticator, Authy, etc.</div>
                </div>
              </button>
              <button
                onClick={handleChooseEmail}
                disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left disabled:opacity-50"
              >
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Email codes</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Receive a code each time you sign in</div>
                </div>
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button onClick={onSkip} className="mt-4 text-xs text-gray-500 dark:text-gray-400 hover:underline">Skip for now</button>
          </>
        )}

        {/* TOTP QR scan */}
        {step === 'totp-scan' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Scan QR code</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4 text-center text-sm">
              Scan with your authenticator app, then enter the code.
            </p>
            {qrDataUrl && (
              <div className="flex justify-center mb-3">
                <img src={qrDataUrl} alt="2FA QR Code" className="rounded-lg border border-gray-200 dark:border-gray-700" />
              </div>
            )}
            {secretKey && (
              <details className="w-full text-xs text-gray-500 dark:text-gray-400 mb-3">
                <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">Can't scan? Enter key manually</summary>
                <code className="block mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs break-all select-all">{secretKey}</code>
              </details>
            )}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(null); }}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center tracking-widest font-mono text-lg mb-3"
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
            <button
              onClick={handleVerifyTotp}
              disabled={loading || code.length !== 6}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
            <button onClick={onSkip} className="mt-3 text-xs text-gray-500 dark:text-gray-400 hover:underline">Skip for now</button>
          </>
        )}

        {/* Recovery codes */}
        {step === 'recovery-codes' && (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Save recovery codes</h2>
            <div className="w-full p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Store these codes securely. Each can be used once if you lose access to your verification method.
              </p>
            </div>
            <div className="w-full grid grid-cols-2 gap-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-sm mb-4">
              {recoveryCodes.map((c, i) => (
                <div key={i} className="text-gray-800 dark:text-gray-200 select-all">{c}</div>
              ))}
            </div>
            <div className="w-full space-y-2">
              <button
                onClick={handleCopyRecoveryCodes}
                className="w-full px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              >
                Copy codes
              </button>
              <button
                onClick={onSkip}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors"
              >
                Continue to Notebook.md
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
