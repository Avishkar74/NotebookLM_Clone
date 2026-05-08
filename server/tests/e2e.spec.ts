import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { jsonRoutes } from '../src/routes/json-routes.js';
import type { AppContainer } from '../src/bootstrap.js';
import { DocumentChunk, EmbeddedChunk } from '../src/domain/models.js';
import { IngestionService } from '../src/application/ingestion-service.js';
import { RagPipeline } from '../src/application/rag-pipeline.js';

class FakeDocumentLoader {
  async load(filePath: string) {
    return [new DocumentChunk(`loaded:${path.basename(filePath)}`, path.basename(filePath), 'txt')];
  }
}

class FakeWebLoader {
  async load(url: string) {
    return [new DocumentChunk(`web:${url}`, new URL(url).hostname, 'web')];
  }

  async preview(url: string) {
    return { url, title: 'Preview' };
  }
}

class FakeAudioTranscriber {
  async transcribe(filePath: string) {
    return [new DocumentChunk(`audio:${path.basename(filePath)}`, path.basename(filePath), 'audio')];
  }
}

class FakeEmbedder {
  async embedDocuments(chunks: DocumentChunk[]) {
    return chunks.map((chunk) => new EmbeddedChunk(chunk, [1, 2, 3], 'fake-embedder'));
  }

  async embedQuery() {
    return [1, 2, 3];
  }

  async getDimension() {
    return 3;
  }
}

class FakeVectorStore {
  private readonly records = new Map<string, Record<string, unknown>>();

  async ensureCollection() {}

  async upsert(chunks: EmbeddedChunk[]) {
    const ids: string[] = [];
    for (const chunk of chunks) {
      const record = chunk.toVectorRecord();
      this.records.set(String(record.id), record);
      ids.push(String(record.id));
    }
    return ids;
  }

  async search() {
    return Array.from(this.records.values()).map((record) => ({
      id: String(record.id),
      score: 0.9,
      content: String(record.content),
      citation: {
        sourceFile: String(record.source_file),
        sourceType: String(record.source_type) as 'pdf' | 'txt' | 'md' | 'web' | 'audio',
        pageNumber: null,
        chunkIndex: Number(record.chunk_index),
        startChar: null,
        endChar: null,
      },
      metadata: {},
      embeddingModel: String(record.embedding_model),
    }));
  }

  async getById(id: string) {
    return this.records.get(id) ?? null;
  }

  async clear() {
    this.records.clear();
  }
}

class FakeLlmClient {
  async generate(prompt: string) {
    return `LLM:${prompt.slice(0, 80)}`;
  }
}

class FakeMemoryStore {
  public turns: Array<{ query: string; response: string }> = [];
  async ensureSession() {}
  async saveTurn(input: { query: string; response: string }) {
    this.turns.push({ query: input.query, response: input.response });
  }
  async saveMetadata() {}
  async getContext() {
    return this.turns.map((turn) => `${turn.query} -> ${turn.response}`).join('\n');
  }
  async searchRelevant() {
    return [];
  }
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'notebooklm-'));

const container: AppContainer = {
  env: {
    port: 4000,
    corsOrigin: '*',
    geminiApiKey: 'fake',
    milvusUri: 'fake',
    milvusToken: 'fake',
    assemblyAiApiKey: 'fake',
    firecrawlApiKey: 'fake',
    zepApiKey: 'fake',
    defaultUserId: 'user-1',
    defaultSessionId: 'session-1',
    defaultUserName: 'Test User',
  },
  documentLoader: new FakeDocumentLoader() as unknown as AppContainer['documentLoader'],
  webLoader: new FakeWebLoader() as unknown as AppContainer['webLoader'],
  audioTranscriber: new FakeAudioTranscriber() as unknown as AppContainer['audioTranscriber'],
  embedder: new FakeEmbedder() as unknown as AppContainer['embedder'],
  llmClient: new FakeLlmClient() as unknown as AppContainer['llmClient'],
  memoryStore: new FakeMemoryStore() as unknown as AppContainer['memoryStore'],
  vectorStore: new FakeVectorStore() as unknown as AppContainer['vectorStore'],
  ingestionService: undefined as unknown as AppContainer['ingestionService'],
  ragPipeline: undefined as unknown as AppContainer['ragPipeline'],
};

container.ingestionService = new IngestionService(
  container.documentLoader,
  container.webLoader,
  container.audioTranscriber,
  container.embedder,
  container.vectorStore,
  container.memoryStore,
);

container.ragPipeline = new RagPipeline(
  container.embedder,
  container.vectorStore,
  container.llmClient,
  container.memoryStore,
);

beforeEach(() => {
  container.memoryStore = new FakeMemoryStore() as unknown as AppContainer['memoryStore'];
  container.ingestionService = new IngestionService(
    container.documentLoader,
    container.webLoader,
    container.audioTranscriber,
    container.embedder,
    container.vectorStore,
    container.memoryStore,
  );
  container.ragPipeline = new RagPipeline(
    container.embedder,
    container.vectorStore,
    container.llmClient,
    container.memoryStore,
  );
});

describe('NotebookLM API', () => {
  it('ingests a file and answers a question end to end', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', jsonRoutes(container));

    const filePath = path.join(tmpDir, 'example.txt');
    await fs.writeFile(filePath, 'NotebookLM clone testing content.');

    const ingest = await request(app).post('/api/ingest/file').attach('file', filePath).field('userId', 'user-1').field('sessionId', 'session-1');
    expect(ingest.status).toBe(200);
    expect(ingest.body.chunkCount).toBe(1);

    const query = await request(app).post('/api/query').send({ query: 'What is this about?', userId: 'user-1', sessionId: 'session-1' });
    expect(query.status).toBe(200);
    expect(query.body.response).toContain('LLM:');
    expect(query.body.sourcesUsed.length).toBeGreaterThan(0);
  });

  it('ingests a url and returns a preview', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', jsonRoutes(container));

    const preview = await request(app).get('/api/ingest/url/preview').query({ url: 'https://example.com' });
    expect(preview.status).toBe(200);
    expect(preview.body.url).toBe('https://example.com');

    const ingest = await request(app).post('/api/ingest/url').send({ url: 'https://example.com', userId: 'user-1', sessionId: 'session-1' });
    expect(ingest.status).toBe(200);
    expect(ingest.body.sourceType).toBe('web');
  });
});
