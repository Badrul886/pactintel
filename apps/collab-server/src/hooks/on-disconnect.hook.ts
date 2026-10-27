/**
 * Collab Server onDisconnect Hook (RULE COLLAB-003)
 * In-memory Garbage Collection & LRU Eviction
 * Blueprint References: §8, §16, Phase 2 Section 2.2.5 & EC-COLLAB-05..07
 */
import { onDisconnectPayload } from '@hocuspocus/server';
import * as Y from 'yjs';
import { storeYjsState } from '../extensions/database.extension';
import { config } from '../config';

// Map of active GC timers per document
const documentTimers = new Map<string, NodeJS.Timeout>();

// Access timestamps for LRU eviction (EC-COLLAB-06)
const documentLastActive = new Map<string, number>();

export function getActiveGcTimersCount(): number {
  return documentTimers.size;
}

export function isGcTimerActive(documentName: string): boolean {
  return documentTimers.has(documentName);
}

export function clearAllGcTimers(): void {
  for (const timer of documentTimers.values()) {
    clearTimeout(timer);
  }
  documentTimers.clear();
  documentLastActive.clear();
}

/**
 * Called when a client connects or sends an update to refresh activity timestamp
 * and cancel any pending GC eviction.
 */
export function touchDocumentActivity(documentName: string): void {
  documentLastActive.set(documentName, Date.now());

  // If a GC timer was pending because the previous client disconnected, cancel it!
  const pendingTimer = documentTimers.get(documentName);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    documentTimers.delete(documentName);
  }
}

export async function persistAndUnload(documentName: string, document: any): Promise<void> {
  if (!document || !document.ydoc) return;

  try {
    // 1. Serialize complete Y.Doc CRDT binary update
    const state = Y.encodeStateAsUpdate(document.ydoc);

    // 2. Persist to PostgreSQL document_versions.yjs_state
    await storeYjsState(documentName, state);

    // 3. Clean up internal access tracker
    documentLastActive.delete(documentName);
    documentTimers.delete(documentName);

    // Hocuspocus handles unloading document from memory when no connections remain
  } catch (err) {
    console.error(`[CollabGC] Failed to persist and unload document ${documentName}:`, err);
  }
}

/**
 * Enforces LRU memory ceiling if total in-memory documents exceeds MAX_IN_MEMORY_DOCS
 */
export async function enforceLruEviction(allDocs: Map<string, any>): Promise<string | null> {
  if (allDocs.size <= config.maxInMemoryDocs) {
    return null;
  }

  // Find oldest document by last active timestamp that has 0 active connections
  let oldestDocName: string | null = null;
  let oldestTimestamp = Infinity;

  for (const [docName, doc] of allDocs.entries()) {
    const connections =
      typeof doc.getConnectionsCount === 'function' ? doc.getConnectionsCount() : 0;
    if (connections === 0) {
      const lastActive = documentLastActive.get(docName) || 0;
      if (lastActive < oldestTimestamp) {
        oldestTimestamp = lastActive;
        oldestDocName = docName;
      }
    }
  }

  if (oldestDocName) {
    const docToEvict = allDocs.get(oldestDocName);
    await persistAndUnload(oldestDocName, docToEvict);
    return oldestDocName;
  }

  return null;
}

export const onDisconnectHook = async (data: onDisconnectPayload): Promise<void> => {
  const { documentName, document } = data;
  if (!document) return;

  const connectedClients =
    typeof document.getConnectionsCount === 'function' ? document.getConnectionsCount() : 0;

  // Record disconnect time
  documentLastActive.set(documentName, Date.now());

  // RULE COLLAB-003: When the last client disconnects (connectedClients === 0),
  // start the 5-minute GC countdown timer
  if (connectedClients === 0) {
    // Clear any existing timer for this document
    const existing = documentTimers.get(documentName);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      await persistAndUnload(documentName, document);
      documentTimers.delete(documentName);
    }, config.gcTimeoutMs);

    // Don't keep Node process awake in tests
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    documentTimers.set(documentName, timer);
  }
};
