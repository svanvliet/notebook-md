import { useState, useEffect } from 'react';
import type { User } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { GitHubIcon, OneDriveIcon, GoogleDriveIcon } from '../icons/Icons';

interface LinkedProvider {
  provider: string;
  providerEmail: string;
}

const PROVIDER_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  microsoft: { label: 'Microsoft', icon: OneDriveIcon },
  google: { label: 'Google', icon: GoogleDriveIcon },
  github: { label: 'GitHub', icon: GitHubIcon },
};

interface AccountModalProps {
  user: User;
  onUpdateProfile: (updates: { displayName?: string }) => Promise<boolean>;
  onChangePassword: (current: string, next: string) => Promise<string | null>;
  onDeleteAccount: (password?: string) => Promise<boolean>;
  onSignOut: () => void;
  onProviderUnlinked: (provider: string) => void;
  onClose: () => void;
}

export function AccountModal({ user, onUpdateProfile, onChangePassword, onDeleteAccount, onSignOut, onProviderUnlinked, onClose }: AccountModalProps) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Delete account
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // Linked providers
  const [linkedProviders, setLinkedProviders] = useState<LinkedProvider[]>([]);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/auth/oauth/linked', { credentials: 'include' });
        if (res.ok) {
          const { providers } = await res.json();
          setLinkedProviders(providers);
        }
      } catch { /* offline */ }
    })();
  }, []);

  const handleUnlink = async (provider: string) => {
    if (!confirm(`Unlink ${PROVIDER_META[provider]?.label ?? provider} from your account?`)) return;
    setUnlinking(provider);
    try {
      const res = await fetch(`/auth/oauth/${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        addToast(data.error ?? 'Failed to unlink provider', 'error');
        return;
      }
      setLinkedProviders((prev) => prev.filter((p) => p.provider !== provider));
      addToast(`${PROVIDER_META[provider]?.label ?? provider} unlinked`, 'success');
      onProviderUnlinked(provider);
    } catch {
      addToast('Failed to unlink provider', 'error');
    } finally {
      setUnlinking(null);
    }
  };

  const handleLinkProvider = (provider: string) => {
    window.location.href = `/auth/oauth/${provider}?returnTo=/&linkToUser=${user.id}`;
  };

  const handleSaveProfile = async () => {
    if (displayName === user.displayName) return;
    setSaving(true);
    const ok = await onUpdateProfile({ displayName });
    if (ok) {
      addToast('Profile updated', 'success');
    } else {
      addToast('Failed to update profile', 'error');
    }
    setMessage(null);
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    const err = await onChangePassword(currentPassword, newPassword);
    if (err) {
      setPasswordError(err);
    } else {
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      addToast('Password changed', 'success');
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await onDeleteAccount(deletePassword || undefined);
    if (ok) onSignOut();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Account Settings</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Profile */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Profile</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Display Name</label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 dark:text-gray-100">{user.email}</span>
                  {user.emailVerified ? (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">Verified</span>
                  ) : (
                    <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">Unverified</span>
                  )}
                </div>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={saving || displayName === user.displayName}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Password</h3>
            {!showPasswordChange ? (
              <button
                onClick={() => setShowPasswordChange(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Change password
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                />
                {passwordError && <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleChangePassword} className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Change Password
                  </button>
                  <button onClick={() => { setShowPasswordChange(false); setPasswordError(null); }} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Linked Accounts */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Linked Accounts</h3>
            <div className="space-y-2">
              {linkedProviders.map((lp) => {
                const meta = PROVIDER_META[lp.provider];
                const Icon = meta?.icon;
                return (
                  <div key={lp.provider} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                    {Icon && <Icon className="w-5 h-5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{meta?.label ?? lp.provider}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{lp.providerEmail}</div>
                    </div>
                    <button
                      onClick={() => handleUnlink(lp.provider)}
                      disabled={unlinking === lp.provider}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      {unlinking === lp.provider ? 'Unlinking…' : 'Unlink'}
                    </button>
                  </div>
                );
              })}
              {linkedProviders.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No linked providers</p>
              )}
            </div>
            {/* Link a new provider */}
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Link a new provider:</p>
              <div className="flex gap-2">
                {Object.entries(PROVIDER_META)
                  .filter(([key]) => !linkedProviders.some((lp) => lp.provider === key))
                  .map(([key, { label, icon: Icon }]) => (
                    <button
                      key={key}
                      onClick={() => handleLinkProvider(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-3">Danger Zone</h3>
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete Account
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">This action is permanent and cannot be undone. All your data will be deleted.</p>
                <input
                  type="password"
                  placeholder="Enter your password to confirm"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={handleDeleteAccount} className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                    Delete My Account
                  </button>
                  <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {message && (
            <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
