/**
 * useCollabProvider Hook (RULE COLLAB-001 & COLLAB-003)
 * Manages Yjs Y.Doc, Hocuspocus WebSocket connection, awareness presence, and lifecycle cleanup.
 */
import { useEffect, useState, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CollaboratorPresence {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  email?: string;
  avatarUrl?: string;
}

// Curated Design System palette for collaborator cursors and avatars (DESIGN_SYSTEM.md §2)
const COLLABORATOR_COLORS = [
  '#2563EB', // Blue 600
  '#059669', // Emerald 600
  '#D97706', // Amber 600
  '#7C3AED', // Violet 600
  '#E11D48', // Rose 600
  '#0891B2', // Cyan 600
];

export function generateUserColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
}

function getSessionTokenFromCookie(): string {
  if (typeof document === 'undefined') return 'mock-token';
  const match = document.cookie.match(/(?:^|;\s*)pact_session=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : 'dev-token-valid';
}

export function useCollabProvider(
  documentId: string,
  currentUser?: { id: string; name: string; email?: string },
) {
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');

  // 1. Create persistent Y.Doc instance
  const ydoc = useMemo(() => new Y.Doc(), []);

  // 2. Setup WebSocket provider
  const provider = useMemo(() => {
    if (typeof window === 'undefined') return null;

    const wsUrl = process.env.NEXT_PUBLIC_COLLAB_WS_URL || 'ws://localhost:1234';
    const token = getSessionTokenFromCookie();

    const p = new WebsocketProvider(wsUrl, `document:${documentId}`, ydoc, {
      params: { token },
      connect: true,
    });

    return p;
  }, [documentId, ydoc]);

  // 3. Awareness & Presence synchronization
  useEffect(() => {
    if (!provider) return;

    const user = currentUser || {
      id: 'usr-current',
      name: 'You (Editor)',
      email: 'editor@clientcorp.com',
    };

    const userColor = generateUserColor(user.id);

    // Set local awareness state
    provider.awareness.setLocalStateField('user', {
      clientId: provider.awareness.clientID,
      userId: user.id,
      name: user.name,
      email: user.email,
      color: userColor,
    });

    // Handle status events
    const onStatus = (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      setConnectionStatus(event.status);
    };

    // Handle awareness updates
    const onAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const active: CollaboratorPresence[] = [];

      states.forEach((state, clientId) => {
        if (state.user) {
          active.push({
            clientId,
            userId: state.user.userId || `client-${clientId}`,
            name: state.user.name || 'Anonymous Collaborator',
            color: state.user.color || generateUserColor(String(clientId)),
            email: state.user.email,
            avatarUrl: state.user.avatarUrl,
          });
        }
      });

      setCollaborators(active);
    };

    provider.on('status', onStatus);
    provider.awareness.on('change', onAwarenessChange);

    // Trigger initial population
    onAwarenessChange();

    return () => {
      provider.off('status', onStatus);
      provider.awareness.off('change', onAwarenessChange);
    };
  }, [provider, currentUser]);

  // 4. Destroy on unmount
  useEffect(() => {
    return () => {
      if (provider) {
        provider.destroy();
      }
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  return {
    ydoc,
    provider,
    connectionStatus,
    collaborators,
    isConnected: connectionStatus === 'connected',
  };
}
