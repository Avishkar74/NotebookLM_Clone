import type { DocumentChunk, EmbeddedChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';
import { logger } from '../../utils/logger.js';

export class ResilientEmbedder implements Embedder {
  private lastDocumentEmbedder: 'primary' | 'fallback' | null = null;

  constructor(
    private readonly primary: Embedder,
    private readonly fallback: Embedder,
  ) {}

  public async embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]> {
    try {
      const result = await this.primary.embedDocuments(chunks, sessionId);
      this.lastDocumentEmbedder = 'primary';
      return result;
    } catch (error) {
      logger.warn('primary_embed_documents_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
        chunkCount: chunks.length,
      });
      this.lastDocumentEmbedder = 'fallback';
      return this.fallback.embedDocuments(chunks, sessionId);
    }
  }

  public async embedQuery(text: string): Promise<number[]> {
    try {
      const result = await this.primary.embedQuery(text);
      if (this.lastDocumentEmbedder === 'fallback') {
        // FIXED: Hard switch to fallback if docs used it, otherwise similarity is 0
        logger.warn('embedder_mismatch_forcing_fallback_for_query_consistency');
        return this.fallback.embedQuery(text);
      }
      return result;
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

  public getStatus(): 'primary' | 'fallback' {
    return this.lastDocumentEmbedder || 'primary';
  }
}

