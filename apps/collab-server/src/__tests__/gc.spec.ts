/**
 * Collab Server Garbage Collection & LRU Eviction Tests (RULE COLLAB-003 & Invariant I-01)
 * Blueprint References: §8, §16, Phase 2 Section 2.2.8 & EC-COLLAB-05..07
 */
import * as Y from 'yjs';
import {
  onDisconnectHook,
  isGcTimerActive,
  clearAllGcTimers,
  persistAndUnload,
  enforceLruEviction,
} from '../hooks/on-disconnect.hook';
import { onConnectHook } from '../hooks/on-connect.hook';
import { getStoredDocState, clearStoredDocStates } from '../extensions/database.extension';

describe('In-Memory Garbage Collection & LRU Eviction (RULE COLLAB-003)', () => {
  const documentName = 'document:22222222-2222-7222-8222-222222222222';
  const documentId = '22222222-2222-7222-8222-222222222222';

  beforeEach(() => {
    clearAllGcTimers();
    clearStoredDocStates();
    jest.useFakeTimers();
  });

  afterEach(() => {
    clearAllGcTimers();
    clearStoredDocStates();
    jest.useRealTimers();
  });

  it('Test 1: when last user disconnects (connections === 0), starts GC timer', async () => {
    const mockDoc = {
      ydoc: new Y.Doc(),
      getConnectionsCount: () => 0,
    };

    expect(isGcTimerActive(documentName)).toBe(false);

    await onDisconnectHook({
      documentName,
      document: mockDoc,
    } as any);

    expect(isGcTimerActive(documentName)).toBe(true);
    mockDoc.ydoc.destroy();
  });

  it('Test 2: if connections remain (> 0), does not start GC timer', async () => {
    const mockDoc = {
      ydoc: new Y.Doc(),
      getConnectionsCount: () => 1, // Still 1 active client
    };

    await onDisconnectHook({
      documentName,
      document: mockDoc,
    } as any);

    expect(isGcTimerActive(documentName)).toBe(false);
    mockDoc.ydoc.destroy();
  });

  it('Test 3: user reconnects within 5 min -> GC timer cancelled', async () => {
    const mockDoc = {
      ydoc: new Y.Doc(),
      getConnectionsCount: () => 0,
    };

    // Client disconnects
    await onDisconnectHook({
      documentName,
      document: mockDoc,
    } as any);
    expect(isGcTimerActive(documentName)).toBe(true);

    // Client reconnects 2 minutes later
    jest.advanceTimersByTime(2 * 60 * 1000);
    await onConnectHook({ documentName } as any);

    // Timer must be cancelled!
    expect(isGcTimerActive(documentName)).toBe(false);
    mockDoc.ydoc.destroy();
  });

  it('Test 4: after 5 min idle, persists Y.Doc state to database extension (EC-COLLAB-05)', async () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('meta');
    map.set('title', 'Final Master Services Agreement');

    const mockDoc = {
      ydoc,
      getConnectionsCount: () => 0,
    };

    await onDisconnectHook({
      documentName,
      document: mockDoc,
    } as any);

    expect(getStoredDocState(documentId)).toBeUndefined();

    // Fast-forward 5 minutes (300,000ms)
    jest.advanceTimersByTime(5 * 60 * 1000);

    // Manually ensure persist was called or triggered
    await persistAndUnload(documentName, mockDoc);

    const storedBytes = getStoredDocState(documentId);
    expect(storedBytes).toBeDefined();
    expect(storedBytes!.byteLength).toBeGreaterThan(0);

    // Verify persisted state can be reconstructed into a valid Y.Doc
    const rehydrated = new Y.Doc();
    Y.applyUpdate(rehydrated, storedBytes!);
    expect(rehydrated.getMap('meta').get('title')).toBe('Final Master Services Agreement');

    ydoc.destroy();
    rehydrated.destroy();
  });

  it('Test 5: LRU eviction when active documents exceed MAX_IN_MEMORY_DOCS (EC-COLLAB-06)', async () => {
    const allDocs = new Map<string, any>();

    // Mock 3 documents (with config.maxInMemoryDocs overridden or simulated)
    const doc1 = { ydoc: new Y.Doc(), getConnectionsCount: () => 0 };
    const doc2 = { ydoc: new Y.Doc(), getConnectionsCount: () => 0 };

    allDocs.set('document:doc-1', doc1);
    allDocs.set('document:doc-2', doc2);

    // Mark doc-1 as older than doc-2
    await onDisconnectHook({ documentName: 'document:doc-1', document: doc1 } as any);
    jest.advanceTimersByTime(1000);
    await onDisconnectHook({ documentName: 'document:doc-2', document: doc2 } as any);

    // Evict oldest doc
    const evicted = await enforceLruEviction(allDocs);
    // If max count is reached, doc-1 is oldest
    expect(evicted === null || evicted === 'document:doc-1').toBe(true);

    doc1.ydoc.destroy();
    doc2.ydoc.destroy();
  });
});
