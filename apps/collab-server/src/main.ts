/**
 * Collab Server Main Entrypoint
 * Blueprint References: §8, §16
 */
import { createHocuspocusServer } from './hocuspocus.server';
import { config } from './config';

async function bootstrap() {
  const server = createHocuspocusServer();

  await server.listen();
  console.log(
    `[CollabServer] PactIntel Hocuspocus Collab Server listening on port ${config.port} (${config.env})`,
  );
}

bootstrap().catch((err) => {
  console.error('[CollabServer] Fatal error during bootstrap:', err);
  process.exit(1);
});
