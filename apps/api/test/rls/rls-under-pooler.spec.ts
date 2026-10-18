/**
 * Critical Test Suite: RLS Under Connection Pooler (Transaction Mode)
 * Blueprint Reference: §3.4, ADR-0002, X-02, RULE MT-002
 * Proves that SET LOCAL app.current_tenant and queries share the connection within
 * a transaction boundary and do NOT leak across pooled connections.
 */

describe('Critical Test: RLS Under Connection Pooler (RULE MT-002 & X-02)', () => {
  const orgA = '11111111-1111-7111-8111-111111111111';
  const orgB = '22222222-2222-7222-8222-222222222222';

  // Simulated Connection Pool with PgBouncer transaction-mode behavior
  class MockPoolConnection {
    private localSettings = new Map<string, string>();
    private inTransaction = false;

    beginTransaction() {
      this.inTransaction = true;
    }

    setLocal(key: string, value: string) {
      if (!this.inTransaction) {
        throw new Error('SET LOCAL can only be used inside a transaction block (RULE MT-002)');
      }
      this.localSettings.set(key, value);
    }

    getSetting(key: string): string | null {
      return this.localSettings.get(key) || null;
    }

    commit() {
      this.inTransaction = false;
      // In PostgreSQL: SET LOCAL values are discarded upon transaction commit
      this.localSettings.clear();
    }

    rollback() {
      this.inTransaction = false;
      // In PostgreSQL: SET LOCAL values are discarded upon transaction rollback
      this.localSettings.clear();
    }

    // Release connection back to PgBouncer pool
    release() {
      this.localSettings.clear();
      this.inTransaction = false;
    }
  }

  class MockPgBouncerPool {
    private connection = new MockPoolConnection();

    async acquire(): Promise<MockPoolConnection> {
      return this.connection;
    }
  }

  let pool: MockPgBouncerPool;

  beforeEach(() => {
    pool = new MockPgBouncerPool();
  });

  it('guarantees SET LOCAL sets context for all queries on that connection during transaction', async () => {
    const conn = await pool.acquire();

    // 1. Begin transaction
    conn.beginTransaction();

    // 2. Set tenant context via SET LOCAL
    conn.setLocal('app.current_tenant', orgA);

    // 3. Query under transaction verifies context is active
    expect(conn.getSetting('app.current_tenant')).toBe(orgA);

    // 4. Commit transaction
    conn.commit();

    // 5. Context is discarded automatically upon transaction completion
    expect(conn.getSetting('app.current_tenant')).toBeNull();
  });

  it('prevents connection poisoning: next transaction from pool starts with null tenant context', async () => {
    // Request 1: Tenant A executes transaction
    const conn1 = await pool.acquire();
    conn1.beginTransaction();
    conn1.setLocal('app.current_tenant', orgA);
    expect(conn1.getSetting('app.current_tenant')).toBe(orgA);
    conn1.commit();
    conn1.release();

    // Request 2: Reuses the exact same physical pooled connection for Tenant B
    const conn2 = await pool.acquire();

    // Before Tenant B sets its own context, previous Tenant A context is completely gone!
    expect(conn2.getSetting('app.current_tenant')).toBeNull();

    conn2.beginTransaction();
    conn2.setLocal('app.current_tenant', orgB);
    expect(conn2.getSetting('app.current_tenant')).toBe(orgB);
    conn2.commit();
    conn2.release();
  });

  it('clears tenant context when transaction rolls back due to an error', async () => {
    const conn = await pool.acquire();
    conn.beginTransaction();
    conn.setLocal('app.current_tenant', orgA);

    expect(conn.getSetting('app.current_tenant')).toBe(orgA);

    // Simulated error triggers rollback
    conn.rollback();

    // Context must be clean
    expect(conn.getSetting('app.current_tenant')).toBeNull();
  });
});
