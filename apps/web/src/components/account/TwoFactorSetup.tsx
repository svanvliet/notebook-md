import { useState } from 'react';
import QRCode from 'qrcode';

interface TwoFactorSetupProps {
  twoFactorEnabled: boolean;
  twoFactorMethod: 'totp' | 'email' | null;
  onSetup: () => Promise<{ secret: string; uri: string } | null>;
  onEnable: (code: string, method: 'totp' | 'email') => Promise<{ recoveryCodes: string[] } | null>;
  onDisable: (code: string) => Promise<boolean>;
  onSendDisableCode: () => Promise<boolean>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

type SetupStep = 'idle' | 'choose-method' | 'totp-scan' | 'email-confirm' | 'recovery-codes' | 'disable';

export function TwoFactorSetup({
  twoFactorEnabled,
  twoFactorMethod,
  onSetup,
  onEnable,
  onDisable,
  onSendDisableCode,
  onSuccess,
  onError,
}: TwoFactorSetupProps) {
  const [step, setStep] = useState<SetupStep>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  const handleStartSetup = () => setStep('choose-method');

  const handleChooseTotp = async () => {
    setLoading(true);
    setError(null);
    const result = await onSetup();
    if (!result) {
      setError('Failed to set up 2FA. Please try again.');
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
      setError('Failed to enable email 2FA');
      setLoading(false);
      return;
    }
    setRecoveryCodes(result.recoveryCodes);
    setStep('recovery-codes');
    setLoading(false);
    onSuccess('Two-factor authentication enabled (email)');
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
    onSuccess('Two-factor authentication enabled (TOTP)');
  };

  const handleStartDisable = () => {
    setStep('disable');
    setDisableCode('');
    setError(null);
    setCodeSent(false);
  };

  const handleSendDisableCode = async () => {
    setLoading(true);
    const ok = await onSendDisableCode();
    setLoading(false);
    if (ok) {
      setCodeSent(true);
    } else {
      setError('Failed to send code');
    }
  };

  const handleDisable = async () => {
    if (!disableCode) {
      setError('Enter a verification code');
      return;
    }
    setLoading(true);
    setError(null);
    const ok = await onDisable(disableCode);
    if (!ok) {
      setError('Invalid code. Please try again.');
      setLoading(false);
      return;
    }
    setStep('idle');
    setLoading(false);
    onSuccess('Two-factor authentication disabled');
  };

  const handleCancel = () => {
    setStep('idle');
    setCode('');
    setDisableCode('');
    setError(null);
    setQrDataUrl(null);
    setSecretKey(null);
    setRecoveryCodes([]);
    setCodeSent(false);
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    onSuccess('Recovery codes copied to clipboard');
  };

  // ── Idle state ─────────────────────────────────────────────────────────────

  if (step === 'idle') {
    return (
      <div>
        {twoFactorEnabled ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                Enabled ({twoFactorMethod === 'totp' ? 'Authenticator app' : 'Email codes'})
              </span>
            </div>
            <button
              onClick={handleStartDisable}
              className="text-sm text-red-600 dark:text-red-400 hover:underline"
            >
              Disable two-factor authentication
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartSetup}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Enable two-factor authentication
          </button>
        )}
      </div>
    );
  }

  // ── Choose method ──────────────────────────────────────────────────────────

  if (step === 'choose-method') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">Choose your preferred verification method:</p>
        <div className="space-y-2">
          <button
            onClick={handleChooseTotp}
            disabled={loading}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Authenticator app</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Use an app like Google Authenticator or Authy</div>
            </div>
          </button>
          <button
            onClick={handleChooseEmail}
            disabled={loading}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Email codes</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Receive a code via email each time you sign in</div>
            </div>
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button onClick={handleCancel} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">Cancel</button>
      </div>
    );
  }

  // ── TOTP scan QR code ──────────────────────────────────────────────────────

  if (step === 'totp-scan') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Scan this QR code with your authenticator app, then enter the 6-digit code below.
        </p>
        {qrDataUrl && (
          <div className="flex justify-center">
            <img src={qrDataUrl} alt="2FA QR Code" className="rounded-lg border border-gray-200 dark:border-gray-700" />
          </div>
        )}
        {secretKey && (
          <details className="text-xs text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">Can't scan? Enter key manually</summary>
            <code className="block mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs break-all select-all">{secretKey}</code>
          </details>
        )}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(null); }}
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center tracking-widest font-mono"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleVerifyTotp}
            disabled={loading || code.length !== 6}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify & Enable'}
          </button>
          <button onClick={handleCancel} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Recovery codes ─────────────────────────────────────────────────────────

  if (step === 'recovery-codes') {
    return (
      <div className="space-y-3">
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">Save your recovery codes</p>
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            These codes can be used to access your account if you lose your authenticator device. Each code can only be used once. Store them securely.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-sm">
          {recoveryCodes.map((code, i) => (
            <div key={i} className="text-gray-800 dark:text-gray-200 select-all">{code}</div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyRecoveryCodes}
            className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
          >
            Copy codes
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Disable 2FA ────────────────────────────────────────────────────────────

  if (step === 'disable') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter a verification code to disable two-factor authentication.
          {twoFactorMethod === 'totp' && ' Use your authenticator app or a recovery code.'}
        </p>
        {twoFactorMethod === 'email' && !codeSent && (
          <button
            onClick={handleSendDisableCode}
            disabled={loading}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send code to my email'}
          </button>
        )}
        {(twoFactorMethod === 'totp' || codeSent) && (
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            placeholder={twoFactorMethod === 'totp' ? '6-digit code or recovery code' : '6-digit code'}
            value={disableCode}
            onChange={e => { setDisableCode(e.target.value); setError(null); }}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-center tracking-widest font-mono"
          />
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleDisable}
            disabled={loading || !disableCode}
            className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Disabling...' : 'Disable 2FA'}
          </button>
          <button onClick={handleCancel} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">Cancel</button>
        </div>
      </div>
    );
  }

  return null;
}
