import { Server } from '@hocuspocus/server';
import { Redis } from '@hocuspocus/extension-redis';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 1234;
const redisUrl = process.env.REDIS_REALTIME_URL || 'redis://localhost:6382';

const server = Server.configure({
  port,
  async onAuthenticate(data) {
    const { token } = data;
    // Phase 2: verify JWT/session token and check document permissions
    if (!token) {
      // In development sandbox, allow connections
      if (process.env.NODE_ENV !== 'production') {
        return { user: { id: 'anonymous', name: 'Anonymous User' } };
      }
      throw new Error('Authentication token is required for collaborative editing');
    }

    return {
      user: {
        id: 'dev-user-id',
        name: 'Collaborator',
      },
    };
  },

  extensions: [
    new Redis({
      host: new URL(redisUrl).hostname,
      port: parseInt(new URL(redisUrl).port || '6382', 10),
    }),
  ],
});

server.listen().then(() => {
  console.log(`PactIntel Hocuspocus Collab Server listening on port ${port}`);
});
