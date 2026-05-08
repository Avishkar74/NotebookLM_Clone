import type { DocumentChunk, EmbeddedChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';
import { logger } from '../../utils/logger.js';

export class ResilientEmbedder implements Embedder {
  constructor(
    private readonly primary: Embedder,
    private readonly fallback: Embedder,
  ) {}

  public async embedDocuments(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]> {
    try {
      return await this.primary.embedDocuments(chunks);
    } catch (error) {
      logger.warn('primary_embed_documents_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
        chunkCount: chunks.length,
      });
      return this.fallback.embedDocuments(chunks);
    }
  }

  public async embedQuery(text: string): Promise<number[]> {
    try {
      return await this.primary.embedQuery(text);
    } catch (error) {
      logger.warn('primary_embed_query_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      return this.fallback.embedQuery(text);
    }
  }

  public async getDimension(): Promise<number> {
    try {
      return await this.primary.getDimension();
    } catch {
      return this.fallback.getDimension();
    }
  }
}
