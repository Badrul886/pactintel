/**
 * Collab Server onUpdate Hook (RULE COLLAB-002)
 * Server-side Content Lock Enforcement
 * Blueprint References: §8, §16, Phase 2 Section 2.2.4 & EC-COLLAB-01..09
 */
import * as Y from 'yjs';
import { contentLockService } from '../services/content-lock.service';
import { CollabConnectionContext } from './on-authenticate.hook';

export interface OnUpdateData {
  update: Uint8Array;
  connection?: any;
  document?: any;
  documentName?: string;
  context?: any;
}

export function extractModifiedBlockIds(update: Uint8Array, _doc?: Y.Doc): string[] {
  const tempDoc = new Y.Doc();
  try {
    Y.applyUpdate(tempDoc, update);
    const modifiedBlockIds = new Set<string>();

    // 1. Check direct 'blocks' Map
    const blocksMap = tempDoc.getMap('blocks');
    for (const key of blocksMap.keys()) {
      modifiedBlockIds.add(key);
    }

    // 2. Check block-locks metadata if passed
    const locksMap = tempDoc.getMap('locks');
    for (const key of locksMap.keys()) {
      modifiedBlockIds.add(key);
    }

    // 3. Inspect XML Fragment for nodes with block-id attribute
    const fragment = tempDoc.getXmlFragment('default');
    const inspectXmlNode = (node: any) => {
      if (node && typeof node.getAttribute === 'function') {
        const blockId = node.getAttribute('data-block-id') || node.getAttribute('id');
        if (blockId) modifiedBlockIds.add(blockId);
      }
      if (node && Array.isArray(node.toArray?.())) {
        for (const child of node.toArray()) {
          inspectXmlNode(child);
        }
      }
    };
    inspectXmlNode(fragment);

    return Array.from(modifiedBlockIds);
  } catch (err) {
    console.error('[CollabUpdate] Error extracting modified blocks from update:', err);
    return [];
  } finally {
    tempDoc.destroy();
  }
}

export const onUpdateHook = async (data: OnUpdateData): Promise<void> => {
  const { update, connection, document, context: payloadContext } = data;
  const context = (connection?.context || payloadContext) as CollabConnectionContext | undefined;

  // 1. If connection is flagged read-only, reject immediately
  if (connection?.readOnly || context?.readOnly) {
    throw new Error('Forbidden: document is in read-only mode');
  }

  if (!context) {
    // Unauthenticated update attempt
    throw new Error('Unauthorized: missing connection context');
  }

  const { userId, documentId, isContentAdmin } = context;

  // 2. Decode modified block IDs from incoming Yjs binary update
  const modifiedBlockIds = extractModifiedBlockIds(update, document?.ydoc);

  // 3. Verify each modified block against server-side content_locks
  for (const blockId of modifiedBlockIds) {
    const lock = await contentLockService.findLock(documentId, blockId);
    if (!lock) {
      continue; // Block is not locked -> mutation permitted
    }

    const isLocker = lock.lockedById === userId;

    // RULE COLLAB-002: Only the lock owner or an organization content admin/manager may edit
    if (!isLocker && !isContentAdmin) {
      // Reject update: Hocuspocus aborts broadcast, client Yjs rolls back (EC-COLLAB-09)
      throw new Error(`Block ${blockId} is locked by another user`);
    }
  }
};
