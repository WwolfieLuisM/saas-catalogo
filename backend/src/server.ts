import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { closePrisma } from './config/database.js';
import { getEnv } from './config/env.js';
import { logger } from './utils/logger.js';

const env = getEnv();
const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'server started');
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    void closePrisma().finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
