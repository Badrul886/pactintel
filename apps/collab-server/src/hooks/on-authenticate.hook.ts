/**
 * Collab Server onAuthenticate Hook (RULE COLLAB-001)
 * Blueprint References: §8, §16, Phase 2 Section 2.2.3
 */
import { onAuthenticatePayload } from '@hocuspocus/server';
import { authService } from '../services/auth.service';
import { documentService } from '../services/document.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CollabConnectionContext {
  userId: string;
  organizationId: string;
  documentId: string;
  email: string;
  name: string;
  role: string;
  isContentAdmin: boolean;
  readOnly: boolean;
}

export const onAuthenticateHook = async (
  data: onAuthenticatePayload,
): Promise<CollabConnectionContext> => {
  const { token, documentName, connection, requestParameters } = data;

  // Extract token from direct property or URL query parameters
  const resolvedToken = token || requestParameters?.get('token');
  if (!resolvedToken) {
    throw new Error('Unauthorized: no token provided');
  }

  // Deal Room namespace: 'deal-room:{uuid}'
  if (documentName.startsWith('deal-room:')) {
    const roomId = documentName.replace('deal-room:', '');
    if (!UUID_REGEX.test(roomId)) {
      throw new Error('Forbidden: invalid deal room ID');
    }

    // 1. Try standard user session (seller team)
    const session = await authService.validateSessionToken(resolvedToken);
    if (session) {
      const isContentAdmin =
        session.role === 'admin' || session.role === 'owner' || session.role === 'manager';
      const readOnly = session.role === 'viewer';
      (connection as any).readOnly = readOnly;

      const context: CollabConnectionContext = {
        userId: session.userId,
        organizationId: session.organizationId,
        documentId: roomId,
        email: session.email,
        name: session.name,
        role: session.role,
        isContentAdmin,
        readOnly,
      };

      (connection as any).context = context;
      return context;
    }

    // 2. Try guest magic link token (buyer side)
    const guestSession = await authService.validateDealRoomSessionToken(resolvedToken, roomId);
    if (guestSession) {
      const readOnly = guestSession.role === 'viewer';
      (connection as any).readOnly = readOnly;

      const context: CollabConnectionContext = {
        userId: `guest-${guestSession.email}`,
        organizationId: guestSession.organizationId,
        documentId: roomId,
        email: guestSession.email,
        name: guestSession.name,
        role: guestSession.role,
        isContentAdmin: false,
        readOnly,
      };

      (connection as any).context = context;
      return context;
    }

    throw new Error('Unauthorized: invalid session');
  }

  // 1. Validate session token via Auth Service
  const session = await authService.validateSessionToken(resolvedToken);
  if (!session) {
    throw new Error('Unauthorized: invalid session');
  }

  // 2. Parse document ID from documentName ('document:{uuid}')
  const documentId = documentName.replace('document:', '');
  if (!UUID_REGEX.test(documentId)) {
    throw new Error('Forbidden: invalid document ID');
  }

  // 3. CASL permission check: can user read this document?
  const canRead = await documentService.checkAccess(session.userId, documentId);
  if (!canRead) {
    throw new Error('Forbidden: document access denied');
  }

  // 4. Check write permissions & lifecycle state (e.g. signed documents are read-only)
  const canWrite = await documentService.checkWriteAccess(session.userId, documentId);
  const isContentAdmin =
    session.role === 'admin' || session.role === 'owner' || session.role === 'manager';

  // Attach readOnly flag to connection
  (connection as any).readOnly = !canWrite;

  const context: CollabConnectionContext = {
    userId: session.userId,
    organizationId: session.organizationId,
    documentId,
    email: session.email,
    name: session.name,
    role: session.role,
    isContentAdmin,
    readOnly: !canWrite,
  };

  (connection as any).context = context;

  return context;
};
