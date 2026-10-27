/**
 * PresenceStack Component
 * Displays live collaborator presence avatars and real-time connection status.
 * Design System: Inter typography, 32px rounded avatars, +N overflow badge, status indicator.
 */
import React from 'react';
import { CollaboratorPresence } from '../hooks/useCollabProvider';

interface PresenceStackProps {
  collaborators: CollaboratorPresence[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

function getInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PresenceStack({ collaborators, connectionStatus }: PresenceStackProps) {
  const maxShown = 5;
  const visible = collaborators.slice(0, maxShown);
  const overflow = collaborators.length > maxShown ? collaborators.length - maxShown : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
      }}
    >
      {/* Real-time Connection Dot */}
      <div
        title={
          connectionStatus === 'connected'
            ? 'Live co-editing connected'
            : connectionStatus === 'connecting'
              ? 'Connecting to collab server...'
              : 'Disconnected from collab server'
        }
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor:
            connectionStatus === 'connected'
              ? '#10B981' // Emerald 500
              : connectionStatus === 'connecting'
                ? '#F59E0B' // Amber 500
                : '#94A3B8', // Slate 400
          transition: 'background-color 0.2s ease',
        }}
      />

      {/* Avatar Stack */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {visible.map((collab, index) => {
          const initials = getInitials(collab.name);
          return (
            <div
              key={collab.clientId}
              title={`${collab.name}${collab.email ? ` (${collab.email})` : ''}`}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: collab.color,
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: index === 0 ? '0' : '-6px',
                border: '2px solid #FFFFFF',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                userSelect: 'none',
                cursor: 'default',
              }}
            >
              {initials}
            </div>
          );
        })}

        {overflow > 0 && (
          <div
            title={`${overflow} more collaborator${overflow > 1 ? 's' : ''}`}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#E2E8F0',
              color: '#475569',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '-6px',
              border: '2px solid #FFFFFF',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              userSelect: 'none',
              cursor: 'default',
            }}
          >
            +{overflow}
          </div>
        )}
      </div>

      <span
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: '#475569',
          paddingRight: '4px',
        }}
      >
        {collaborators.length} {collaborators.length === 1 ? 'editor' : 'editors'}
      </span>
    </div>
  );
}
