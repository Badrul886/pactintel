/**
 * Hocuspocus WebSocket Server Factory
 * Blueprint References: §8, §16, Phase 2 Section 2.2.1
 */
import { Server, Extension } from '@hocuspocus/server';
import { createRedisExtension } from './extensions/redis.extension';
import { createDatabaseExtension } from './extensions/database.extension';
import { onAuthenticateHook } from './hooks/on-authenticate.hook';
import { onConnectHook } from './hooks/on-connect.hook';
import { onUpdateHook } from './hooks/on-update.hook';
import { onDisconnectHook } from './hooks/on-disconnect.hook';
import { config } from './config';

/**
 * Content Locking Extension (RULE COLLAB-002)
 * Intercepts incoming messages before processing to enforce block locks.
 */
class ContentLockExtension implements Extension {
  extensionName = 'content-lock';

  async beforeHandleMessage(data: any): Promise<any> {
    if (data.update && data.update.byteLength > 0) {
      await onUpdateHook(data);
    }
  }
}

export function createHocuspocusServer() {
  const extensions: Extension[] = [];

  const redisExt = createRedisExtension();
  if (redisExt) {
    extensions.push(redisExt);
  }

  const dbExt = createDatabaseExtension();
  extensions.push(dbExt);

  extensions.push(new ContentLockExtension());

  return Server.configure({
    name: 'pactintel-collab',
    port: config.port,
    timeout: 30000,
    maxDebounce: 1000,
    debounce: 2000,
    extensions,
    onAuthenticate: onAuthenticateHook,
    onConnect: onConnectHook,
    onDisconnect: onDisconnectHook,
  });
}
