/**
 * Collab Server Authentication & Permission Tests (RULE COLLAB-001)
 * Blueprint References: §8, §16, Phase 2 Section 2.2.8
 */
import { onAuthenticateHook } from '../hooks/on-authenticate.hook';
import { AuthService } from '../services/auth.service';
import { DocumentService } from '../services/document.service';

describe('Collab Server Authentication (RULE COLLAB-001)', () => {
  const validDocId = '22222222-2222-7222-8222-222222222222';
  const validUserId = '00000000-0000-7000-8000-000000000001';
  const validOrgId = '11111111-1111-7111-8111-111111111111';
  const validToken = 'valid-session-jwt-token-xyz';

  beforeEach(() => {
    AuthService.clearMockSessions();
    DocumentService.clearMockPermissions();

    AuthService.setMockSession(validToken, {
      userId: validUserId,
      organizationId: validOrgId,
      email: 'collaborator@clientcorp.com',
      name: 'Alice Cooper',
      role: 'member',
    });

    DocumentService.setMockPermission(`${validUserId}:${validDocId}`, {
      canRead: true,
      canWrite: true,
      isSigned: false,
    });
  });

  afterAll(() => {
    AuthService.clearMockSessions();
    DocumentService.clearMockPermissions();
  });

  it('Test 1: valid token + accessible document -> connection context established', async () => {
    const connection: any = {};
    const context = await onAuthenticateHook({
      token: validToken,
      documentName: `document:${validDocId}`,
      connection,
    } as any);

    expect(context).toBeDefined();
    expect(context.userId).toBe(validUserId);
    expect(context.organizationId).toBe(validOrgId);
    expect(context.documentId).toBe(validDocId);
    expect(context.readOnly).toBe(false);
    expect(connection.readOnly).toBe(false);
    expect(connection.context).toEqual(context);
  });

  it('Test 2: invalid or missing token -> connection rejected with Unauthorized', async () => {
    const connection: any = {};

    await expect(
      onAuthenticateHook({
        token: '',
        documentName: `document:${validDocId}`,
        connection,
      } as any),
    ).rejects.toThrow('Unauthorized: no token provided');

    await expect(
      onAuthenticateHook({
        token: 'invalid-expired-token',
        documentName: `document:${validDocId}`,
        connection,
      } as any),
    ).rejects.toThrow('Unauthorized: invalid session');
  });

  it('Test 3: valid token + inaccessible document -> Forbidden', async () => {
    const forbiddenDocId = '33333333-3333-7333-8333-333333333333';
    DocumentService.setMockPermission(`${validUserId}:${forbiddenDocId}`, {
      canRead: false,
      canWrite: false,
      isSigned: false,
    });

    const connection: any = {};
    await expect(
      onAuthenticateHook({
        token: validToken,
        documentName: `document:${forbiddenDocId}`,
        connection,
      } as any),
    ).rejects.toThrow('Forbidden: document access denied');
  });

  it('Test 4: invalid document ID format (not UUID) -> Forbidden', async () => {
    const connection: any = {};
    await expect(
      onAuthenticateHook({
        token: validToken,
        documentName: 'document:not-a-valid-uuid-format',
        connection,
      } as any),
    ).rejects.toThrow('Forbidden: invalid document ID');
  });

  it('Test 5: signed document sets readOnly = true on connection', async () => {
    const signedDocId = '44444444-4444-7444-8444-444444444444';
    DocumentService.setMockPermission(`${validUserId}:${signedDocId}`, {
      canRead: true,
      canWrite: false, // Signed documents are read-only (RULE SIG-001)
      isSigned: true,
    });

    const connection: any = {};
    const context = await onAuthenticateHook({
      token: validToken,
      documentName: `document:${signedDocId}`,
      connection,
    } as any);

    expect(context.readOnly).toBe(true);
    expect(connection.readOnly).toBe(true);
  });
});
