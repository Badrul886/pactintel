/**
 * Collab Server onConnect Hook
 * Blueprint References: §8, §16
 */
import { onConnectPayload } from '@hocuspocus/server';
import { touchDocumentActivity } from './on-disconnect.hook';

export const onConnectHook = async (data: onConnectPayload): Promise<void> => {
  const { documentName } = data;

  // Reconnecting or new client cancels any pending GC eviction
  touchDocumentActivity(documentName);
};
