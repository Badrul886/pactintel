/**
 * Collab Server Database Extension
 * Persists Y.Doc state binary to `document_versions.yjs_state` in PostgreSQL.
 * Blueprint References: §8, §16, Phase 2 Section 2.2.2
 */
import { Database } from '@hocuspocus/extension-database';
import { config } from '../config';

// In-memory state cache for fast lookups & testing
const inMemoryDocState = new Map<string, Uint8Array>();

export async function fetchYjsState(documentName: string): Promise<Uint8Array | null> {
  const documentId = documentName.replace('document:', '');

  // 1. Check in-memory store (or tests)
  if (inMemoryDocState.has(documentId)) {
    return inMemoryDocState.get(documentId) || null;
  }

  // In unit test environment, return null if not in memory (do not attempt network fetch)
  if (process.env.NODE_ENV === 'test' || config.env === 'test') {
    return null;
  }

  // 2. Query internal API or PostgreSQL
  try {
    const res = await fetch(`${config.apiUrl}/api/v1/documents/${documentId}/yjs-state`);
    if (!res.ok) {
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;

    const uint8 = new Uint8Array(arrayBuffer);
    inMemoryDocState.set(documentId, uint8);
    return uint8;
  } catch {
    // If not reachable (e.g. initial doc creation), return null to start fresh
    return null;
  }
}

export async function storeYjsState(documentName: string, state: Uint8Array): Promise<void> {
  const documentId = documentName.replace('document:', '');

  // Always update in-memory cache
  inMemoryDocState.set(documentId, state);

  // In unit test environment, in-memory cache is sufficient (no live HTTP API needed)
  if (process.env.NODE_ENV === 'test' || config.env === 'test') {
    return;
  }

  // Persist to API / database
  try {
    await fetch(`${config.apiUrl}/api/v1/documents/${documentId}/yjs-state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(state),
    });
  } catch (err) {
    console.error(`[CollabDB] Failed to persist yjs_state for ${documentId}:`, err);
  }
}

export function createDatabaseExtension(): Database {
  return new Database({
    fetch: async ({ documentName }) => {
      return await fetchYjsState(documentName);
    },
    store: async ({ documentName, state }) => {
      await storeYjsState(documentName, state);
    },
  });
}

/** Helper for test verification */
export function getStoredDocState(documentId: string): Uint8Array | undefined {
  return inMemoryDocState.get(documentId);
}

export function clearStoredDocStates(): void {
  inMemoryDocState.clear();
}
