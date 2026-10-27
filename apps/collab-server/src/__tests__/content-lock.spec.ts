/**
 * Content Lock Enforcement Tests (RULE COLLAB-002 & EC-COLLAB-01..09)
 * Blueprint References: §8, §16, Phase 2 Section 2.2.8
 */
import * as Y from 'yjs';
import { onUpdateHook } from '../hooks/on-update.hook';
import { ContentLockService } from '../services/content-lock.service';

function createBlockUpdate(blockId: string, content: string): Uint8Array {
  const doc = new Y.Doc();
  const blocksMap = doc.getMap('blocks');
  blocksMap.set(blockId, { id: blockId, text: content });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

describe('Content Lock Enforcement (RULE COLLAB-002 & EC-COLLAB-01..09)', () => {
  const documentId = '22222222-2222-7222-8222-222222222222';
  const orgId = '11111111-1111-7111-8111-111111111111';
  const aliceUserId = '00000000-0000-7000-8000-000000000001';
  const bobUserId = '00000000-0000-7000-8000-000000000002';
  const adminUserId = '00000000-0000-7000-8000-000000000099';

  beforeEach(() => {
    ContentLockService.clearMockLocks();

    // Alice locks 'block-indemnity-1'
    ContentLockService.setMockLock(documentId, 'block-indemnity-1', {
      id: 'lock-1',
      organizationId: orgId,
      documentId,
      blockId: 'block-indemnity-1',
      lockedById: aliceUserId,
      lockedAt: new Date(),
    });
  });

  afterAll(() => {
    ContentLockService.clearMockLocks();
  });

  it('Test 1: user edits an unlocked block -> update accepted', async () => {
    const update = createBlockUpdate('block-general-terms', 'Modified terms content');
    const connection: any = {
      context: {
        userId: bobUserId,
        organizationId: orgId,
        documentId,
        isContentAdmin: false,
        readOnly: false,
      },
    };

    // Should complete without throwing
    await expect(onUpdateHook({ update, connection })).resolves.toBeUndefined();
  });

  it('Test 2: user edits block locked by another user -> update rejected (EC-COLLAB-09)', async () => {
    const update = createBlockUpdate('block-indemnity-1', 'Bob tampering with Alice lock');
    const connection: any = {
      context: {
        userId: bobUserId,
        organizationId: orgId,
        documentId,
        isContentAdmin: false,
        readOnly: false,
      },
    };

    await expect(onUpdateHook({ update, connection })).rejects.toThrow(
      'Block block-indemnity-1 is locked by another user',
    );
  });

  it('Test 3: content admin edits block locked by another user -> update accepted', async () => {
    const update = createBlockUpdate('block-indemnity-1', 'Admin override of indemnity terms');
    const connection: any = {
      context: {
        userId: adminUserId,
        organizationId: orgId,
        documentId,
        isContentAdmin: true, // Content Admin role
        readOnly: false,
      },
    };

    // Should succeed because admin has override permission
    await expect(onUpdateHook({ update, connection })).resolves.toBeUndefined();
  });

  it('Test 4: lock owner edits own locked block -> update accepted', async () => {
    const update = createBlockUpdate('block-indemnity-1', 'Alice refining her locked clause');
    const connection: any = {
      context: {
        userId: aliceUserId, // Alice is the lock owner
        organizationId: orgId,
        documentId,
        isContentAdmin: false,
        readOnly: false,
      },
    };

    await expect(onUpdateHook({ update, connection })).resolves.toBeUndefined();
  });

  it('Test 5: simultaneous locking on different blocks (EC-COLLAB-01) -> updates to both accepted', async () => {
    // Bob locks 'block-pricing-table'
    ContentLockService.setMockLock(documentId, 'block-pricing-table', {
      id: 'lock-2',
      organizationId: orgId,
      documentId,
      blockId: 'block-pricing-table',
      lockedById: bobUserId,
      lockedAt: new Date(),
    });

    // Alice updates her block
    const aliceUpdate = createBlockUpdate('block-indemnity-1', 'Alice content');
    const aliceConn: any = {
      context: { userId: aliceUserId, organizationId: orgId, documentId, isContentAdmin: false },
    };
    await expect(
      onUpdateHook({ update: aliceUpdate, connection: aliceConn }),
    ).resolves.toBeUndefined();

    // Bob updates his block
    const bobUpdate = createBlockUpdate('block-pricing-table', 'Bob pricing content');
    const bobConn: any = {
      context: { userId: bobUserId, organizationId: orgId, documentId, isContentAdmin: false },
    };
    await expect(onUpdateHook({ update: bobUpdate, connection: bobConn })).resolves.toBeUndefined();
  });

  it('Test 6: read-only connection attempts edit -> rejected immediately', async () => {
    const update = createBlockUpdate('block-general-terms', 'Read-only tampering');
    const connection: any = {
      readOnly: true,
      context: {
        userId: aliceUserId,
        organizationId: orgId,
        documentId,
        readOnly: true,
      },
    };

    await expect(onUpdateHook({ update, connection })).rejects.toThrow(
      'Forbidden: document is in read-only mode',
    );
  });
});
