import { useState, useEffect, useRef, useCallback } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  permission: string;
}

export interface UseCollaborationResult {
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
  isConnected: boolean;
  isSynced: boolean;
  connectedUsers: CollabUser[];
  error: string | null;
}

/**
 * Hook to manage a HocusPocus collaboration connection for a Cloud document.
 * Returns null provider when documentPath or notebookId is null (non-collaborative mode).
 */
export function useCollaboration(
  notebookId: string | null,
  documentPath: string | null,
  token: string | null,
  currentUser?: { name: string; color?: string },
): UseCollaborationResult {
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<CollabUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  useEffect(() => {
    if (!notebookId || !documentPath || !token) {
      return;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const documentName = `notebook:${notebookId}:file:${encodeURIComponent(documentPath)}`;

    // Determine WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = API_BASE
      ? `${wsProtocol}//${new URL(API_BASE).host}/collab`
      : `${wsProtocol}//${window.location.host}/collab`;

    const provider = new HocuspocusProvider({
      url: wsUrl,
      name: documentName,
      document: ydoc,
      token,
      onConnect() {
        setIsConnected(true);
        setError(null);
      },
      onDisconnect() {
        setIsConnected(false);
      },
      onSynced() {
        setIsSynced(true);
      },
      onAuthenticationFailed({ reason }) {
        setError(reason || 'Authentication failed');
        setIsConnected(false);
      },
      onAwarenessUpdate({ states }) {
        const users: CollabUser[] = [];
        states.forEach((state: Record<string, unknown>) => {
          if (state.user) {
            const u = state.user as CollabUser;
            users.push(u);
          }
        });
        setConnectedUsers(users);
      },
    });

    // Set awareness (current user)
    if (currentUser) {
      provider.setAwarenessField('user', {
        name: currentUser.name,
        color: currentUser.color || '#3B82F6',
      });
    }

    providerRef.current = provider;

    return () => {
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      setIsConnected(false);
      setIsSynced(false);
      setConnectedUsers([]);
      setError(null);
    };
  }, [notebookId, documentPath, token]);

  return {
    provider: providerRef.current,
    ydoc: ydocRef.current,
    isConnected,
    isSynced,
    connectedUsers,
    error,
  };
}
