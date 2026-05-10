import path from 'node:path';
import type { AudioTranscriber, Chunker, DocumentLoader, Embedder, MemoryStore, VectorStore, WebLoader } from '../domain/ports.js';
import type { IngestSummary } from '../domain/models.js';
import { logger } from '../utils/logger.js';

export class IngestionService {
  constructor(
    private readonly documentLoader: DocumentLoader,
    private readonly webLoader: WebLoader,
    private readonly audioTranscriber: AudioTranscriber,
    private readonly embedder: Embedder,
    private readonly vectorStore: VectorStore,
    private readonly memoryStore: MemoryStore,
    private readonly chunker: Chunker,
  ) {}

  public async ingestText(input: { userId: string; sessionId: string; text: string; title: string }): Promise<IngestSummary> {
    const chunks = this.chunker.chunk({
      text: input.text,
      sourceFile: input.title,
      sourceType: 'txt',
      metadata: {
        ingestedAt: new Date().toISOString(),
        isDirectText: true,
      },
    });

    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
      sourceType: 'file',
      sourceName: input.title,
      sessionId: input.sessionId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'text_metadata',
      payload: {
        title: input.title,
        chunkCount: chunks.length,
      },
    });

    return {
      id: `text-${Date.now()}`,
      name: input.title,
      sourceType: 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestFile(input: { userId: string; sessionId: string; filePath: string; displayName?: string }): Promise<IngestSummary> {
    const chunks = await this.documentLoader.load(input.filePath);
    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
      sourceType: 'file',
      sourceName: input.displayName ?? path.basename(input.filePath),
      sessionId: input.sessionId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'document_metadata',
      payload: {
        name: input.displayName ?? path.basename(input.filePath),
        filePath: input.filePath,
        chunkCount: chunks.length,
        sourceType: chunks[0]?.sourceType ?? 'txt',
      },
    });

    return {
      id: input.filePath,
      name: input.displayName ?? path.basename(input.filePath),
      sourceType: chunks[0]?.sourceType ?? 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestUrl(input: { userId: string; sessionId: string; url: string }): Promise<IngestSummary> {
    const chunks = await this.webLoader.load(input.url);
    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
      sourceType: 'url',
      sourceName: input.url,
      sessionId: input.sessionId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'web_metadata',
      payload: {
        url: input.url,
        title: chunks[0]?.sourceFile ?? new URL(input.url).hostname,
        chunkCount: chunks.length,
      },
    });

    return {
      id: input.url,
      name: chunks[0]?.sourceFile ?? new URL(input.url).hostname,
      sourceType: 'web',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestAudio(input: { userId: string; sessionId: string; filePath: string }): Promise<IngestSummary> {
    const chunks = await this.audioTranscriber.transcribe(input.filePath);
    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
      sourceType: 'audio',
      sourceName: path.basename(input.filePath),
      sessionId: input.sessionId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'audio_metadata',
      payload: {
        filePath: input.filePath,
        chunkCount: chunks.length,
        sourceType: 'audio',
      },
    });

    return {
      id: input.filePath,
      name: path.basename(input.filePath),
      sourceType: 'audio',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async previewUrl(url: string): Promise<Record<string, unknown>> {
    return this.webLoader.preview(url);
  }

  private async embedAndStore(
    chunks: Awaited<ReturnType<DocumentLoader['load']>>,
    metadata: { sourceType: 'file' | 'url' | 'audio'; sourceName: string; sessionId?: string },
  ): Promise<{ vectorIds: string[]; warnings: string[] }> {
    const warnings: string[] = [];

    try {
      const embeddedChunks = await this.embedder.embedDocuments(chunks, metadata.sessionId);
      const vectorIds = await this.vectorStore.upsert(embeddedChunks);
      return { vectorIds, warnings };
    } catch (error) {
      logger.warn('ingestion_embedding_or_vector_failed', {
        sourceType: metadata.sourceType,
        sourceName: metadata.sourceName,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      warnings.push('Unable to generate embeddings right now. Source metadata was saved, but retrieval may be limited.');
      return { vectorIds: [], warnings };
    }
  }
}