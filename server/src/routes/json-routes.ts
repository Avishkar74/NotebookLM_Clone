import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppContainer } from '../bootstrap.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../errors/app-error.js';

const upload = multer({ storage: multer.memoryStorage() });

export const jsonRoutes = (container: AppContainer) => {
  const router = Router();

  router.get('/health', async (_request, response) => {
    let embeddingStatus: 'up' | 'degraded' = 'up';
    let embeddingDimensions = 0;

    try {
      embeddingDimensions = (await container.embedder.getDimension()) || 0;
    } catch {
      embeddingStatus = 'degraded';
    }

    response.json({
      ok: true,
      services: {
        llm: 'up',
        embedding: embeddingStatus,
        vectorStore: container.vectorStore.constructor.name,
      },
      embeddingDimensions,
    });
  });

  router.post('/ingest/file', upload.single('file'), async (request, response, next) => {
    let tempPath = '';
    try {
      if (!request.file) {
        response.status(400).json({ error: 'file is required' });
        return;
      }

      const userId = String(request.body.userId ?? container.env.defaultUserId);
      const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);
      const displayName = request.body.displayName ? String(request.body.displayName) : request.file.originalname;

      tempPath = path.join(os.tmpdir(), `${Date.now()}-${request.file.originalname}`);
      await fs.writeFile(tempPath, request.file.buffer);

      await container.memoryStore.ensureSession({ userId, sessionId, userName: container.env.defaultUserName });
      const result = await container.ingestionService.ingestFile({ userId, sessionId, filePath: tempPath, displayName });
      response.json(result);
    } catch (error) {
      next(new AppError('file_ingestion_failed', 500, 'INGESTION_FAILED', 'Source ingestion failed. Please try again.'));
      logger.warn('route_ingest_file_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    } finally {
      if (tempPath) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
      }
    }
  });

  router.post('/ingest/url', async (request, response, next) => {
    try {
      const url = String(request.body.url ?? '');
      if (!url) {
        response.status(400).json({ error: 'url is required' });
        return;
      }

      const userId = String(request.body.userId ?? container.env.defaultUserId);
      const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);

      await container.memoryStore.ensureSession({ userId, sessionId, userName: container.env.defaultUserName });
      const result = await container.ingestionService.ingestUrl({ userId, sessionId, url });
      response.json(result);
    } catch (error) {
      next(new AppError('url_ingestion_failed', 500, 'INGESTION_FAILED', 'Source ingestion failed. Please try again.'));
      logger.warn('route_ingest_url_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  });

  router.post('/ingest/audio', upload.single('file'), async (request, response, next) => {
    let tempPath = '';
    try {
      if (!request.file) {
        response.status(400).json({ error: 'file is required' });
        return;
      }

      const userId = String(request.body.userId ?? container.env.defaultUserId);
      const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);

      tempPath = path.join(os.tmpdir(), `${Date.now()}-${request.file.originalname}`);
      await fs.writeFile(tempPath, request.file.buffer);

      await container.memoryStore.ensureSession({ userId, sessionId, userName: container.env.defaultUserName });
      const result = await container.ingestionService.ingestAudio({ userId, sessionId, filePath: tempPath });
      response.json(result);
    } catch (error) {
      next(new AppError('audio_ingestion_failed', 500, 'INGESTION_FAILED', 'Audio ingestion failed. Please try again.'));
      logger.warn('route_ingest_audio_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    } finally {
      if (tempPath) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
      }
    }
  });

  router.get('/ingest/url/preview', async (request, response, next) => {
    try {
      const url = String(request.query.url ?? '');
      if (!url) {
        response.status(400).json({ error: 'url is required' });
        return;
      }

      response.json(await container.ingestionService.previewUrl(url));
    } catch (error) {
      logger.warn('route_query_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      next(new AppError('query_failed', 500, 'QUERY_FAILED', 'Unable to generate a response right now.'));
    }
  });

  router.get('/diagnostics/embedding', async (_request, response) => {
    const probeText = 'embedding diagnostics probe';

    try {
      const vector = await container.embedder.embedQuery(probeText);
      response.json({
        ok: true,
        dimensions: vector.length,
        message: 'Embedding service is available.',
      });
    } catch (error) {
      logger.warn('embedding_diagnostics_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      response.status(200).json({
        ok: false,
        dimensions: 0,
        message: 'Embedding service is unavailable. Fallback mode is active.',
      });
    }
  });

  router.post('/query', async (request, response, next) => {
    try {
      const query = String(request.body.query ?? '');
      const userId = String(request.body.userId ?? container.env.defaultUserId);
      const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);
      const topK = Number(request.body.topK ?? 10);

      await container.memoryStore.ensureSession({ userId, sessionId, userName: container.env.defaultUserName });
      const result = await container.ragPipeline.answer({ userId, sessionId, query, topK });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/sources/:id', async (request, response, next) => {
    try {
      const source = await container.vectorStore.getById(request.params.id);
      if (!source) {
        response.status(404).json({ error: 'source not found' });
        return;
      }

      response.json(source);
    } catch (error) {
      next(error);
    }
  });

  router.get('/session/:sessionId/context', async (request, response, next) => {
    try {
      const userId = String(request.query.userId ?? container.env.defaultUserId);
      response.json({ context: await container.memoryStore.getContext({ userId, sessionId: request.params.sessionId }) });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
