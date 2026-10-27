/**
 * Collab Server Content Lock Service (RULE COLLAB-002)
 * Manages queries against the `content_locks` table.
 */
import { config } from '../config';

export interface ContentLockRecord {
  id: string;
  organizationId: string;
  documentId: string;
  blockId: string;
  lockedById: string;
  lockedAt: Date;
}

export class ContentLockService {
  private static mockLocks = new Map<string, ContentLockRecord>();

  static setMockLock(documentId: string, blockId: string, lock: ContentLockRecord | null) {
    const key = `${documentId}:${blockId}`;
    if (lock) {
      this.mockLocks.set(key, lock);
    } else {
      this.mockLocks.delete(key);
    }
  }

  static clearMockLocks() {
    this.mockLocks.clear();
  }

  async findLock(documentId: string, blockId: string): Promise<ContentLockRecord | null> {
    const key = `${documentId}:${blockId}`;
    if (ContentLockService.mockLocks.has(key)) {
      return ContentLockService.mockLocks.get(key) || null;
    }

    // In production, queries API or database directly
    try {
      const res = await fetch(`${config.apiUrl}/api/v1/documents/${documentId}/locks/${blockId}`);
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (!data || !data.lockedById) return null;

      return {
        id: data.id,
        organizationId: data.organizationId,
        documentId: data.documentId,
        blockId: data.blockId,
        lockedById: data.lockedById,
        lockedAt: new Date(data.lockedAt),
      };
    } catch {
      return null;
    }
  }
}

export const contentLockService = new ContentLockService();
