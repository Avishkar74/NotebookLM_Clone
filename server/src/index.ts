import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

process.on('uncaughtException', (error) => {
  logger.error('process_uncaught_exception', {
    error: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('process_unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

try {
  logger.info('server_booting', { port: env.port, corsOrigin: env.corsOrigin });
  const app = createApp();

  app.listen(env.port, () => {
    logger.info('server_listening', { url: `http://localhost:${env.port}` });
  });
} catch (error) {
  logger.error('server_failed_to_start', {
    error: error instanceof Error ? error.message : 'unknown_error',
  });
  process.exit(1);
}
