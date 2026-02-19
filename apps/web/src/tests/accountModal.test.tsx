/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountModal } from '../components/account/AccountModal';
import type { User } from '../hooks/useAuth';
import { ToastProvider } from '../hooks/useToast';
import React from 'react';

const baseUser: User = {
  id: 'u1',
  displayName: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  avatarUrl: null,
  hasPassword: true,
};

const noop = () => {};
const asyncNoop = async () => true;
const asyncNoopStr = async () => null as string | null;

function renderModal(userOverrides: Partial<User> = {}, props: Record<string, unknown> = {}) {
  const user = { ...baseUser, ...userOverrides };
  return render(
    React.createElement(ToastProvider, null,
      React.createElement(AccountModal, {
        user,
        onUpdateProfile: asyncNoop as (u: { displayName?: string }) => Promise<boolean>,
        onChangePassword: asyncNoopStr as (c: string, n: string, cf: string) => Promise<string | null>,
        onDeleteAccount: asyncNoop as (p?: string, c?: string) => Promise<boolean>,
        onSignOut: noop,
        onProviderUnlinked: noop,
        onClose: noop,
        onSetup2fa: (async () => null) as () => Promise<{ secret: string; uri: string } | null>,
        onEnable2fa: (async () => null) as (code: string, method: 'totp' | 'email') => Promise<{ recoveryCodes: string[] } | null>,
        onDisable2fa: (async () => false) as (code: string) => Promise<boolean>,
        onSendDisable2faCode: (async () => false) as () => Promise<boolean>,
        ...props,
      })
    )
  );
}

// Mock fetch for linked providers
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AccountModal', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ providers: [] }) });
  });

  // --- Password Section ---

  it('shows "Change password" when user has a password', () => {
    renderModal({ hasPassword: true });
    expect(screen.getByText('Change password')).toBeTruthy();
  });

  it('shows "Add a password" when user has no password', () => {
    renderModal({ hasPassword: false });
    expect(screen.getByText('Add a password')).toBeTruthy();
  });

  it('shows current password field when changing password', () => {
    renderModal({ hasPassword: true });
    fireEvent.click(screen.getByText('Change password'));
    expect(screen.getByPlaceholderText('Current password')).toBeTruthy();
    expect(screen.getByPlaceholderText('Confirm new password')).toBeTruthy();
  });

  it('hides current password field when adding password', () => {
    renderModal({ hasPassword: false });
    fireEvent.click(screen.getByText('Add a password'));
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
    expect(screen.getByPlaceholderText('New password (min 8 characters)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Confirm new password')).toBeTruthy();
  });

  it('shows confirm password validation error on mismatch', async () => {
    renderModal({ hasPassword: false });
    fireEvent.click(screen.getByText('Add a password'));
    fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'different456' } });
    fireEvent.click(screen.getByText('Add Password'));
    expect(await screen.findByText('Passwords do not match')).toBeTruthy();
  });

  it('shows min length error for short password', async () => {
    renderModal({ hasPassword: false });
    fireEvent.click(screen.getByText('Add a password'));
    fireEvent.change(screen.getByPlaceholderText('New password (min 8 characters)'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Add Password'));
    expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
  });

  // --- Delete Section ---

  it('shows password confirmation for delete when user has password', () => {
    renderModal({ hasPassword: true });
    fireEvent.click(screen.getByText('Delete Account'));
    expect(screen.getByPlaceholderText('Enter your password to confirm')).toBeTruthy();
  });

  it('shows "type DELETE" confirmation when user has no password', () => {
    renderModal({ hasPassword: false });
    fireEvent.click(screen.getByText('Delete Account'));
    expect(screen.getByText('Type DELETE to confirm')).toBeTruthy();
    expect(screen.getByPlaceholderText('DELETE')).toBeTruthy();
  });

  it('disables delete button until DELETE is typed for OAuth-only accounts', () => {
    renderModal({ hasPassword: false });
    fireEvent.click(screen.getByText('Delete Account'));
    const deleteBtn = screen.getByText('Delete My Account');
    expect(deleteBtn.hasAttribute('disabled') || deleteBtn.closest('button')?.disabled).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    expect(screen.getByText('Delete My Account').closest('button')?.disabled).toBeFalsy();
  });

  it('disables delete button until password is entered for password accounts', () => {
    renderModal({ hasPassword: true });
    fireEvent.click(screen.getByText('Delete Account'));
    const deleteBtn = screen.getByText('Delete My Account').closest('button')!;
    expect(deleteBtn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Enter your password to confirm'), { target: { value: 'mypassword' } });
    expect(screen.getByText('Delete My Account').closest('button')?.disabled).toBe(false);
  });
});
