/**
 * Keyset / Cursor Pagination Utilities
 * No offset pagination anywhere in the system (Blueprint D-21, X-49)
 */

export interface CursorPayload {
  id: string;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Encodes a cursor payload into an opaque base64 string.
 */
export const encodeCursor = (payload: CursorPayload): string => {
  const jsonStr = JSON.stringify(payload);
  return Buffer.from(jsonStr, 'utf8').toString('base64url');
};

/**
 * Decodes an opaque base64 cursor string into a typed payload.
 * Returns null if the cursor is malformed or invalid.
 */
export const decodeCursor = <T extends CursorPayload = CursorPayload>(
  cursor?: string | null,
): T | null => {
  if (!cursor) return null;
  try {
    const jsonStr = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Helper to slice query items and compute nextCursor and hasMore flag.
 */
export const buildCursorPage = <T extends { id: string; createdAt?: Date | string }>(
  items: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } => {
  const hasMore = items.length > limit;
  const slicedItems = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  if (hasMore && slicedItems.length > 0) {
    const lastItem = slicedItems[slicedItems.length - 1];
    nextCursor = encodeCursor({
      id: lastItem.id,
      createdAt:
        lastItem.createdAt instanceof Date
          ? lastItem.createdAt.toISOString()
          : (lastItem.createdAt as string),
    });
  }

  return {
    items: slicedItems,
    nextCursor,
    hasMore,
  };
};
