import path from 'node:path';
import type { AudioTranscriber, Chunker, DocumentLoader, Embedder, MemoryStore, VectorStore, WebLoader } from '../domain/ports.js';
import type { IngestSummary } from '../domain/models.js';
import { DocumentChunk } from '../domain/models.js';
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

  // ─── FIXED: sourceId is now stable and matches what is stored in the vector DB ───

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

    // FIX: sourceId is prefixed, session-scoped, and stable — matches filter in vector DB
    const sourceId = `text::${input.title}::${input.sessionId}`;

    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
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
      },
    });

    return {
      id: sourceId,       // ← FIXED: matches source_id in Milvus
      name: input.title,
      sourceType: 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestFile(input: { userId: string; sessionId: string; filePath: string; displayName?: string }): Promise<IngestSummary> {
    const chunks = await this.documentLoader.load(input.filePath);
    const sourceName = input.displayName ?? path.basename(input.filePath);

    // FIX: stable ID derived from name + session, not from a deleted temp path
    const sourceId = `file::${sourceName}::${input.sessionId}`;

    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
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
      },
    });

    return {
      id: sourceId,       // ← FIXED: stable, matches source_id in Milvus
      name: sourceName,
      sourceType: chunks[0]?.sourceType ?? 'txt',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestUrl(input: { userId: string; sessionId: string; url: string }): Promise<IngestSummary> {
    const chunks = await this.webLoader.load(input.url);
    const urlSourceName = chunks[0]?.sourceFile ?? new URL(input.url).hostname;

    // FIX: use the URL itself as the stable identifier (the display name can be ambiguous)
    const sourceId = `url::${input.url}::${input.sessionId}`;

    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
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
      },
    });

    return {
      id: sourceId,       // ← FIXED: matches source_id in Milvus
      name: urlSourceName,
      sourceType: 'web',
      chunkCount: chunks.length,
      vectorIds,
      warnings,
    };
  }

  public async ingestAudio(input: { userId: string; sessionId: string; filePath: string }): Promise<IngestSummary> {
    const chunks = await this.audioTranscriber.transcribe(input.filePath);
    const audioName = path.basename(input.filePath);
    const sourceId = `audio::${audioName}::${input.sessionId}`;

    const { vectorIds, warnings } = await this.embedAndStore(chunks, {
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
      },
    });

    return {
      id: sourceId,
      name: audioName,
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
    metadata: { sourceType: 'file' | 'url' | 'audio'; sourceName: string; sessionId?: string; sourceId: string },
  ): Promise<{ vectorIds: string[]; warnings: string[] }> {
    const warnings: string[] = [];

    // Stamp every chunk with the stable sourceId in its metadata
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
