import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB, ensureIndexes } from './config/db.js';
import { logger } from './utils/logger.js';
import { startScheduler } from './jobs/index.js';

let server;

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', err);
    process.exit(1);
  }
};

const start = async () => {
  await connectDB();
  await ensureIndexes();
  startScheduler();
  server = app.listen(env.PORT, () => {
    logger.info(`StayOS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
  shutdown('unhandledRejection');
});

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
