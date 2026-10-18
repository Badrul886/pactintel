import { SessionService } from '../../src/modules/auth/session.service';

describe('RULE AUTH-001: Session Lifecycle and Immediate Invalidation', () => {
  let sessionService: SessionService;

  beforeEach(() => {
    sessionService = new SessionService();
    sessionService.onModuleInit();
  });

  afterEach(async () => {
    await sessionService.onModuleDestroy();
  });

  it('creates a session with 24h sliding inactivity and 7d absolute max lifetime', async () => {
    const userId = 'user-123';
    const orgId = 'org-456';

    const sessionId = await sessionService.createSession({
      userId,
      organizationId: orgId,
      email: 'alex@example.com',
      role: 'admin',
    });

    expect(sessionId).toBeDefined();

    const session = await sessionService.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session?.userId).toEqual(userId);
    expect(session?.organizationId).toEqual(orgId);
    expect(session?.role).toEqual('admin');
    expect(session?.absoluteExpiry).toBeGreaterThan(Date.now() + 6 * 86400 * 1000);
  });

  it('destroys single session immediately upon logout (RULE AUTH-001)', async () => {
    const sessionId = await sessionService.createSession({
      userId: 'user-logout',
      organizationId: 'org-logout',
      email: 'logout@example.com',
      role: 'member',
    });

    expect(await sessionService.getSession(sessionId)).not.toBeNull();

    await sessionService.destroySession(sessionId);

    // Verifies immediate invalidation
    expect(await sessionService.getSession(sessionId)).toBeNull();
  });

  it('invalidates ALL sessions for a user on security events (RULE AUTH-001)', async () => {
    const userId = 'user-security-event';

    // User logged in on 3 different devices/browsers
    const session1 = await sessionService.createSession({
      userId,
      organizationId: 'org-sec',
      email: 'sec@example.com',
      role: 'member',
    });

    const session2 = await sessionService.createSession({
      userId,
      organizationId: 'org-sec',
      email: 'sec@example.com',
      role: 'member',
    });

    const session3 = await sessionService.createSession({
      userId,
      organizationId: 'org-sec',
      email: 'sec@example.com',
      role: 'member',
    });

    expect(await sessionService.getSession(session1)).not.toBeNull();
    expect(await sessionService.getSession(session2)).not.toBeNull();
    expect(await sessionService.getSession(session3)).not.toBeNull();

    // Trigger security event (e.g., password change, role downgrade, suspicious activity)
    await sessionService.destroyAllUserSessions(userId);

    // All 3 sessions must be immediately invalid
    expect(await sessionService.getSession(session1)).toBeNull();
    expect(await sessionService.getSession(session2)).toBeNull();
    expect(await sessionService.getSession(session3)).toBeNull();
  });
});
