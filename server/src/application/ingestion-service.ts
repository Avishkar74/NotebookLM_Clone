import path from 'node:path';
import type { AudioTranscriber, Chunker, DocumentLoader, Embedder, MemoryStore, VectorStore, WebLoader } from '../domain/ports.js';
import { DocumentChunk, SourceState } from '../domain/models.js';
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

    const sourceId = `text::${input.title}::${input.sessionId}`;

    const { vectorIds, warnings, state } = await this.embedAndStore(chunks, {
      sourceType: 'file',
      sourceName: input.title,
      sessionId: input.sessionId,
      sourceId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'text_metadata',
      payload: {
        sourceId,
        title: input.title,
        chunkCount: chunks.length,
        state,
      },
    });

    return {
      id: sourceId,
      name: input.title,
      sourceType: 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
      state,
    };
  }

  public async ingestFile(input: { userId: string; sessionId: string; filePath: string; displayName?: string }): Promise<IngestSummary> {
    const chunks = await this.documentLoader.load(input.filePath);
    const sourceName = input.displayName ?? path.basename(input.filePath);
    const sourceId = `file::${sourceName}::${input.sessionId}`;

    const { vectorIds, warnings, state } = await this.embedAndStore(chunks, {
      sourceType: 'file',
      sourceName,
      sessionId: input.sessionId,
      sourceId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'document_metadata',
      payload: {
        sourceId,
        name: sourceName,
        chunkCount: chunks.length,
        sourceType: chunks[0]?.sourceType ?? 'txt',
        state,
      },
    });

    return {
      id: sourceId,
      name: sourceName,
      sourceType: chunks[0]?.sourceType ?? 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
      state,
    };
  }

  public async ingestUrl(input: { userId: string; sessionId: string; url: string }): Promise<IngestSummary> {
    const chunks = await this.webLoader.load(input.url);
    const urlSourceName = chunks[0]?.sourceFile ?? new URL(input.url).hostname;
    const sourceId = `url::${input.url}::${input.sessionId}`;

    const { vectorIds, warnings, state } = await this.embedAndStore(chunks, {
      sourceType: 'url',
      sourceName: urlSourceName,
      sessionId: input.sessionId,
      sourceId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'web_metadata',
      payload: {
        sourceId,
        url: input.url,
        title: urlSourceName,
        chunkCount: chunks.length,
        state,
      },
    });

    return {
      id: sourceId,
      name: urlSourceName,
      sourceType: 'web',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
      state,
    };
  }

  public async ingestAudio(input: { userId: string; sessionId: string; filePath: string }): Promise<IngestSummary> {
    const chunks = await this.audioTranscriber.transcribe(input.filePath);
    const audioName = path.basename(input.filePath);
    const sourceId = `audio::${audioName}::${input.sessionId}`;

    const { vectorIds, warnings, state } = await this.embedAndStore(chunks, {
      sourceType: 'audio',
      sourceName: audioName,
      sessionId: input.sessionId,
      sourceId,
    });

    await this.memoryStore.saveMetadata({
      userId: input.userId,
      sessionId: input.sessionId,
      label: 'audio_metadata',
      payload: {
        sourceId,
        name: audioName,
        chunkCount: chunks.length,
        sourceType: 'audio',
        state,
      },
    });

    return {
      id: sourceId,
      name: audioName,
      sourceType: 'audio',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
      state,
    };
  }

  public async previewUrl(url: string): Promise<Record<string, unknown>> {
    return this.webLoader.preview(url);
  }

  private async embedAndStore(
    chunks: Awaited<ReturnType<DocumentLoader['load']>>,
    metadata: { sourceType: 'file' | 'url' | 'audio'; sourceName: string; sessionId?: string; sourceId: string },
  ): Promise<{ vectorIds: string[]; warnings: string[]; state: SourceState }> {
    const warnings: string[] = [];

    const stampedChunks = chunks.map(
      (chunk) =>
        new DocumentChunk(
          chunk.content,
          chunk.sourceFile,
          chunk.sourceType,
          chunk.pageNumber,
          chunk.chunkIndex,
          chunk.startChar,
          chunk.endChar,
          { ...chunk.metadata, sourceId: metadata.sourceId },
          chunk.chunkId,
        ),
    );

    try {
      const embeddedChunks = await this.embedder.embedDocuments(stampedChunks, metadata.sessionId);
      const vectorIds = await this.vectorStore.upsert(embeddedChunks);
      return { vectorIds, warnings, state: SourceState.RETRIEVAL_READY };
    } catch (error) {
      logger.error('ingestion_embedding_or_vector_failed', {
        sourceType: metadata.sourceType,
        sourceName: metadata.sourceName,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      // CRITICAL: return EMBEDDING_FAILED state so frontend can disable querying
      return {
        vectorIds: [],
        warnings: ['Unable to generate embeddings right now. Source metadata was saved, but retrieval may be limited.'],
        state: SourceState.EMBEDDING_FAILED,
      };
    }
  }
}