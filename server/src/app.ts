import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { jsonRoutes } from './routes/json-routes.js';
import { createContainer } from './bootstrap.js';
import { AppError } from './errors/app-error.js';
import { logger } from './utils/logger.js';

export const createApp = () => {
  const container = createContainer();
  const app = express();

  app.use(cors({ origin: container.env.corsOrigin, credentials: true }));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((request, response, next) => {
    const requestId = request.header('x-request-id') || crypto.randomUUID();
    response.setHeader('x-request-id', requestId);
    const startedAt = Date.now();

    response.on('finish', () => {
      logger.info('http_request', {
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  });

  app.use('/api', jsonRoutes(container));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) {
      logger.warn('handled_app_error', {
        code: error.code,
        statusCode: error.statusCode,
        error: error.message,
      });

      response.status(error.statusCode).json({
        error: error.userMessage,
        code: error.code,
      });
      return;
    }

    logger.error('unhandled_server_error', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });

    response.status(500).json({
      error: 'Something went wrong on the server. Please try again.',
      code: 'INTERNAL_ERROR',
    });
  });

  return app;
};
