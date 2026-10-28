/**
 * Collab Server Authentication Service (RULE COLLAB-001)
 * Validates session tokens passed via WebSocket handshake parameters.
 */
import { config } from '../config';

export interface AuthenticatedUserSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
}

export interface DealRoomGuestSession {
  dealRoomId: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  isExternalGuest: boolean;
}

export class AuthService {
  private static mockSessions = new Map<string, AuthenticatedUserSession>();
  private static mockDealRoomSessions = new Map<string, DealRoomGuestSession>();

  /**
   * For testing & mocks
   */
  static setMockSession(token: string, session: AuthenticatedUserSession | null) {
    if (session) {
      this.mockSessions.set(token, session);
    } else {
      this.mockSessions.delete(token);
    }
  }

  static setMockDealRoomSession(token: string, session: DealRoomGuestSession | null) {
    if (session) {
      this.mockDealRoomSessions.set(token, session);
    } else {
      this.mockDealRoomSessions.delete(token);
    }
  }

  static clearMockSessions() {
    this.mockSessions.clear();
    this.mockDealRoomSessions.clear();
  }

  async validateSessionToken(token: string): Promise<AuthenticatedUserSession | null> {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // Check mock test sessions first
    if (AuthService.mockSessions.has(token)) {
      return AuthService.mockSessions.get(token) || null;
    }

    // In unit test environment, unmocked tokens are directly treated as invalid
    if (process.env.NODE_ENV === 'test' || config.env === 'test') {
      return null;
    }

    // Development fallback token support
    if (config.env !== 'production' && token === 'dev-token-valid') {
      return {
        userId: '00000000-0000-7000-8000-000000000001',
        organizationId: '11111111-1111-7111-8111-111111111111',
        email: 'dev@pactintel.com',
        name: 'Dev User',
        role: 'admin',
      };
    }

    try {
      // Validate with API service
      const res = await fetch(`${config.apiUrl}/api/v1/auth/validate-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return {
        userId: data.userId,
        organizationId: data.organizationId,
        email: data.email || 'user@pactintel.com',
        name: data.name || 'Collaborator',
        role: data.role || 'member',
      };
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[CollabAuth] Failed to validate session token against API:', err);
      }
      return null;
    }
  }

  async validateDealRoomSessionToken(
    token: string,
    roomId: string,
  ): Promise<DealRoomGuestSession | null> {
    if (!token || typeof token !== 'string') {
      return null;
    }

    if (AuthService.mockDealRoomSessions.has(token)) {
      const sess = AuthService.mockDealRoomSessions.get(token);
      if (sess && sess.dealRoomId === roomId) {
        return sess;
      }
      return null;
    }

    if (process.env.NODE_ENV === 'test' || config.env === 'test') {
      return null;
    }

    try {
      const res = await fetch(`${config.apiUrl}/api/v1/deal-rooms/access/${token}`);
      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (!data?.session || data.session.dealRoomId !== roomId) {
        return null;
      }

      return {
        dealRoomId: data.session.dealRoomId,
        organizationId: data.session.organizationId,
        email: data.session.email,
        name: data.session.name,
        role: data.session.role,
        isExternalGuest: true,
      };
    } catch (err) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[CollabAuth] Failed to validate deal room magic link token:', err);
      }
      return null;
    }
  }
}

export const authService = new AuthService();
